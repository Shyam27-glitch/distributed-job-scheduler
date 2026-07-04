import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { Pool } from 'pg';
import { createLogger } from '@job-scheduler/shared';
import { createApp } from '../src/app';

describe('dead letter queue retry routing', () => {
  const connectionString = process.env.DATABASE_URL ?? 'postgres://postgres:postgres@localhost:5432/job_scheduler';
  const pool = new Pool({ connectionString });
  const app = createApp(createLogger('api-test', 'silent'), pool, 'test-secret');

  let organizationId: string;
  let token: string;
  let queueId: string;
  let jobId: string;

  beforeAll(async () => {
    const email = `dlq-test-${randomUUID()}@test.com`;
    const register = await request(app)
      .post('/api/auth/register')
      .send({ organizationName: `dlq-org-${randomUUID()}`, email, password: 'pass1234' });
    token = register.body.token;
    organizationId = register.body.organization.id;

    const project = await request(app)
      .post('/api/projects')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'dlq-project' });

    const retryPolicy = await request(app)
      .post('/api/retry-policies')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'no-retries', strategy: 'fixed', maxRetries: 0 });

    const queue = await request(app)
      .post(`/api/projects/${project.body.id}/queues`)
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'dlq-queue', retryPolicyId: retryPolicy.body.id });
    queueId = queue.body.id;

    // Simulate a job that already exhausted retries (the worker's failure path is
    // covered by worker/test/failureHandler.test.ts) so we can test the API's
    // manual-retry endpoint in isolation.
    const jobInsert = await pool.query<{ id: string }>(
      `INSERT INTO jobs (queue_id, job_type, status, retry_count, last_error, payload, idempotency_key)
       VALUES ($1, 'immediate', 'dead_lettered', 3, 'always fails', '{}', 'dlq-job-1') RETURNING id`,
      [queueId],
    );
    jobId = jobInsert.rows[0].id;
    await pool.query(
      `INSERT INTO dead_letter_queue (job_id, queue_id, final_error, retry_count, payload_snapshot)
       VALUES ($1, $2, 'always fails', 3, '{}')`,
      [jobId, queueId],
    );
  });

  afterAll(async () => {
    await pool.query('DELETE FROM organizations WHERE id = $1', [organizationId]);
    await pool.end();
  });

  it('lists the dead-lettered job in the queue DLQ view', async () => {
    const res = await request(app)
      .get(`/api/queues/${queueId}/dead-letter`)
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.deadLetterEntries).toHaveLength(1);
    expect(res.body.deadLetterEntries[0]).toMatchObject({ jobId, resolved: false });
  });

  it('rejects retrying a job that is not dead-lettered', async () => {
    const nonDlqJob = await pool.query<{ id: string }>(
      `INSERT INTO jobs (queue_id, job_type, status, payload, idempotency_key)
       VALUES ($1, 'immediate', 'queued', '{}', 'dlq-job-not-dead') RETURNING id`,
      [queueId],
    );
    const res = await request(app)
      .post(`/api/jobs/${nonDlqJob.rows[0].id}/retry`)
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(400);
  });

  it('retries a dead-lettered job: resets it to queued and resolves the DLQ entry', async () => {
    const res = await request(app).post(`/api/jobs/${jobId}/retry`).set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ status: 'queued', retryCount: 0 });

    const dlqRow = await pool.query('SELECT resolved FROM dead_letter_queue WHERE job_id = $1', [jobId]);
    expect(dlqRow.rows[0].resolved).toBe(true);

    const executions = await request(app)
      .get(`/api/jobs/${jobId}/executions`)
      .set('Authorization', `Bearer ${token}`);
    expect(executions.body.executions).toContainEqual(
      expect.objectContaining({ fromStatus: 'dead_lettered', toStatus: 'queued', reason: 'manual_retry' }),
    );
  });

  it('rejects retrying the same job again now that it is queued, not dead-lettered', async () => {
    const res = await request(app).post(`/api/jobs/${jobId}/retry`).set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(400);
  });

  it('does not allow retrying a job belonging to another organization', async () => {
    const otherEmail = `dlq-other-${randomUUID()}@test.com`;
    const otherRegister = await request(app)
      .post('/api/auth/register')
      .send({ organizationName: `dlq-other-org-${randomUUID()}`, email: otherEmail, password: 'pass1234' });

    const res = await request(app)
      .post(`/api/jobs/${jobId}/retry`)
      .set('Authorization', `Bearer ${otherRegister.body.token}`);
    expect(res.status).toBe(404);

    await pool.query('DELETE FROM organizations WHERE id = $1', [otherRegister.body.organization.id]);
  });
});
