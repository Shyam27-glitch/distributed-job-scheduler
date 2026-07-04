import type { Pool } from 'pg';
import type { Logger } from '@job-scheduler/shared';
import type { Heartbeat } from './heartbeat';
import type { Poller } from './poller';

export interface ShutdownOptions {
  pool: Pool;
  workerId: string;
  poller: Poller;
  heartbeat: Heartbeat;
  drainTimeoutMs: number;
  logger: Logger;
}

export function registerShutdown(opts: ShutdownOptions): void {
  let shuttingDown = false;

  const handleSignal = async (signal: string) => {
    if (shuttingDown) return;
    shuttingDown = true;
    opts.logger.info({ signal }, 'shutdown signal received, draining in-flight jobs');

    // Stop claiming immediately, but keep heartbeating during drain so the reaper
    // doesn't reclaim jobs that are legitimately still finishing.
    opts.poller.stopClaiming();
    await opts.pool.query('UPDATE workers SET status = $2, updated_at = now() WHERE id = $1', [
      opts.workerId,
      'draining',
    ]);

    await opts.poller.drain(opts.drainTimeoutMs);

    opts.heartbeat.stop();
    await opts.pool.query('UPDATE workers SET status = $2, updated_at = now() WHERE id = $1', [
      opts.workerId,
      'offline',
    ]);
    opts.logger.info('shutdown complete');
    await opts.pool.end();
    process.exit(0);
  };

  process.on('SIGTERM', () => void handleSignal('SIGTERM'));
  process.on('SIGINT', () => void handleSignal('SIGINT'));
}
