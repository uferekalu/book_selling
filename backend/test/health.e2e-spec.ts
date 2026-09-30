import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import type { App } from 'supertest/types.js';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { setupApp } from '../src/setup-app.js';
import { applyTestEnv } from './test-env.js';

interface HealthResponseBody {
  status: string;
  info?: { mongodb?: { status: string } };
}

describe('Health (e2e)', () => {
  let app: INestApplication<App>;
  let mongod: MongoMemoryServer;

  beforeAll(async () => {
    // mongod's own 10s launch wait is too short on a cold machine.
    mongod = await MongoMemoryServer.create({
      instance: { launchTimeout: 60_000 },
    });
    applyTestEnv(mongod.getUri());
    const { AppModule } = await import('../src/app.module.js');
    const moduleFixture = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleFixture.createNestApplication();
    setupApp(app);
    await app.init();
  }, 90_000);

  afterAll(async () => {
    if (app) await app.close();
    if (mongod) await mongod.stop();
  });

  it('GET /health reports ok when MongoDB is reachable', async () => {
    const response = await request(app.getHttpServer())
      .get('/health')
      .expect(200);
    const body = response.body as HealthResponseBody;
    expect(body.status).toBe('ok');
    expect(body.info?.mongodb?.status).toBe('up');
  });

  it('returns the standard error shape for an unknown route', async () => {
    const response = await request(app.getHttpServer())
      .get('/does-not-exist')
      .expect(404);
    expect(response.body).toMatchObject({
      statusCode: 404,
      path: '/does-not-exist',
    });
  });
});
