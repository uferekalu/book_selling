import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import type { MongoMemoryReplSet } from 'mongodb-memory-server';
import type { App } from 'supertest/types.js';
import { setupApp } from '../src/setup-app.js';
import { startMongo } from './mongo.js';
import { applyTestEnv } from './test-env.js';

export interface TestApp {
  app: INestApplication<App>;
  mongod: MongoMemoryReplSet;
  close: () => Promise<void>;
}

/**
 * Boots the real AppModule exactly as production does: env first, then the module (dynamic
 * import), `rawBody: true` (webhook signatures need the exact bytes, as in main.ts), and
 * `setupApp()`. Every e2e spec goes through this, so none can forget a step.
 */
export async function createTestApp(): Promise<TestApp> {
  const mongod = await startMongo();
  applyTestEnv(mongod.getUri());
  const { AppModule } = await import('../src/app.module.js');
  const moduleFixture = await Test.createTestingModule({
    imports: [AppModule],
  }).compile();
  const app = moduleFixture.createNestApplication<NestExpressApplication>({
    rawBody: true,
  });
  setupApp(app);
  await app.init();
  return {
    app: app as unknown as INestApplication<App>,
    mongod,
    close: async () => {
      await app.close();
      await mongod.stop();
    },
  };
}
