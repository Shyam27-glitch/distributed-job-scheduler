import { randomUUID } from 'node:crypto';
import { Pool } from 'pg';

export function createTestPool(): Pool {
  const connectionString = process.env.DATABASE_URL ?? 'postgres://postgres:postgres@localhost:5432/job_scheduler';
  return new Pool({ connectionString });
}

export interface SeededQueue {
  organizationId: string;
  projectId: string;
  retryPolicyId: string;
  queueId: string;
}

export interface SeedQueueOptions {
  concurrencyLimit?: number;
  strategy?: 'fixed' | 'linear' | 'exponential';
  baseDelayMs?: number;
  maxRetries?: number;
}

export async function seedQueue(pool: Pool, opts: SeedQueueOptions = {}): Promise<SeededQueue> {
  const organizationId = randomUUID();
  const projectId = randomUUID();
  const retryPolicyId = randomUUID();
  const queueId = randomUUID();

  await pool.query('INSERT INTO organizations (id, name) VALUES ($1, $2)', [
    organizationId,
    `test-org-${organizationId}`,
  ]);
  await pool.query('INSERT INTO projects (id, organization_id, name) VALUES ($1, $2, $3)', [
    projectId,
    organizationId,
    `test-project-${projectId}`,
  ]);
  await pool.query(
    `INSERT INTO retry_policies (id, organization_id, name, strategy, base_delay_ms, max_retries)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [retryPolicyId, organizationId, `test-policy-${retryPolicyId}`, opts.strategy ?? 'fixed', opts.baseDelayMs ?? 1000, opts.maxRetries ?? 3],
  );
  await pool.query(
    `INSERT INTO queues (id, project_id, name, concurrency_limit, retry_policy_id)
     VALUES ($1, $2, $3, $4, $5)`,
    [queueId, projectId, `test-queue-${queueId}`, opts.concurrencyLimit ?? 5, retryPolicyId],
  );

  return { organizationId, projectId, retryPolicyId, queueId };
}

export async function seedJob(
  pool: Pool,
  queueId: string,
  opts: { payload?: Record<string, unknown>; idempotencyKey?: string; retryCount?: number } = {},
): Promise<string> {
  const result = await pool.query<{ id: string }>(
    `INSERT INTO jobs (queue_id, job_type, payload, idempotency_key, retry_count)
     VALUES ($1, 'immediate', $2, $3, $4) RETURNING id`,
    [queueId, opts.payload ?? {}, opts.idempotencyKey ?? randomUUID(), opts.retryCount ?? 0],
  );
  return result.rows[0].id;
}

export async function seedWorker(pool: Pool): Promise<string> {
  const id = randomUUID();
  await pool.query(
    `INSERT INTO workers (id, hostname, status, concurrency, last_heartbeat_at)
     VALUES ($1, $2, 'online', 5, now())`,
    [id, `test-worker-${id}`],
  );
  return id;
}

export async function cleanupOrg(pool: Pool, organizationId: string): Promise<void> {
  await pool.query('DELETE FROM organizations WHERE id = $1', [organizationId]);
}

export async function cleanupWorker(pool: Pool, workerId: string): Promise<void> {
  await pool.query('DELETE FROM workers WHERE id = $1', [workerId]);
}
