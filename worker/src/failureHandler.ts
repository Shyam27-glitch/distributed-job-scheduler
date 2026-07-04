import type { Pool } from 'pg';
import { computeRetryDelayMs, type RetryPolicyConfig } from './retry';
import type { ClaimedJobRow } from './claim';

/**
 * Routes a failed job's execution to a retry (pending_retry, backed off per the
 * queue's retry policy) or, once retries are exhausted, to the dead letter queue.
 * The DLQ insert is an upsert since a job can be manually retried and fail again.
 */
export async function handleJobFailure(
  pool: Pool,
  job: ClaimedJobRow,
  retryPolicy: RetryPolicyConfig,
  workerId: string,
  message: string,
  reason: string,
): Promise<void> {
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
      [job.id, newRetryCount, workerId, reason, JSON.stringify({ error: message, nextRunAt, delayMs })],
    );
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
      [job.id, newRetryCount, workerId, JSON.stringify({ error: message })],
    );
  }
}
