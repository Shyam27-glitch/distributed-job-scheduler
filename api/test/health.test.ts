import request from 'supertest';
import { createLogger } from '@job-scheduler/shared';
import { createApp } from '../src/app';

describe('GET /health', () => {
  it('returns ok', async () => {
    const app = createApp(createLogger('api-test'));
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: 'ok' });
  });
});
