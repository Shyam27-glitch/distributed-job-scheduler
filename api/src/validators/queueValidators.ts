import { z } from 'zod';

export const createQueueSchema = z.object({
  name: z.string().min(1).max(200),
  description: z.string().max(2000).optional(),
  priority: z.number().int().default(0),
  concurrencyLimit: z.number().int().positive().default(5),
  retryPolicyId: z.string().uuid(),
  isPaused: z.boolean().default(false),
});
export type CreateQueueInput = z.infer<typeof createQueueSchema>;

export const updateQueueSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  description: z.string().max(2000).nullable().optional(),
  priority: z.number().int().optional(),
  concurrencyLimit: z.number().int().positive().optional(),
  retryPolicyId: z.string().uuid().optional(),
  isPaused: z.boolean().optional(),
});
export type UpdateQueueInput = z.infer<typeof updateQueueSchema>;
