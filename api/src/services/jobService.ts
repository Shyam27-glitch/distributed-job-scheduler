import { randomUUID } from 'node:crypto';
import type { Pool } from 'pg';
import { badRequest, conflict, notFound } from '../errors';
import { getQueueScoped } from './queueService';
import type { CreateBatchJobInput, CreateJobInput, ListJobsQuery } from '../validators/jobValidators';

export interface JobRow {
  id: string;
  queue_id: string;
  scheduled_job_id: string | null;
  parent_job_id: string | null;
  job_type: string;
  status: string;
  priority: number;
  payload: Record<string, unknown>;
  idempotency_key: string;
  run_at: string;
  retry_count: number;
  claimed_by_worker_id: string | null;
  claimed_at: string | null;
  started_at: string | null;
  completed_at: string | null;
  last_error: string | null;
  created_at: string;
  updated_at: string;
}

function toJob(row: JobRow) {
  return {
    id: row.id,
    queueId: row.queue_id,
    scheduledJobId: row.scheduled_job_id,
    parentJobId: row.parent_job_id,
    jobType: row.job_type,
    status: row.status,
    priority: row.priority,
    payload: row.payload,
    idempotencyKey: row.idempotency_key,
    runAt: row.run_at,
    retryCount: row.retry_count,
    claimedByWorkerId: row.claimed_by_worker_id,
    claimedAt: row.claimed_at,
    startedAt: row.started_at,
    completedAt: row.completed_at,
    lastError: row.last_error,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function computeRunAt(input: CreateJobInput): Date {
  if (input.jobType === 'delayed') return new Date(Date.now() + input.delayMs!);
  if (input.jobType === 'scheduled') return new Date(input.runAt!);
  return new Date();
}

function statusForRunAt(runAt: Date): 'queued' | 'scheduled' {
  return runAt <= new Date() ? 'queued' : 'scheduled';
}

export async function createJob(pool: Pool, organizationId: string, queueId: string, input: CreateJobInput) {
  await getQueueScoped(pool, organizationId, queueId);
  const runAt = computeRunAt(input);
  try {
    const result = await pool.query<JobRow>(
      `INSERT INTO jobs (queue_id, job_type, status, priority, payload, idempotency_key, run_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
      [queueId, input.jobType, statusForRunAt(runAt), input.priority, input.payload, input.idempotencyKey, runAt],
    );
    return toJob(result.rows[0]);
  } catch (err) {
    if (isUniqueViolation(err)) {
      throw conflict('a job with this idempotencyKey already exists in this queue');
    }
    throw err;
  }
}

export async function createBatchJob(pool: Pool, organizationId: string, queueId: string, input: CreateBatchJobInput) {
  await getQueueScoped(pool, organizationId, queueId);
  const runAt = input.runAt ? new Date(input.runAt) : new Date();
  const status = statusForRunAt(runAt);

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const created: JobRow[] = [];
    let parentJobId: string | null = null;

    for (const item of input.items) {
      const idempotencyKey = item.idempotencyKey ?? `batch-${randomUUID()}`;
      const insertResult = await client.query(
        `INSERT INTO jobs (queue_id, parent_job_id, job_type, status, priority, payload, idempotency_key, run_at)
         VALUES ($1, $2, 'batch', $3, $4, $5, $6, $7) RETURNING *`,
        [queueId, parentJobId, status, input.priority, item.payload, idempotencyKey, runAt],
      );
      const row: JobRow = insertResult.rows[0];
      created.push(row);
      if (parentJobId === null) parentJobId = row.id;
    }

    await client.query('COMMIT');
    return created.map(toJob);
  } catch (err) {
    await client.query('ROLLBACK');
    if (isUniqueViolation(err)) {
      throw conflict('a job with this idempotencyKey already exists in this queue');
    }
    throw err;
  } finally {
    client.release();
  }
}

export async function listJobs(pool: Pool, organizationId: string, queueId: string, query: ListJobsQuery) {
  await getQueueScoped(pool, organizationId, queueId);
  const result = query.status
    ? await pool.query<JobRow>(
        'SELECT * FROM jobs WHERE queue_id = $1 AND status = $2 ORDER BY created_at DESC LIMIT $3',
        [queueId, query.status, query.limit],
      )
    : await pool.query<JobRow>('SELECT * FROM jobs WHERE queue_id = $1 ORDER BY created_at DESC LIMIT $2', [
        queueId,
        query.limit,
      ]);
  return result.rows.map(toJob);
}

export async function getJobScoped(pool: Pool, organizationId: string, jobId: string) {
  const result = await pool.query<JobRow>(
    `SELECT j.* FROM jobs j
     JOIN queues q ON q.id = j.queue_id
     JOIN projects p ON p.id = q.project_id
     WHERE j.id = $1 AND p.organization_id = $2`,
    [jobId, organizationId],
  );
  const row = result.rows[0];
  if (!row) throw notFound('job not found');
  return toJob(row);
}

export interface JobExecutionRow {
  id: string;
  job_id: string;
  attempt_number: number;
  from_status: string | null;
  to_status: string;
  worker_id: string | null;
  reason: string | null;
  metadata: Record<string, unknown> | null;
  occurred_at: string;
}

export async function getJobExecutions(pool: Pool, organizationId: string, jobId: string) {
  await getJobScoped(pool, organizationId, jobId);
  const result = await pool.query<JobExecutionRow>(
    'SELECT * FROM job_executions WHERE job_id = $1 ORDER BY occurred_at ASC',
    [jobId],
  );
  return result.rows.map((row) => ({
    id: row.id,
    jobId: row.job_id,
    attemptNumber: row.attempt_number,
    fromStatus: row.from_status,
    toStatus: row.to_status,
    workerId: row.worker_id,
    reason: row.reason,
    metadata: row.metadata,
    occurredAt: row.occurred_at,
  }));
}

export async function retryDeadLetteredJob(pool: Pool, organizationId: string, jobId: string) {
  const job = await getJobScoped(pool, organizationId, jobId);
  if (job.status !== 'dead_lettered') {
    throw badRequest('only dead-lettered jobs can be retried this way');
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await client.query<JobRow>(
      `UPDATE jobs SET status = 'queued', retry_count = 0, run_at = now(), last_error = NULL, updated_at = now()
       WHERE id = $1 RETURNING *`,
      [jobId],
    );
    await client.query(
      `UPDATE dead_letter_queue SET resolved = true, resolved_at = now() WHERE job_id = $1`,
      [jobId],
    );
    await client.query(
      `INSERT INTO job_executions (job_id, attempt_number, from_status, to_status, reason)
       VALUES ($1, 1, 'dead_lettered', 'queued', 'manual_retry')`,
      [jobId],
    );
    await client.query('COMMIT');
    return toJob(result.rows[0]);
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

function isUniqueViolation(err: unknown): boolean {
  return typeof err === 'object' && err !== null && (err as { code?: string }).code === '23505';
}
