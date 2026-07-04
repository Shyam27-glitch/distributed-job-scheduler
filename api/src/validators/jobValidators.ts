import { z } from 'zod';

export const createJobSchema = z
  .object({
    jobType: z.enum(['immediate', 'delayed', 'scheduled']),
    payload: z.record(z.string(), z.unknown()).default({}),
    idempotencyKey: z.string().min(1).max(300),
    priority: z.number().int().default(0),
    delayMs: z.number().int().positive().optional(),
    runAt: z.string().datetime().optional(),
  })
  .superRefine((input, ctx) => {
    if (input.jobType === 'delayed' && input.delayMs === undefined) {
      ctx.addIssue({ code: 'custom', message: 'delayMs is required for delayed jobs', path: ['delayMs'] });
    }
    if (input.jobType === 'scheduled' && input.runAt === undefined) {
      ctx.addIssue({ code: 'custom', message: 'runAt is required for scheduled jobs', path: ['runAt'] });
    }
  });
export type CreateJobInput = z.infer<typeof createJobSchema>;

export const createBatchJobSchema = z.object({
  items: z
    .array(z.object({ payload: z.record(z.string(), z.unknown()).default({}), idempotencyKey: z.string().optional() }))
    .min(1)
    .max(1000),
  runAt: z.string().datetime().optional(),
  priority: z.number().int().default(0),
});
export type CreateBatchJobInput = z.infer<typeof createBatchJobSchema>;

export const listJobsQuerySchema = z.object({
  status: z
    .enum(['scheduled', 'queued', 'claimed', 'running', 'completed', 'failed', 'pending_retry', 'dead_lettered'])
    .optional(),
  limit: z.coerce.number().int().positive().max(200).default(50),
});
export type ListJobsQuery = z.infer<typeof listJobsQuerySchema>;
