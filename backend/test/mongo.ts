import { MongoMemoryReplSet } from 'mongodb-memory-server';

/**
 * Single-node in-memory replica set for service specs. A replica set, not a standalone server,
 * because money paths use transactions (docs/ARCHITECTURE.md §15). `launchTimeout` is raised
 * because mongod's own 10s default fails on a cold machine.
 */
export async function startMongo(): Promise<MongoMemoryReplSet> {
  return MongoMemoryReplSet.create({
    replSet: { count: 1, storageEngine: 'wiredTiger' },
    instanceOpts: [{ launchTimeout: 60_000 }],
  });
}
