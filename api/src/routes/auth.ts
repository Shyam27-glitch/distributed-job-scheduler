import { Router } from 'express';
import type { Pool } from 'pg';
import { asyncHandler } from '../middleware/asyncHandler';
import { jwtAuth } from '../middleware/jwtAuth';
import * as authService from '../services/authService';
import { loginSchema, registerSchema } from '../validators/authValidators';

export function authRouter(pool: Pool, jwtSecret: string): Router {
  const router = Router();

  router.post(
    '/register',
    asyncHandler(async (req, res) => {
      const input = registerSchema.parse(req.body);
      const result = await authService.register(pool, jwtSecret, input);
      res.status(201).json(result);
    }),
  );

  router.post(
    '/login',
    asyncHandler(async (req, res) => {
      const input = loginSchema.parse(req.body);
      const result = await authService.login(pool, jwtSecret, input);
      res.json(result);
    }),
  );

  router.get(
    '/me',
    jwtAuth(jwtSecret),
    asyncHandler(async (req, res) => {
      res.json({ user: req.user });
    }),
  );

  return router;
}
