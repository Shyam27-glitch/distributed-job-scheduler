import { z } from 'zod';

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),
  JWT_SECRET: z.string().min(1, 'JWT_SECRET is required'),
  PORT: z.coerce.number().int().positive().default(3000),
  LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error']).default('info'),
  HEARTBEAT_INTERVAL_MS: z.coerce.number().int().positive().default(10_000),
  REAPER_INTERVAL_MS: z.coerce.number().int().positive().default(15_000),
  REAPER_STALE_THRESHOLD_MS: z.coerce.number().int().positive().default(30_000),
  POLL_INTERVAL_MS: z.coerce.number().int().positive().default(1_000),
  DRAIN_TIMEOUT_MS: z.coerce.number().int().positive().default(25_000),
  WORKER_CONCURRENCY: z.coerce.number().int().positive().default(5),
});

export type AppConfig = z.infer<typeof envSchema>;

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const parsed = envSchema.safeParse(env);
  if (!parsed.success) {
    throw new Error(`Invalid environment configuration: ${parsed.error.message}`);
  }
  return parsed.data;
}
