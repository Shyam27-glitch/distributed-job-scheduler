import express from 'express';
import cors from 'cors';
import pinoHttp from 'pino-http';
import type { Logger } from '@job-scheduler/shared';

export function createApp(logger: Logger) {
  const app = express();

  app.use(cors());
  app.use(express.json());
  app.use(pinoHttp({ logger }));

  app.get('/health', (_req, res) => {
    res.json({ status: 'ok' });
  });

  app.use((err: unknown, req: express.Request, res: express.Response, _next: express.NextFunction) => {
    req.log.error({ err }, 'unhandled error');
    res.status(500).json({ error: 'internal_server_error' });
  });

  return app;
}
