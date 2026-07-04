import type { Pool } from 'pg';
import type { Logger } from '@job-scheduler/shared';

/**
 * Promotes due jobs back into the claimable pool. For now this only handles
 * pending_retry -> queued (retries becoming due); promoting one-off 'scheduled'
 * jobs and materializing recurring ScheduledJobs templates are added in the
 * scheduler increment.
 */
export class Scheduler {
  private timer?: NodeJS.Timeout;

  constructor(
    private pool: Pool,
    private intervalMs: number,
    private logger: Logger,
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
      await this.pool.query(
        `UPDATE jobs SET status = 'queued', updated_at = now()
         WHERE status = 'pending_retry' AND run_at <= now()`,
      );
    } catch (err) {
      this.logger.error({ err }, 'scheduler tick failed');
    }
  }
}
