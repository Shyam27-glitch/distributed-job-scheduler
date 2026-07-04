import { Router } from 'express';
import type { Pool } from 'pg';
import { asyncHandler } from '../middleware/asyncHandler';
import { jwtAuth } from '../middleware/jwtAuth';
import * as scheduledJobService from '../services/scheduledJobService';
import { createScheduledJobSchema, updateScheduledJobSchema } from '../validators/scheduledJobValidators';

/** Mounted at /api/queues/:queueId/scheduled-jobs */
export function queueScheduledJobsRouter(pool: Pool, jwtSecret: string): Router {
  const router = Router({ mergeParams: true });
  router.use(jwtAuth(jwtSecret));

  router.get(
    '/',
    asyncHandler(async (req, res) => {
      const scheduledJobs = await scheduledJobService.listScheduledJobs(
        pool,
        req.user!.organizationId,
        req.params.queueId,
      );
      res.json({ scheduledJobs });
    }),
  );

  router.post(
    '/',
    asyncHandler(async (req, res) => {
      const input = createScheduledJobSchema.parse(req.body);
      const scheduledJob = await scheduledJobService.createScheduledJob(
        pool,
        req.user!.organizationId,
        req.params.queueId,
        input,
      );
      res.status(201).json(scheduledJob);
    }),
  );

  return router;
}

/** Mounted at /api/scheduled-jobs */
export function scheduledJobsRouter(pool: Pool, jwtSecret: string): Router {
  const router = Router();
  router.use(jwtAuth(jwtSecret));

  router.get(
    '/:id',
    asyncHandler(async (req, res) => {
      const scheduledJob = await scheduledJobService.getScheduledJobScoped(
        pool,
        req.user!.organizationId,
        req.params.id,
      );
      res.json(scheduledJob);
    }),
  );

  router.patch(
    '/:id',
    asyncHandler(async (req, res) => {
      const input = updateScheduledJobSchema.parse(req.body);
      const scheduledJob = await scheduledJobService.updateScheduledJob(
        pool,
        req.user!.organizationId,
        req.params.id,
        input,
      );
      res.json(scheduledJob);
    }),
  );

  return router;
}
