import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Interval } from '@nestjs/schedule';
import { JobLockService } from '../jobs/job-lock.service.js';
import { PaymentsService } from './payments.service.js';

/** Every 5 minutes: confirm payments whose webhook never arrived (ARCHITECTURE §8.6). */
@Injectable()
export class PaymentReconciliationJob {
  private readonly enabled: boolean;

  constructor(
    private readonly payments: PaymentsService,
    private readonly locks: JobLockService,
    config: ConfigService,
  ) {
    this.enabled = config.get<string>('NODE_ENV') !== 'test';
  }

  @Interval('payment-reconciliation', 5 * 60_000)
  async tick(): Promise<void> {
    if (!this.enabled) return;
    await this.locks.runExclusive(
      'payment-reconciliation',
      10 * 60_000,
      async () => {
        await this.payments.reconcile();
      },
    );
  }
}
