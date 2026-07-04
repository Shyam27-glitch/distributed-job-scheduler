import { CronExpressionParser } from 'cron-parser';
import type { Pool } from 'pg';
import { badRequest, notFound } from '../errors';
import { getQueueScoped } from './queueService';
import type { CreateScheduledJobInput, UpdateScheduledJobInput } from '../validators/scheduledJobValidators';

export interface ScheduledJobRow {
  id: string;
  queue_id: string;
  name: string;
  cron_expression: string;
  timezone: string;
  payload_template: Record<string, unknown>;
  priority: number;
  is_enabled: boolean;
  next_run_at: string;
  last_run_at: string | null;
  created_at: string;
  updated_at: string;
}

function toScheduledJob(row: ScheduledJobRow) {
  return {
    id: row.id,
    queueId: row.queue_id,
    name: row.name,
    cronExpression: row.cron_expression,
    timezone: row.timezone,
    payloadTemplate: row.payload_template,
    priority: row.priority,
    isEnabled: row.is_enabled,
    nextRunAt: row.next_run_at,
    lastRunAt: row.last_run_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function computeNextRunAt(cronExpression: string, timezone: string): Date {
  try {
    return CronExpressionParser.parse(cronExpression, { currentDate: new Date(), tz: timezone }).next().toDate();
  } catch {
    throw badRequest('invalid cronExpression or timezone');
  }
}

export async function listScheduledJobs(pool: Pool, organizationId: string, queueId: string) {
  await getQueueScoped(pool, organizationId, queueId);
  const result = await pool.query<ScheduledJobRow>(
    'SELECT * FROM scheduled_jobs WHERE queue_id = $1 ORDER BY created_at DESC',
    [queueId],
  );
  return result.rows.map(toScheduledJob);
}

export async function createScheduledJob(
  pool: Pool,
  organizationId: string,
  queueId: string,
  input: CreateScheduledJobInput,
) {
  await getQueueScoped(pool, organizationId, queueId);
  const nextRunAt = computeNextRunAt(input.cronExpression, input.timezone);
  const result = await pool.query<ScheduledJobRow>(
    `INSERT INTO scheduled_jobs
       (queue_id, name, cron_expression, timezone, payload_template, priority, is_enabled, next_run_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *`,
    [
      queueId,
      input.name,
      input.cronExpression,
      input.timezone,
      input.payloadTemplate,
      input.priority,
      input.isEnabled,
      nextRunAt,
    ],
  );
  return toScheduledJob(result.rows[0]);
}

export async function getScheduledJobScoped(pool: Pool, organizationId: string, id: string) {
  const result = await pool.query<ScheduledJobRow>(
    `SELECT sj.* FROM scheduled_jobs sj
     JOIN queues q ON q.id = sj.queue_id
     JOIN projects p ON p.id = q.project_id
     WHERE sj.id = $1 AND p.organization_id = $2`,
    [id, organizationId],
  );
  const row = result.rows[0];
  if (!row) throw notFound('scheduled job not found');
  return toScheduledJob(row);
}

export async function updateScheduledJob(
  pool: Pool,
  organizationId: string,
  id: string,
  input: UpdateScheduledJobInput,
) {
  const existing = await getScheduledJobScoped(pool, organizationId, id);
  const cronExpression = input.cronExpression ?? existing.cronExpression;
  const timezone = input.timezone ?? existing.timezone;
  const cronOrTzChanged = input.cronExpression !== undefined || input.timezone !== undefined;
  const nextRunAt = cronOrTzChanged ? computeNextRunAt(cronExpression, timezone) : null;

  const result = await pool.query<ScheduledJobRow>(
    `UPDATE scheduled_jobs SET
       name = COALESCE($2, name),
       cron_expression = COALESCE($3, cron_expression),
       timezone = COALESCE($4, timezone),
       payload_template = COALESCE($5, payload_template),
       priority = COALESCE($6, priority),
       is_enabled = COALESCE($7, is_enabled),
       next_run_at = COALESCE($8, next_run_at),
       updated_at = now()
     WHERE id = $1
     RETURNING *`,
    [
      id,
      input.name ?? null,
      input.cronExpression ?? null,
      input.timezone ?? null,
      input.payloadTemplate ?? null,
      input.priority ?? null,
      input.isEnabled ?? null,
      nextRunAt,
    ],
  );
  return toScheduledJob(result.rows[0]);
}
