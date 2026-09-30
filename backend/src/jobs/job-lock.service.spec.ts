import { Test } from '@nestjs/testing';
import { MongooseModule, getModelToken } from '@nestjs/mongoose';
import type { MongoMemoryReplSet } from 'mongodb-memory-server';
import type { Model } from 'mongoose';
import { startMongo } from '../../test/mongo.js';
import { JobLockService } from './job-lock.service.js';
import { JobLock, JobLockSchema } from './schemas/job-lock.schema.js';

describe('JobLockService', () => {
  let mongod: MongoMemoryReplSet;
  let a: JobLockService;
  let b: JobLockService;
  let locks: Model<JobLock>;
  let close: () => Promise<void>;

  beforeAll(async () => {
    mongod = await startMongo();
    const build = () =>
      Test.createTestingModule({
        imports: [
          MongooseModule.forRoot(mongod.getUri()),
          MongooseModule.forFeature([
            { name: JobLock.name, schema: JobLockSchema },
          ]),
        ],
        providers: [JobLockService],
      }).compile();
    const [moduleA, moduleB] = await Promise.all([build(), build()]);
    // Two services = two "API instances" with different instance ids.
    a = moduleA.get(JobLockService);
    b = moduleB.get(JobLockService);
    locks = moduleA.get(getModelToken(JobLock.name));
    close = async () => {
      await moduleA.close();
      await moduleB.close();
    };
  }, 90_000);

  afterAll(async () => {
    await close?.();
    await mongod?.stop();
  });

  beforeEach(async () => {
    await locks.deleteMany({});
  });

  it('grants the lease to one instance and refuses the other', async () => {
    expect(await a.acquire('job', 60_000)).toBe(true);
    expect(await b.acquire('job', 60_000)).toBe(false);
  });

  it('lets the owner renew its own lease', async () => {
    expect(await a.acquire('job', 60_000)).toBe(true);
    expect(await a.acquire('job', 60_000)).toBe(true);
  });

  it('lets another instance take over an expired lease', async () => {
    expect(await a.acquire('job', 1)).toBe(true);
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(await b.acquire('job', 60_000)).toBe(true);
  });

  it('gives exactly one winner when two instances race for a new lock', async () => {
    const results = await Promise.all([
      a.acquire('race', 60_000),
      b.acquire('race', 60_000),
    ]);
    expect(results.filter(Boolean)).toHaveLength(1);
  });

  it('runExclusive releases the lease even when the task throws', async () => {
    const ran = await a.runExclusive('job', 60_000, () =>
      Promise.reject(new Error('boom')),
    );
    expect(ran).toBe(true);
    expect(await b.acquire('job', 60_000)).toBe(true);
  });

  it('runExclusive skips the task when another instance holds the lease', async () => {
    await a.acquire('job', 60_000);
    const task = vi.fn(() => Promise.resolve());
    expect(await b.runExclusive('job', 60_000, task)).toBe(false);
    expect(task).not.toHaveBeenCalled();
  });
});
