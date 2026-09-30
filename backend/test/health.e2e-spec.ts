import request from 'supertest';
import { createTestApp, type TestApp } from './app.js';

interface HealthResponseBody {
  status: string;
  info?: { mongodb?: { status: string } };
}

describe('Health (e2e)', () => {
  let ctx: TestApp;

  beforeAll(async () => {
    ctx = await createTestApp();
  });

  afterAll(async () => {
    await ctx?.close();
  });

  it('GET /health reports ok when MongoDB is reachable', async () => {
    const response = await request(ctx.app.getHttpServer())
      .get('/health')
      .expect(200);
    const body = response.body as HealthResponseBody;
    expect(body.status).toBe('ok');
    expect(body.info?.mongodb?.status).toBe('up');
  });

  it('returns the standard error shape for an unknown route', async () => {
    const response = await request(ctx.app.getHttpServer())
      .get('/does-not-exist')
      .expect(404);
    expect(response.body).toMatchObject({
      statusCode: 404,
      path: '/does-not-exist',
    });
  });
});
