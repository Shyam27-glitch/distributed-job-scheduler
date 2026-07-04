import type { Pool } from 'pg';
import { handleJobFailure } from '../src/failureHandler';
import type { RetryPolicyConfig } from '../src/retry';
import { createTestPool, seedQueue, seedJob, seedWorker, cleanupOrg, cleanupWorker } from './helpers';

describe('handleJobFailure (retry backoff + DLQ routing)', () => {
  let pool: Pool;
  let workerId: string;

  beforeAll(async () => {
    pool = createTestPool();
    workerId = await seedWorker(pool);
  });

  afterAll(async () => {
    await cleanupWorker(pool, workerId);
    await pool.end();
  });

  it('schedules a retry with backoff when retries remain', async () => {
    const { organizationId, queueId } = await seedQueue(pool, { maxRetries: 3 });
    try {
      const jobId = await seedJob(pool, queueId);
      const job = { id: jobId, queue_id: queueId, payload: {}, retry_count: 0 };
      const retryPolicy: RetryPolicyConfig = {
        strategy: 'fixed',
        baseDelayMs: 2000,
        maxDelayMs: 60_000,
        multiplier: 2,
        maxRetries: 3,
      };

      await handleJobFailure(pool, job, retryPolicy, workerId, 'boom', 'handler_error');

      const result = await pool.query('SELECT status, retry_count, run_at, last_error FROM jobs WHERE id = $1', [
        jobId,
      ]);
      const row = result.rows[0];
      expect(row.status).toBe('pending_retry');
      expect(row.retry_count).toBe(1);
      expect(row.last_error).toBe('boom');
      expect(new Date(row.run_at).getTime()).toBeGreaterThan(Date.now() + 1000);

      const execResult = await pool.query('SELECT to_status, reason FROM job_executions WHERE job_id = $1', [
        jobId,
      ]);
      expect(execResult.rows[0]).toMatchObject({ to_status: 'pending_retry', reason: 'handler_error' });
    } finally {
      await cleanupOrg(pool, organizationId);
    }
  });

  it('dead-letters the job once retries are exhausted', async () => {
    const { organizationId, queueId } = await seedQueue(pool, { maxRetries: 0 });
    try {
      const jobId = await seedJob(pool, queueId, { payload: { some: 'payload' } });
      const job = { id: jobId, queue_id: queueId, payload: { some: 'payload' }, retry_count: 0 };
      const retryPolicy: RetryPolicyConfig = {
        strategy: 'fixed',
        baseDelayMs: 1000,
        maxDelayMs: 60_000,
        multiplier: 2,
        maxRetries: 0,
      };

      await handleJobFailure(pool, job, retryPolicy, workerId, 'fatal', 'handler_error');

      const result = await pool.query('SELECT status, retry_count, last_error FROM jobs WHERE id = $1', [jobId]);
      expect(result.rows[0]).toMatchObject({ status: 'dead_lettered', retry_count: 1, last_error: 'fatal' });

      const dlqResult = await pool.query(
        'SELECT final_error, retry_count, resolved FROM dead_letter_queue WHERE job_id = $1',
        [jobId],
      );
      expect(dlqResult.rows[0]).toMatchObject({ final_error: 'fatal', retry_count: 1, resolved: false });
    } finally {
      await cleanupOrg(pool, organizationId);
    }
  });

  it('upserts the DLQ row (does not throw) when a job is dead-lettered a second time', async () => {
    // Regression test: a manually-retried job that fails all retries again used to
    // hit dead_letter_queue's job_id UNIQUE constraint and crash the whole worker
    // via an unhandled rejection. This must now succeed cleanly with one DLQ row.
    const { organizationId, queueId } = await seedQueue(pool, { maxRetries: 0 });
    try {
      const jobId = await seedJob(pool, queueId);
      const job = { id: jobId, queue_id: queueId, payload: {}, retry_count: 0 };
      const retryPolicy: RetryPolicyConfig = {
        strategy: 'fixed',
        baseDelayMs: 1000,
        maxDelayMs: 60_000,
        multiplier: 2,
        maxRetries: 0,
      };

      await handleJobFailure(pool, job, retryPolicy, workerId, 'first failure', 'handler_error');
      // Simulate the manual-retry endpoint resetting retry_count before it fails again.
      await pool.query(`UPDATE jobs SET retry_count = 0 WHERE id = $1`, [jobId]);
      await expect(
        handleJobFailure(pool, { ...job, retry_count: 0 }, retryPolicy, workerId, 'second failure', 'handler_error'),
      ).resolves.not.toThrow();

      const dlqResult = await pool.query('SELECT final_error FROM dead_letter_queue WHERE job_id = $1', [jobId]);
      expect(dlqResult.rows).toHaveLength(1);
      expect(dlqResult.rows[0]).toMatchObject({ final_error: 'second failure' });
    } finally {
      await cleanupOrg(pool, organizationId);
    }
  });
});
