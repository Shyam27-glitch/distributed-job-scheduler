import os from 'node:os';
import { loadConfig, createLogger, getPool } from '@job-scheduler/shared';
import { Heartbeat } from './heartbeat';
import { Poller } from './poller';
import { registerShutdown } from './shutdown';

async function main() {
  const config = loadConfig();
  const logger = createLogger('worker', config.LOG_LEVEL);
  const pool = getPool(config.DATABASE_URL);

  const registerResult = await pool.query<{ id: string }>(
    `INSERT INTO workers (hostname, pid, status, concurrency, last_heartbeat_at)
     VALUES ($1, $2, 'online', $3, now()) RETURNING id`,
    [os.hostname(), process.pid, config.WORKER_CONCURRENCY],
  );
  const workerId = registerResult.rows[0].id;
  logger.info({ workerId, concurrency: config.WORKER_CONCURRENCY }, 'worker registered');

  const poller = new Poller({
    pool,
    workerId,
    concurrency: config.WORKER_CONCURRENCY,
    pollIntervalMs: config.POLL_INTERVAL_MS,
    jobTimeoutMs: config.JOB_TIMEOUT_MS,
    logger,
  });

  const heartbeat = new Heartbeat(
    pool,
    workerId,
    config.HEARTBEAT_INTERVAL_MS,
    logger,
    () => poller.activeJobCount,
  );

  poller.start();
  heartbeat.start();

  registerShutdown({ pool, workerId, poller, heartbeat, drainTimeoutMs: config.DRAIN_TIMEOUT_MS, logger });

  // Reaper (reclaims jobs from stale-heartbeat workers) and the promotion/cron
  // scheduler are added in later increments (retries+DLQ+reaper, scheduler).
}

main().catch((err) => {
  console.error('worker failed to start', err);
  process.exit(1);
});
