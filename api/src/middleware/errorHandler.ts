import type { NextFunction, Request, Response } from 'express';
import { ZodError } from 'zod';
import { AppError } from '../errors';

export function errorHandler(err: unknown, req: Request, res: Response, _next: NextFunction) {
  if (err instanceof AppError) {
    res.status(err.statusCode).json({ error: err.code, message: err.message });
    return;
  }
  if (err instanceof ZodError) {
    res.status(400).json({ error: 'validation_error', message: err.issues.map((i) => i.message).join(', ') });
    return;
  }
  req.log.error({ err }, 'unhandled error');
  res.status(500).json({ error: 'internal_server_error', message: 'internal server error' });
}
