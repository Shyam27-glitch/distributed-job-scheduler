import type { Pool } from 'pg';
import type { Logger } from '@job-scheduler/shared';

export class Heartbeat {
  private timer?: NodeJS.Timeout;

  constructor(
    private pool: Pool,
    private workerId: string,
    private intervalMs: number,
    private logger: Logger,
    private getActiveJobCount: () => number,
  ) {}

  start(): void {
    this.timer = setInterval(() => void this.tick(), this.intervalMs);
    this.timer.unref?.();
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
  }

  private async tick(): Promise<void> {
    try {
      await this.pool.query('UPDATE workers SET last_heartbeat_at = now() WHERE id = $1', [this.workerId]);
      await this.pool.query('INSERT INTO worker_heartbeats (worker_id, active_job_count) VALUES ($1, $2)', [
        this.workerId,
        this.getActiveJobCount(),
      ]);
    } catch (err) {
      this.logger.error({ err }, 'heartbeat failed');
    }
  }
}
