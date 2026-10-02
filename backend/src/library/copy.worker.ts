import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Interval } from '@nestjs/schedule';
import { JobLockService } from '../jobs/job-lock.service.js';
import { CopiesService } from './copies.service.js';

const TICK_MS = 5_000;
/** Copies per tick; each loads a whole book, so the batch stays small. */
const BATCH = 3;

/** Makes buyers' personal copies in the background, one instance at a time (lease lock). */
@Injectable()
export class CopyWorker {
  private readonly enabled: boolean;

  constructor(
    private readonly copies: CopiesService,
    private readonly locks: JobLockService,
    config: ConfigService,
  ) {
    // Tests drive `copies.processNext()` and `queueNew()` directly.
    this.enabled = config.get<string>('NODE_ENV') !== 'test';
  }

  @Interval('ebook-copies', TICK_MS)
  async tick(): Promise<void> {
    if (!this.enabled) return;
    await this.locks.runExclusive('ebook-copies', 20 * 60_000, async () => {
      for (let i = 0; i < BATCH; i += 1) {
        if (!(await this.copies.processNext())) break;
      }
    });
  }

  /** New purchases get their copy started straight away, before the buyer opens the book. */
  @Interval('ebook-copies-new', 30_000)
  async sweep(): Promise<void> {
    if (!this.enabled) return;
    await this.locks.runExclusive('ebook-copies-new', 60_000, async () => {
      await this.copies.queueNew();
    });
  }
}
