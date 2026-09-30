import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { randomUUID } from 'node:crypto';
import type { Model } from 'mongoose';
import { JobLock } from './schemas/job-lock.schema.js';

const DUPLICATE_KEY = 11000;

/**
 * Lease-based mutual exclusion for scheduled jobs, backed by MongoDB so it holds across several
 * API instances (docs/ARCHITECTURE.md §8.6). A lease expires on its own, so a crashed instance
 * never blocks a job forever.
 */
@Injectable()
export class JobLockService {
  private readonly logger = new Logger(JobLockService.name);
  /** Identifies this process. A lease can be renewed only by its owner. */
  readonly instanceId = randomUUID();

  constructor(
    @InjectModel(JobLock.name) private readonly locks: Model<JobLock>,
  ) {}

  async acquire(name: string, leaseMs: number): Promise<boolean> {
    const now = new Date();
    try {
      const lock = await this.locks
        .findOneAndUpdate(
          {
            _id: name,
            $or: [{ lockedUntil: { $lte: now } }, { owner: this.instanceId }],
          },
          {
            $set: {
              owner: this.instanceId,
              lockedUntil: new Date(now.getTime() + leaseMs),
            },
          },
          { upsert: true, returnDocument: 'after' },
        )
        .exec();
      return lock?.owner === this.instanceId;
    } catch (error) {
      // Upsert race: another instance created the lock document first, so it holds the lease.
      if ((error as { code?: number }).code === DUPLICATE_KEY) return false;
      throw error;
    }
  }

  async release(name: string): Promise<void> {
    await this.locks
      .updateOne(
        { _id: name, owner: this.instanceId },
        { $set: { lockedUntil: new Date(0) } },
      )
      .exec();
  }

  /**
   * Runs `task` only if the lease was acquired. Returns `false` when another instance holds the
   * lease. The lease is released afterwards even if the task throws; errors are logged, not
   * rethrown, so one failed run never kills the scheduler.
   */
  async runExclusive(
    name: string,
    leaseMs: number,
    task: () => Promise<void>,
  ): Promise<boolean> {
    if (!(await this.acquire(name, leaseMs))) return false;
    try {
      await task();
    } catch (error) {
      this.logger.error(`Job "${name}" failed`, error as Error);
    } finally {
      await this.release(name);
    }
    return true;
  }
}
