import type { Pool } from 'pg';
import { badRequest, conflict, notFound } from '../errors';
import type { CreateQueueInput, UpdateQueueInput } from '../validators/queueValidators';

export interface QueueRow {
  id: string;
  project_id: string;
  name: string;
  description: string | null;
  priority: number;
  concurrency_limit: number;
  retry_policy_id: string;
  is_paused: boolean;
  created_at: string;
  updated_at: string;
}

function toQueue(row: QueueRow) {
  return {
    id: row.id,
    projectId: row.project_id,
    name: row.name,
    description: row.description,
    priority: row.priority,
    concurrencyLimit: row.concurrency_limit,
    retryPolicyId: row.retry_policy_id,
    isPaused: row.is_paused,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

async function assertProjectInOrg(pool: Pool, organizationId: string, projectId: string) {
  const result = await pool.query('SELECT id FROM projects WHERE id = $1 AND organization_id = $2', [
    projectId,
    organizationId,
  ]);
  if (!result.rowCount) throw notFound('project not found');
}

async function assertRetryPolicyInOrg(pool: Pool, organizationId: string, retryPolicyId: string) {
  const result = await pool.query('SELECT id FROM retry_policies WHERE id = $1 AND organization_id = $2', [
    retryPolicyId,
    organizationId,
  ]);
  if (!result.rowCount) throw badRequest('retryPolicyId does not belong to your organization');
}

export async function listQueues(pool: Pool, organizationId: string, projectId: string) {
  await assertProjectInOrg(pool, organizationId, projectId);
  const result = await pool.query<QueueRow>('SELECT * FROM queues WHERE project_id = $1 ORDER BY created_at DESC', [
    projectId,
  ]);
  return result.rows.map(toQueue);
}

export async function createQueue(pool: Pool, organizationId: string, projectId: string, input: CreateQueueInput) {
  await assertProjectInOrg(pool, organizationId, projectId);
  await assertRetryPolicyInOrg(pool, organizationId, input.retryPolicyId);
  try {
    const result = await pool.query<QueueRow>(
      `INSERT INTO queues (project_id, name, description, priority, concurrency_limit, retry_policy_id, is_paused)
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
      [
        projectId,
        input.name,
        input.description ?? null,
        input.priority,
        input.concurrencyLimit,
        input.retryPolicyId,
        input.isPaused,
      ],
    );
    return toQueue(result.rows[0]);
  } catch (err) {
    if (isUniqueViolation(err)) {
      throw conflict('a queue with this name already exists in this project');
    }
    throw err;
  }
}

/** Fetches a queue and verifies it belongs to the caller's organization via its project. */
export async function getQueueScoped(pool: Pool, organizationId: string, queueId: string) {
  const result = await pool.query<QueueRow>(
    `SELECT q.* FROM queues q
     JOIN projects p ON p.id = q.project_id
     WHERE q.id = $1 AND p.organization_id = $2`,
    [queueId, organizationId],
  );
  const row = result.rows[0];
  if (!row) throw notFound('queue not found');
  return toQueue(row);
}

export async function updateQueue(pool: Pool, organizationId: string, queueId: string, input: UpdateQueueInput) {
  await getQueueScoped(pool, organizationId, queueId);
  if (input.retryPolicyId) {
    await assertRetryPolicyInOrg(pool, organizationId, input.retryPolicyId);
  }
  try {
    const result = await pool.query<QueueRow>(
      `UPDATE queues SET
         name = COALESCE($2, name),
         description = CASE WHEN $3::boolean THEN $4 ELSE description END,
         priority = COALESCE($5, priority),
         concurrency_limit = COALESCE($6, concurrency_limit),
         retry_policy_id = COALESCE($7, retry_policy_id),
         is_paused = COALESCE($8, is_paused),
         updated_at = now()
       WHERE id = $1
       RETURNING *`,
      [
        queueId,
        input.name ?? null,
        'description' in input,
        input.description ?? null,
        input.priority ?? null,
        input.concurrencyLimit ?? null,
        input.retryPolicyId ?? null,
        input.isPaused ?? null,
      ],
    );
    return toQueue(result.rows[0]);
  } catch (err) {
    if (isUniqueViolation(err)) {
      throw conflict('a queue with this name already exists in this project');
    }
    throw err;
  }
}

export interface QueueStats {
  queueId: string;
  counts: Record<string, number>;
  total: number;
}

export async function getQueueStats(pool: Pool, organizationId: string, queueId: string): Promise<QueueStats> {
  await getQueueScoped(pool, organizationId, queueId);
  const result = await pool.query<{ status: string; count: string }>(
    'SELECT status, count(*) FROM jobs WHERE queue_id = $1 GROUP BY status',
    [queueId],
  );
  const counts: Record<string, number> = {};
  let total = 0;
  for (const row of result.rows) {
    const count = Number(row.count);
    counts[row.status] = count;
    total += count;
  }
  return { queueId, counts, total };
}

export interface DeadLetterRow {
  id: string;
  job_id: string;
  queue_id: string;
  final_error: string | null;
  retry_count: number;
  payload_snapshot: Record<string, unknown>;
  resolved: boolean;
  resolved_at: string | null;
  moved_at: string;
}

export async function listDeadLetterEntries(pool: Pool, organizationId: string, queueId: string) {
  await getQueueScoped(pool, organizationId, queueId);
  const result = await pool.query<DeadLetterRow>(
    'SELECT * FROM dead_letter_queue WHERE queue_id = $1 ORDER BY moved_at DESC',
    [queueId],
  );
  return result.rows.map((row) => ({
    id: row.id,
    jobId: row.job_id,
    queueId: row.queue_id,
    finalError: row.final_error,
    retryCount: row.retry_count,
    payloadSnapshot: row.payload_snapshot,
    resolved: row.resolved,
    resolvedAt: row.resolved_at,
    movedAt: row.moved_at,
  }));
}

function isUniqueViolation(err: unknown): boolean {
  return typeof err === 'object' && err !== null && (err as { code?: string }).code === '23505';
}
