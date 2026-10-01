import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Interval } from '@nestjs/schedule';
import { JobLockService } from '../jobs/job-lock.service.js';
import { PreviewService } from './preview.service.js';

const TICK_MS = 10_000;
/** Builds per tick; each can take a while for a large book. */
const BATCH = 3;

/** Builds queued previews in the background, one instance at a time (lease lock). */
@Injectable()
export class PreviewWorker {
  private readonly enabled: boolean;

  constructor(
    private readonly previews: PreviewService,
    private readonly locks: JobLockService,
    config: ConfigService,
  ) {
    // Tests drive `previews.processNext()` directly.
    this.enabled = config.get<string>('NODE_ENV') !== 'test';
  }

  @Interval('preview-builds', TICK_MS)
  async tick(): Promise<void> {
    if (!this.enabled) return;
    await this.locks.runExclusive('preview-builds', 20 * 60_000, async () => {
      for (let i = 0; i < BATCH; i += 1) {
        if (!(await this.previews.processNext())) break;
      }
    });
  }
}
