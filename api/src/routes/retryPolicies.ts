import { Router } from 'express';
import type { Pool } from 'pg';
import { asyncHandler } from '../middleware/asyncHandler';
import { jwtAuth } from '../middleware/jwtAuth';
import * as retryPolicyService from '../services/retryPolicyService';
import { createRetryPolicySchema } from '../validators/retryPolicyValidators';

export function retryPoliciesRouter(pool: Pool, jwtSecret: string): Router {
  const router = Router();
  router.use(jwtAuth(jwtSecret));

  router.get(
    '/',
    asyncHandler(async (req, res) => {
      const policies = await retryPolicyService.listRetryPolicies(pool, req.user!.organizationId);
      res.json({ retryPolicies: policies });
    }),
  );

  router.post(
    '/',
    asyncHandler(async (req, res) => {
      const input = createRetryPolicySchema.parse(req.body);
      const policy = await retryPolicyService.createRetryPolicy(pool, req.user!.organizationId, input);
      res.status(201).json(policy);
    }),
  );

  return router;
}
