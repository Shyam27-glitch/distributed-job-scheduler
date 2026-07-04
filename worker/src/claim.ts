import type { Pool } from 'pg';
import type { Logger } from '@job-scheduler/shared';

export interface ClaimedJobRow {
  id: string;
  queue_id: string;
  payload: Record<string, unknown>;
  retry_count: number;
}

/**
 * The mandatory atomic-claim query: CTE + FOR UPDATE SKIP LOCKED means two workers
 * (or two calls racing concurrently) never lock/return the same row, so a job is
 * never claimed twice.
 */
export async function claimJobs(
  pool: Pool,
  queueId: string,
  workerId: string,
  limit: number,
  logger: Logger,
): Promise<ClaimedJobRow[]> {
  const client = await pool.connect();
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
      [queueId, limit, workerId],
    );
    for (const row of result.rows) {
      await client.query(
        `INSERT INTO job_executions (job_id, attempt_number, from_status, to_status, worker_id, reason)
         VALUES ($1, $2, 'queued', 'claimed', $3, 'claimed')`,
        [row.id, row.retry_count + 1, workerId],
      );
    }
    await client.query('COMMIT');
    return result.rows;
  } catch (err) {
    await client.query('ROLLBACK');
    logger.error({ err, queueId }, 'claim query failed');
    return [];
  } finally {
    client.release();
  }
}
