import { Router } from 'express';
import type { Pool } from 'pg';
import { asyncHandler } from '../middleware/asyncHandler';
import { jwtAuth } from '../middleware/jwtAuth';
import * as queueService from '../services/queueService';
import { createQueueSchema, updateQueueSchema } from '../validators/queueValidators';

/** Mounted at /api/projects/:projectId/queues */
export function projectQueuesRouter(pool: Pool, jwtSecret: string): Router {
  const router = Router({ mergeParams: true });
  router.use(jwtAuth(jwtSecret));

  router.get(
    '/',
    asyncHandler(async (req, res) => {
      const queues = await queueService.listQueues(pool, req.user!.organizationId, req.params.projectId);
      res.json({ queues });
    }),
  );

  router.post(
    '/',
    asyncHandler(async (req, res) => {
      const input = createQueueSchema.parse(req.body);
      const queue = await queueService.createQueue(pool, req.user!.organizationId, req.params.projectId, input);
      res.status(201).json(queue);
    }),
  );

  return router;
}

/** Mounted at /api/queues */
export function queuesRouter(pool: Pool, jwtSecret: string): Router {
  const router = Router();
  router.use(jwtAuth(jwtSecret));

  router.get(
    '/:id',
    asyncHandler(async (req, res) => {
      const queue = await queueService.getQueueScoped(pool, req.user!.organizationId, req.params.id);
      res.json(queue);
    }),
  );

  router.patch(
    '/:id',
    asyncHandler(async (req, res) => {
      const input = updateQueueSchema.parse(req.body);
      const queue = await queueService.updateQueue(pool, req.user!.organizationId, req.params.id, input);
      res.json(queue);
    }),
  );

  router.get(
    '/:id/stats',
    asyncHandler(async (req, res) => {
      const stats = await queueService.getQueueStats(pool, req.user!.organizationId, req.params.id);
      res.json(stats);
    }),
  );

  router.get(
    '/:id/dead-letter',
    asyncHandler(async (req, res) => {
      const entries = await queueService.listDeadLetterEntries(pool, req.user!.organizationId, req.params.id);
      res.json({ deadLetterEntries: entries });
    }),
  );

  return router;
}
