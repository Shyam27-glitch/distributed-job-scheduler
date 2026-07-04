import os from 'node:os';
import { loadConfig, createLogger, getPool } from '@job-scheduler/shared';
import { Heartbeat } from './heartbeat';
import { Poller } from './poller';
import { Reaper } from './reaper';
import { Scheduler } from './scheduler';
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

  const reaper = new Reaper(pool, config.REAPER_INTERVAL_MS, config.REAPER_STALE_THRESHOLD_MS, logger);
  const scheduler = new Scheduler(pool, config.POLL_INTERVAL_MS, logger);

  poller.start();
  heartbeat.start();
  reaper.start();
  scheduler.start();

  registerShutdown({ pool, workerId, poller, heartbeat, drainTimeoutMs: config.DRAIN_TIMEOUT_MS, logger });
}

main().catch((err) => {
  console.error('worker failed to start', err);
  process.exit(1);
});
