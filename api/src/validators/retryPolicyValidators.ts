import { z } from 'zod';
import { RETRY_STRATEGIES } from '@job-scheduler/shared';

export const createRetryPolicySchema = z.object({
  name: z.string().min(1).max(200),
  strategy: z.enum(RETRY_STRATEGIES),
  baseDelayMs: z.number().int().positive().default(1000),
  maxDelayMs: z.number().int().positive().default(3_600_000),
  multiplier: z.number().positive().default(2.0),
  maxRetries: z.number().int().min(0).default(3),
});
export type CreateRetryPolicyInput = z.infer<typeof createRetryPolicySchema>;
