import { z } from 'zod';

export const createScheduledJobSchema = z.object({
  name: z.string().min(1).max(200),
  cronExpression: z.string().min(1),
  timezone: z.string().default('UTC'),
  payloadTemplate: z.record(z.string(), z.unknown()).default({}),
  priority: z.number().int().default(0),
  isEnabled: z.boolean().default(true),
});
export type CreateScheduledJobInput = z.infer<typeof createScheduledJobSchema>;

export const updateScheduledJobSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  cronExpression: z.string().min(1).optional(),
  timezone: z.string().optional(),
  payloadTemplate: z.record(z.string(), z.unknown()).optional(),
  priority: z.number().int().optional(),
  isEnabled: z.boolean().optional(),
});
export type UpdateScheduledJobInput = z.infer<typeof updateScheduledJobSchema>;
