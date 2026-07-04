import { Router } from 'express';
import type { Pool } from 'pg';
import { asyncHandler } from '../middleware/asyncHandler';
import { jwtAuth } from '../middleware/jwtAuth';
import * as jobService from '../services/jobService';
import { createBatchJobSchema, createJobSchema, listJobsQuerySchema } from '../validators/jobValidators';

/** Mounted at /api/queues/:queueId/jobs */
export function queueJobsRouter(pool: Pool, jwtSecret: string): Router {
  const router = Router({ mergeParams: true });
  router.use(jwtAuth(jwtSecret));

  router.get(
    '/',
    asyncHandler(async (req, res) => {
      const query = listJobsQuerySchema.parse(req.query);
      const jobs = await jobService.listJobs(pool, req.user!.organizationId, req.params.queueId, query);
      res.json({ jobs });
    }),
  );

  router.post(
    '/',
    asyncHandler(async (req, res) => {
      const input = createJobSchema.parse(req.body);
      const job = await jobService.createJob(pool, req.user!.organizationId, req.params.queueId, input);
      res.status(201).json(job);
    }),
  );

  router.post(
    '/batch',
    asyncHandler(async (req, res) => {
      const input = createBatchJobSchema.parse(req.body);
      const jobs = await jobService.createBatchJob(pool, req.user!.organizationId, req.params.queueId, input);
      res.status(201).json({ jobs });
    }),
  );

  return router;
}

/** Mounted at /api/jobs */
export function jobsRouter(pool: Pool, jwtSecret: string): Router {
  const router = Router();
  router.use(jwtAuth(jwtSecret));

  router.get(
    '/:id',
    asyncHandler(async (req, res) => {
      const job = await jobService.getJobScoped(pool, req.user!.organizationId, req.params.id);
      res.json(job);
    }),
  );

  return router;
}
