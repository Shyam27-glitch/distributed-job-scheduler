import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { Pool } from 'pg';
import { createLogger } from '@job-scheduler/shared';
import { createApp } from '../src/app';

describe('auth', () => {
  const connectionString = process.env.DATABASE_URL ?? 'postgres://postgres:postgres@localhost:5432/job_scheduler';
  const pool = new Pool({ connectionString });
  const app = createApp(createLogger('api-test', 'silent'), pool, 'test-secret');

  const email = `auth-test-${randomUUID()}@test.com`;
  const organizationName = `auth-test-org-${randomUUID()}`;
  let organizationId: string | undefined;

  afterAll(async () => {
    if (organizationId) {
      await pool.query('DELETE FROM organizations WHERE id = $1', [organizationId]);
    }
    await pool.end();
  });

  it('registers a new organization + user and returns a token', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({ organizationName, email, password: 'pass1234' });

    expect(res.status).toBe(201);
    expect(res.body.token).toEqual(expect.any(String));
    expect(res.body.user.email).toBe(email);
    organizationId = res.body.organization.id;
  });

  it('rejects a duplicate email on register', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({ organizationName: `${organizationName}-dup`, email, password: 'pass1234' });

    expect(res.status).toBe(409);
  });

  it('rejects a duplicate organization name on register', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({ organizationName, email: `other-${email}`, password: 'pass1234' });

    expect(res.status).toBe(409);
  });

  it('logs in with correct credentials', async () => {
    const res = await request(app).post('/api/auth/login').send({ email, password: 'pass1234' });
    expect(res.status).toBe(200);
    expect(res.body.token).toEqual(expect.any(String));
  });

  it('rejects login with the wrong password', async () => {
    const res = await request(app).post('/api/auth/login').send({ email, password: 'wrong-password' });
    expect(res.status).toBe(401);
  });

  it('rejects login for an unknown email', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: `does-not-exist-${randomUUID()}@test.com`, password: 'pass1234' });
    expect(res.status).toBe(401);
  });

  it('rejects /me without a token', async () => {
    const res = await request(app).get('/api/auth/me');
    expect(res.status).toBe(401);
  });

  it('rejects /me with a malformed token', async () => {
    const res = await request(app).get('/api/auth/me').set('Authorization', 'Bearer not-a-real-token');
    expect(res.status).toBe(401);
  });

  it('accepts /me with a valid token', async () => {
    const login = await request(app).post('/api/auth/login').send({ email, password: 'pass1234' });
    const res = await request(app).get('/api/auth/me').set('Authorization', `Bearer ${login.body.token}`);
    expect(res.status).toBe(200);
    expect(res.body.user.email).toBe(email);
  });
});
