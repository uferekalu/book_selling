import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Interval } from '@nestjs/schedule';
import { JobLockService } from '../jobs/job-lock.service.js';
import { OrdersService } from './orders.service.js';

/** Every minute: unpaid orders past their window expire and release stock and coupon (§8.6). */
@Injectable()
export class OrderExpiryJob {
  private readonly enabled: boolean;

  constructor(
    private readonly orders: OrdersService,
    private readonly locks: JobLockService,
    config: ConfigService,
  ) {
    this.enabled = config.get<string>('NODE_ENV') !== 'test';
  }

  @Interval('order-expiry', 60_000)
  async tick(): Promise<void> {
    if (!this.enabled) return;
    await this.locks.runExclusive('order-expiry', 5 * 60_000, async () => {
      await this.orders.expireDue();
    });
  }
}
