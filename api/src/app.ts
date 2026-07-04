import express from 'express';
import cors from 'cors';
import pinoHttp from 'pino-http';
import type { Pool } from 'pg';
import type { Logger } from '@job-scheduler/shared';
import { authRouter } from './routes/auth';
import { projectsRouter } from './routes/projects';
import { errorHandler } from './middleware/errorHandler';

export function createApp(logger: Logger, pool?: Pool, jwtSecret?: string) {
  const app = express();

  app.use(cors());
  app.use(express.json());
  app.use(pinoHttp({ logger }));

  app.get('/health', (_req, res) => {
    res.json({ status: 'ok' });
  });

  if (pool && jwtSecret) {
    app.use('/api/auth', authRouter(pool, jwtSecret));
    app.use('/api/projects', projectsRouter(pool, jwtSecret));
  }

  app.use((_req, res) => {
    res.status(404).json({ error: 'not_found', message: 'route not found' });
  });

  app.use(errorHandler);

  return app;
}
