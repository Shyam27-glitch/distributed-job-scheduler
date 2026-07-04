import type { Pool } from 'pg';
import type { Logger } from '@job-scheduler/shared';
import { CronExpressionParser } from 'cron-parser';

interface DueScheduledJobRow {
  id: string;
  queue_id: string;
  cron_expression: string;
  timezone: string;
  payload_template: Record<string, unknown>;
  priority: number;
}

/**
 * Promotes due jobs back into the claimable pool (pending_retry/scheduled -> queued)
 * and materializes due recurring ScheduledJobs templates into concrete Jobs rows,
 * advancing each template's next_run_at to its next cron occurrence.
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
    await this.promoteDueJobs();
    await this.materializeRecurringJobs();
  }

  private async promoteDueJobs(): Promise<void> {
    try {
      await this.pool.query(
        `UPDATE jobs SET status = 'queued', updated_at = now()
         WHERE status IN ('pending_retry', 'scheduled') AND run_at <= now()`,
      );
    } catch (err) {
      this.logger.error({ err }, 'promotion tick failed');
    }
  }

  private async materializeRecurringJobs(): Promise<void> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');

      const due = await client.query<DueScheduledJobRow>(
        `SELECT id, queue_id, cron_expression, timezone, payload_template, priority
         FROM scheduled_jobs
         WHERE is_enabled = true AND next_run_at <= now()
         FOR UPDATE SKIP LOCKED`,
      );

      for (const row of due.rows) {
        const idempotencyKey = `recurring-${row.id}-${new Date().toISOString()}`;
        await client.query(
          `INSERT INTO jobs (queue_id, scheduled_job_id, job_type, status, priority, payload, idempotency_key, run_at)
           VALUES ($1, $2, 'recurring', 'queued', $3, $4, $5, now())
           ON CONFLICT (queue_id, idempotency_key) DO NOTHING`,
          [row.queue_id, row.id, row.priority, row.payload_template, idempotencyKey],
        );

        let nextRunAt: Date;
        try {
          nextRunAt = CronExpressionParser.parse(row.cron_expression, {
            currentDate: new Date(),
            tz: row.timezone,
          })
            .next()
            .toDate();
        } catch (err) {
          this.logger.error(
            { err, scheduledJobId: row.id, cronExpression: row.cron_expression },
            'invalid cron expression, disabling scheduled job',
          );
          await client.query('UPDATE scheduled_jobs SET is_enabled = false, updated_at = now() WHERE id = $1', [
            row.id,
          ]);
          continue;
        }

        await client.query(
          'UPDATE scheduled_jobs SET next_run_at = $2, last_run_at = now(), updated_at = now() WHERE id = $1',
          [row.id, nextRunAt],
        );
      }

      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK');
      this.logger.error({ err }, 'recurring materializer tick failed');
    } finally {
      client.release();
    }
  }
}
