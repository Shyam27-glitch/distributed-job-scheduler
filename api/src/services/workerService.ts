import type { Pool } from 'pg';

export interface WorkerRow {
  id: string;
  hostname: string;
  pid: number | null;
  status: string;
  concurrency: number;
  started_at: string;
  last_heartbeat_at: string | null;
  created_at: string;
  updated_at: string;
}

function toWorker(row: WorkerRow) {
  return {
    id: row.id,
    hostname: row.hostname,
    pid: row.pid,
    status: row.status,
    concurrency: row.concurrency,
    startedAt: row.started_at,
    lastHeartbeatAt: row.last_heartbeat_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/** Workers are global infrastructure (not organization-scoped): any authenticated
 *  user can see fleet status, since a worker may execute jobs from any organization. */
export async function listWorkers(pool: Pool) {
  const result = await pool.query<WorkerRow>('SELECT * FROM workers ORDER BY started_at DESC');
  return result.rows.map(toWorker);
}
