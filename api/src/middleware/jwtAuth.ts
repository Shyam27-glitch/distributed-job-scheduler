import type { NextFunction, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { unauthorized } from '../errors';
import type { AuthenticatedUser } from '../types/express';

export interface JwtPayload {
  sub: string;
  organizationId: string;
  email: string;
}

export function jwtAuth(secret: string) {
  return (req: Request, _res: Response, next: NextFunction) => {
    const header = req.headers.authorization;
    if (!header?.startsWith('Bearer ')) {
      next(unauthorized('missing bearer token'));
      return;
    }
    const token = header.slice('Bearer '.length);
    try {
      const payload = jwt.verify(token, secret) as JwtPayload;
      const user: AuthenticatedUser = {
        id: payload.sub,
        organizationId: payload.organizationId,
        email: payload.email,
      };
      req.user = user;
      next();
    } catch {
      next(unauthorized('invalid or expired token'));
    }
  };
}
