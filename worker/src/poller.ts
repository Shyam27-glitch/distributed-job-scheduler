import type { Pool } from 'pg';
import type { Logger } from '@job-scheduler/shared';
import { executeJob, JobTimeoutError } from './executor';
import { computeRetryDelayMs, type RetryPolicyConfig } from './retry';

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

interface ClaimedJobRow {
  id: string;
  queue_id: string;
  payload: Record<string, unknown>;
  retry_count: number;
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

        const claimed = await this.claimJobs(queue.id, claimLimit);
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

  /**
   * The mandatory atomic-claim query: CTE + FOR UPDATE SKIP LOCKED means two workers
   * racing this never lock/return the same row, so a job is never claimed twice.
   */
  private async claimJobs(queueId: string, limit: number): Promise<ClaimedJobRow[]> {
    const client = await this.opts.pool.connect();
    try {
      await client.query('BEGIN');
      const result = await client.query<ClaimedJobRow>(
        `WITH candidate AS (
           SELECT id FROM jobs
           WHERE queue_id = $1 AND status = 'queued' AND run_at <= now()
           ORDER BY priority DESC, run_at ASC
           LIMIT $2
           FOR UPDATE SKIP LOCKED
         )
         UPDATE jobs
         SET status = 'claimed', claimed_by_worker_id = $3, claimed_at = now(), updated_at = now()
         FROM candidate
         WHERE jobs.id = candidate.id
         RETURNING jobs.id, jobs.queue_id, jobs.payload, jobs.retry_count`,
        [queueId, limit, this.opts.workerId],
      );
      for (const row of result.rows) {
        await client.query(
          `INSERT INTO job_executions (job_id, attempt_number, from_status, to_status, worker_id, reason)
           VALUES ($1, $2, 'queued', 'claimed', $3, 'claimed')`,
          [row.id, row.retry_count + 1, this.opts.workerId],
        );
      }
      await client.query('COMMIT');
      return result.rows;
    } catch (err) {
      await client.query('ROLLBACK');
      this.opts.logger.error({ err, queueId }, 'claim query failed');
      return [];
    } finally {
      client.release();
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
        await this.handleFailure(job, retryPolicy, message, reason);
      } catch (failureErr) {
        // Never let a secondary error here escape as an unhandled rejection and
        // crash the whole worker process -- one job's bookkeeping failure must
        // not take down every other in-flight job.
        this.opts.logger.error({ jobId: job.id, err: failureErr }, 'failed to record job failure');
      }
    }
  }

  private async handleFailure(
    job: ClaimedJobRow,
    retryPolicy: RetryPolicyConfig,
    message: string,
    reason: string,
  ): Promise<void> {
    const pool = this.opts.pool;
    const newRetryCount = job.retry_count + 1;

    if (newRetryCount <= retryPolicy.maxRetries) {
      const delayMs = computeRetryDelayMs(retryPolicy, newRetryCount);
      const nextRunAt = new Date(Date.now() + delayMs);
      await pool.query(
        `UPDATE jobs SET status = 'pending_retry', retry_count = $2, last_error = $3, run_at = $4, updated_at = now()
         WHERE id = $1`,
        [job.id, newRetryCount, message, nextRunAt],
      );
      await pool.query(
        `INSERT INTO job_executions (job_id, attempt_number, from_status, to_status, worker_id, reason, metadata)
         VALUES ($1, $2, 'running', 'pending_retry', $3, $4, $5)`,
        [job.id, newRetryCount, this.opts.workerId, reason, JSON.stringify({ error: message, nextRunAt, delayMs })],
      );
      this.opts.logger.warn({ jobId: job.id, newRetryCount, delayMs }, 'job failed, retry scheduled');
    } else {
      await pool.query(
        `UPDATE jobs SET status = 'dead_lettered', retry_count = $2, last_error = $3, updated_at = now() WHERE id = $1`,
        [job.id, newRetryCount, message],
      );
      await pool.query(
        `INSERT INTO dead_letter_queue (job_id, queue_id, final_error, retry_count, payload_snapshot)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (job_id) DO UPDATE SET
           final_error = EXCLUDED.final_error,
           retry_count = EXCLUDED.retry_count,
           payload_snapshot = EXCLUDED.payload_snapshot,
           resolved = false,
           resolved_at = NULL,
           moved_at = now()`,
        [job.id, job.queue_id, message, newRetryCount, job.payload],
      );
      await pool.query(
        `INSERT INTO job_executions (job_id, attempt_number, from_status, to_status, worker_id, reason, metadata)
         VALUES ($1, $2, 'running', 'dead_lettered', $3, 'max_retries_exceeded', $4)`,
        [job.id, newRetryCount, this.opts.workerId, JSON.stringify({ error: message })],
      );
      this.opts.logger.error({ jobId: job.id, newRetryCount }, 'job dead-lettered after exhausting retries');
    }
  }
}
