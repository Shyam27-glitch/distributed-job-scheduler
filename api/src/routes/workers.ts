import { Router } from 'express';
import type { Pool } from 'pg';
import { asyncHandler } from '../middleware/asyncHandler';
import { jwtAuth } from '../middleware/jwtAuth';
import * as workerService from '../services/workerService';

/** Mounted at /api/workers */
export function workersRouter(pool: Pool, jwtSecret: string): Router {
  const router = Router();
  router.use(jwtAuth(jwtSecret));

  router.get(
    '/',
    asyncHandler(async (_req, res) => {
      const workers = await workerService.listWorkers(pool);
      res.json({ workers });
    }),
  );

  return router;
}
