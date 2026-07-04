import express from 'express';
import cors from 'cors';
import pinoHttp from 'pino-http';
import type { Pool } from 'pg';
import type { Logger } from '@job-scheduler/shared';
import { authRouter } from './routes/auth';
import { projectsRouter } from './routes/projects';
import { retryPoliciesRouter } from './routes/retryPolicies';
import { projectQueuesRouter, queuesRouter } from './routes/queues';
import { queueJobsRouter, jobsRouter } from './routes/jobs';
import { queueScheduledJobsRouter, scheduledJobsRouter } from './routes/scheduledJobs';
import { mountApiDocs } from './docs/swaggerSetup';
import { errorHandler } from './middleware/errorHandler';

export function createApp(logger: Logger, pool?: Pool, jwtSecret?: string) {
  const app = express();

  app.use(cors());
  app.use(express.json());
  app.use(pinoHttp({ logger }));

  app.get('/health', (_req, res) => {
    res.json({ status: 'ok' });
  });

  try {
    mountApiDocs(app);
  } catch (err) {
    logger.warn({ err }, 'failed to mount /api/docs (openapi.yaml not found)');
  }

  if (pool && jwtSecret) {
    app.use('/api/auth', authRouter(pool, jwtSecret));
    app.use('/api/projects', projectsRouter(pool, jwtSecret));
    app.use('/api/retry-policies', retryPoliciesRouter(pool, jwtSecret));
    app.use('/api/projects/:projectId/queues', projectQueuesRouter(pool, jwtSecret));
    app.use('/api/queues/:queueId/jobs', queueJobsRouter(pool, jwtSecret));
    app.use('/api/queues/:queueId/scheduled-jobs', queueScheduledJobsRouter(pool, jwtSecret));
    app.use('/api/queues', queuesRouter(pool, jwtSecret));
    app.use('/api/jobs', jobsRouter(pool, jwtSecret));
    app.use('/api/scheduled-jobs', scheduledJobsRouter(pool, jwtSecret));
  }

  app.use((_req, res) => {
    res.status(404).json({ error: 'not_found', message: 'route not found' });
  });

  app.use(errorHandler);

  return app;
}
