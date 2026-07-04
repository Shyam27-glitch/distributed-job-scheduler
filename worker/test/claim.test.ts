import type { Pool } from 'pg';
import { createLogger } from '@job-scheduler/shared';
import { claimJobs } from '../src/claim';
import { createTestPool, seedQueue, seedJob, seedWorker, cleanupOrg, cleanupWorker } from './helpers';

const logger = createLogger('claim-test', 'silent');

describe('claimJobs (atomic claiming under concurrency)', () => {
  let pool: Pool;
  let workerIds: string[];

  beforeAll(async () => {
    pool = createTestPool();
    workerIds = await Promise.all(Array.from({ length: 5 }, () => seedWorker(pool)));
  });

  afterAll(async () => {
    await Promise.all(workerIds.map((id) => cleanupWorker(pool, id)));
    await pool.end();
  });

  it('never lets two concurrent claimers take the same job', async () => {
    const { organizationId, queueId } = await seedQueue(pool, { concurrencyLimit: 100 });
    try {
      const jobCount = 20;
      const jobIds = await Promise.all(
        Array.from({ length: jobCount }, (_, i) => seedJob(pool, queueId, { idempotencyKey: `race-${i}` })),
      );

      // Four "workers" race for the same pool of jobs simultaneously, each able to
      // claim up to 5 -- exactly the total job count, so a correct implementation
      // claims every job exactly once with no leftovers and no duplicates.
      const racingWorkerIds = workerIds.slice(0, 4);
      const results = await Promise.all(
        racingWorkerIds.map((workerId) => claimJobs(pool, queueId, workerId, 5, logger)),
      );

      const claimedIds = results.flat().map((r) => r.id);
      expect(claimedIds).toHaveLength(jobCount);
      expect(new Set(claimedIds).size).toBe(jobCount);
      expect(new Set(claimedIds)).toEqual(new Set(jobIds));

      const statusResult = await pool.query<{ status: string }>('SELECT status FROM jobs WHERE queue_id = $1', [
        queueId,
      ]);
      expect(statusResult.rows.every((r) => r.status === 'claimed')).toBe(true);

      const doubleClaimResult = await pool.query<{ job_id: string }>(
        `SELECT job_id FROM job_executions WHERE job_id = ANY($1) AND to_status = 'claimed'
         GROUP BY job_id HAVING count(*) > 1`,
        [jobIds],
      );
      expect(doubleClaimResult.rows).toHaveLength(0);
    } finally {
      await cleanupOrg(pool, organizationId);
    }
  }, 20_000);

  it('does not claim jobs whose run_at is in the future', async () => {
    const { organizationId, queueId } = await seedQueue(pool);
    try {
      const futureJobId = await seedJob(pool, queueId, { idempotencyKey: 'future-1' });
      await pool.query(`UPDATE jobs SET run_at = now() + interval '1 hour' WHERE id = $1`, [futureJobId]);

      const claimed = await claimJobs(pool, queueId, workerIds[0], 10, logger);
      expect(claimed.find((j) => j.id === futureJobId)).toBeUndefined();
    } finally {
      await cleanupOrg(pool, organizationId);
    }
  });

  it('does not re-claim a job that is already claimed/running', async () => {
    const { organizationId, queueId } = await seedQueue(pool);
    try {
      const jobId = await seedJob(pool, queueId, { idempotencyKey: 'already-claimed-1' });
      const firstClaim = await claimJobs(pool, queueId, workerIds[0], 10, logger);
      expect(firstClaim.map((j) => j.id)).toContain(jobId);

      const secondClaim = await claimJobs(pool, queueId, workerIds[1], 10, logger);
      expect(secondClaim.find((j) => j.id === jobId)).toBeUndefined();
    } finally {
      await cleanupOrg(pool, organizationId);
    }
  });
});
