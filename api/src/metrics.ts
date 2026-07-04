import client from 'prom-client';
import type { Pool } from 'pg';

const register = new client.Registry();
client.collectDefaultMetrics({ register, prefix: 'job_scheduler_' });

const jobsByStatus = new client.Gauge({
  name: 'job_scheduler_jobs_total',
  help: 'Current number of jobs by status',
  labelNames: ['status'],
  registers: [register],
});

const workersByStatus = new client.Gauge({
  name: 'job_scheduler_workers_total',
  help: 'Current number of workers by status',
  labelNames: ['status'],
  registers: [register],
});

const queueDepth = new client.Gauge({
  name: 'job_scheduler_queue_depth',
  help: 'Number of runnable (queued/scheduled/pending_retry) jobs per queue',
  labelNames: ['queue_id', 'queue_name'],
  registers: [register],
});

const deadLetterUnresolved = new client.Gauge({
  name: 'job_scheduler_dead_letter_unresolved_total',
  help: 'Number of unresolved dead-lettered jobs',
  registers: [register],
});

export async function renderMetrics(pool: Pool): Promise<{ contentType: string; body: string }> {
  const [jobStatusResult, workerStatusResult, queueDepthResult, dlqResult] = await Promise.all([
    pool.query<{ status: string; count: string }>('SELECT status, count(*) FROM jobs GROUP BY status'),
    pool.query<{ status: string; count: string }>('SELECT status, count(*) FROM workers GROUP BY status'),
    pool.query<{ id: string; name: string; count: string }>(
      `SELECT q.id, q.name, count(j.id) AS count
       FROM queues q
       LEFT JOIN jobs j ON j.queue_id = q.id AND j.status IN ('queued', 'scheduled', 'pending_retry')
       GROUP BY q.id, q.name`,
    ),
    pool.query<{ count: string }>('SELECT count(*) FROM dead_letter_queue WHERE resolved = false'),
  ]);

  jobsByStatus.reset();
  for (const row of jobStatusResult.rows) jobsByStatus.set({ status: row.status }, Number(row.count));

  workersByStatus.reset();
  for (const row of workerStatusResult.rows) workersByStatus.set({ status: row.status }, Number(row.count));

  queueDepth.reset();
  for (const row of queueDepthResult.rows) {
    queueDepth.set({ queue_id: row.id, queue_name: row.name }, Number(row.count));
  }

  deadLetterUnresolved.set(Number(dlqResult.rows[0]?.count ?? 0));

  return { contentType: register.contentType, body: await register.metrics() };
}
