import type { Pool } from 'pg';
import type { Logger } from '@job-scheduler/shared';

/**
 * Reclaims jobs left claimed/running by workers whose heartbeat has gone stale,
 * and marks those workers offline. Safe for every worker instance to run its own
 * reaper tick concurrently: FOR UPDATE SKIP LOCKED means no two reapers reclaim
 * the same job, so no distributed lock/leader election is needed.
 */
export class Reaper {
  private timer?: NodeJS.Timeout;

  constructor(
    private pool: Pool,
    private intervalMs: number,
    private staleThresholdMs: number,
    private logger: Logger,
  ) {}

  start(): void {
    this.timer = setInterval(() => void this.tick(), this.intervalMs);
    this.timer.unref?.();
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
  }

  private async tick(): Promise<void> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');

      const staleWorkers = await client.query<{ id: string }>(
        `SELECT id FROM workers
         WHERE last_heartbeat_at < now() - ($1::int * interval '1 millisecond')
           AND status <> 'offline'`,
        [this.staleThresholdMs],
      );

      if (staleWorkers.rowCount) {
        const staleWorkerIds = staleWorkers.rows.map((w) => w.id);

        const reclaimed = await client.query<{ id: string; retry_count: number }>(
          `WITH reclaimable AS (
             SELECT id FROM jobs
             WHERE status IN ('claimed', 'running') AND claimed_by_worker_id = ANY($1)
             FOR UPDATE SKIP LOCKED
           )
           UPDATE jobs
           SET status = 'queued', claimed_by_worker_id = NULL, claimed_at = NULL, started_at = NULL, updated_at = now()
           FROM reclaimable
           WHERE jobs.id = reclaimable.id
           RETURNING jobs.id, jobs.retry_count`,
          [staleWorkerIds],
        );

        for (const row of reclaimed.rows) {
          await client.query(
            `INSERT INTO job_executions (job_id, attempt_number, from_status, to_status, reason)
             VALUES ($1, $2, 'running', 'queued', 'heartbeat_reclaim')`,
            [row.id, row.retry_count + 1],
          );
        }

        await client.query(`UPDATE workers SET status = 'offline', updated_at = now() WHERE id = ANY($1)`, [
          staleWorkerIds,
        ]);

        if (reclaimed.rowCount) {
          this.logger.warn(
            { staleWorkerIds, reclaimedJobIds: reclaimed.rows.map((r) => r.id) },
            'reclaimed jobs from stale workers',
          );
        }
      }

      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK');
      this.logger.error({ err }, 'reaper tick failed');
    } finally {
      client.release();
    }
  }
}
