import type { Pool } from 'pg';
import type { Logger } from '@job-scheduler/shared';
import { executeJob, JobTimeoutError } from './executor';
import { claimJobs, type ClaimedJobRow } from './claim';
import { handleJobFailure } from './failureHandler';
import type { RetryPolicyConfig } from './retry';

interface QueueRow {
  id: string;
  concurrency_limit: number;
  priority: number;
  strategy: RetryPolicyConfig['strategy'];
  base_delay_ms: number;
  max_delay_ms: number;
  multiplier: number;
  max_retries: number;
}

export interface PollerOptions {
  pool: Pool;
  workerId: string;
  concurrency: number;
  pollIntervalMs: number;
  jobTimeoutMs: number;
  logger: Logger;
}

export class Poller {
  private timer?: NodeJS.Timeout;
  private draining = false;
  private inFlight = new Map<string, Promise<void>>();

  constructor(private opts: PollerOptions) {}

  get activeJobCount(): number {
    return this.inFlight.size;
  }

  start(): void {
    this.timer = setInterval(() => void this.tick(), this.opts.pollIntervalMs);
    this.timer.unref?.();
  }

  /** Stops claiming new jobs; in-flight jobs are left running (see drain()). */
  stopClaiming(): void {
    this.draining = true;
    if (this.timer) clearInterval(this.timer);
  }

  async drain(timeoutMs: number): Promise<void> {
    const inFlightPromises = Array.from(this.inFlight.values());
    if (inFlightPromises.length === 0) return;
    await Promise.race([
      Promise.allSettled(inFlightPromises),
      new Promise<void>((resolve) => setTimeout(resolve, timeoutMs)),
    ]);
  }

  private async tick(): Promise<void> {
    if (this.draining) return;
    try {
      let localAvailable = this.opts.concurrency - this.inFlight.size;
      if (localAvailable <= 0) return;

      const queuesResult = await this.opts.pool.query<QueueRow>(
        `SELECT q.id, q.concurrency_limit, q.priority,
                rp.strategy, rp.base_delay_ms, rp.max_delay_ms, rp.multiplier, rp.max_retries
         FROM queues q
         JOIN retry_policies rp ON rp.id = q.retry_policy_id
         WHERE q.is_paused = false
         ORDER BY q.priority DESC`,
      );

      for (const queue of queuesResult.rows) {
        if (localAvailable <= 0) break;

        const inFlightResult = await this.opts.pool.query<{ count: string }>(
          `SELECT count(*) FROM jobs WHERE queue_id = $1 AND status IN ('claimed', 'running')`,
          [queue.id],
        );
        const queueInFlight = Number(inFlightResult.rows[0].count);
        const queueRemaining = queue.concurrency_limit - queueInFlight;
        const claimLimit = Math.min(localAvailable, queueRemaining);
        if (claimLimit <= 0) continue;

        const retryPolicy: RetryPolicyConfig = {
          strategy: queue.strategy,
          baseDelayMs: queue.base_delay_ms,
          maxDelayMs: queue.max_delay_ms,
          multiplier: Number(queue.multiplier),
          maxRetries: queue.max_retries,
        };

        const claimed = await claimJobs(this.opts.pool, queue.id, this.opts.workerId, claimLimit, this.opts.logger);
        for (const job of claimed) {
          localAvailable -= 1;
          const jobPromise = this.runJob(job, retryPolicy).finally(() => this.inFlight.delete(job.id));
          this.inFlight.set(job.id, jobPromise);
        }
      }
    } catch (err) {
      this.opts.logger.error({ err }, 'poll tick failed');
    }
  }

  private async runJob(job: ClaimedJobRow, retryPolicy: RetryPolicyConfig): Promise<void> {
    const pool = this.opts.pool;
    try {
      await pool.query(`UPDATE jobs SET status = 'running', started_at = now(), updated_at = now() WHERE id = $1`, [
        job.id,
      ]);
      await pool.query(
        `INSERT INTO job_executions (job_id, attempt_number, from_status, to_status, worker_id, reason)
         VALUES ($1, $2, 'claimed', 'running', $3, 'started')`,
        [job.id, job.retry_count + 1, this.opts.workerId],
      );

      await executeJob(job.payload, this.opts.jobTimeoutMs);

      await pool.query(
        `UPDATE jobs SET status = 'completed', completed_at = now(), updated_at = now() WHERE id = $1`,
        [job.id],
      );
      await pool.query(
        `INSERT INTO job_executions (job_id, attempt_number, from_status, to_status, worker_id, reason)
         VALUES ($1, $2, 'running', 'completed', $3, 'handler_success')`,
        [job.id, job.retry_count + 1, this.opts.workerId],
      );
      this.opts.logger.info({ jobId: job.id }, 'job completed');
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      const reason = err instanceof JobTimeoutError ? 'timeout' : 'handler_error';
      try {
        await handleJobFailure(pool, job, retryPolicy, this.opts.workerId, message, reason);
        this.opts.logger.warn({ jobId: job.id }, 'job failed');
      } catch (failureErr) {
        // Never let a secondary error here escape as an unhandled rejection and
        // crash the whole worker process -- one job's bookkeeping failure must
        // not take down every other in-flight job.
        this.opts.logger.error({ jobId: job.id, err: failureErr }, 'failed to record job failure');
      }
    }
  }
}
