import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import type { Model } from 'mongoose';
import {
  EmailOutbox,
  type DeliveryStatus,
} from './schemas/email-outbox.schema.js';
import {
  EmailSuppression,
  type SuppressionReason,
} from './schemas/email-suppression.schema.js';

/** The subset of a Resend webhook event this service reads. */
export interface ResendEmailEvent {
  type: string;
  created_at: string;
  data: {
    email_id?: string;
    to?: string[];
    bounce?: { type?: string; subType?: string; message?: string };
  };
}

const STATUS_BY_EVENT: Record<string, DeliveryStatus> = {
  'email.delivered': 'delivered',
  'email.delivery_delayed': 'delivery_delayed',
  'email.bounced': 'bounced',
  'email.complained': 'complained',
  'email.failed': 'failed',
  'email.suppressed': 'suppressed',
};

/**
 * Applies Resend delivery events to the outbox and maintains the suppression list. Every
 * operation is idempotent (a timestamped set and an upsert), so redelivered webhooks are harmless.
 */
@Injectable()
export class MailWebhooksService {
  private readonly logger = new Logger(MailWebhooksService.name);

  constructor(
    @InjectModel(EmailOutbox.name) private readonly outbox: Model<EmailOutbox>,
    @InjectModel(EmailSuppression.name)
    private readonly suppressions: Model<EmailSuppression>,
  ) {}

  async apply(event: ResendEmailEvent): Promise<void> {
    const status = STATUS_BY_EVENT[event.type];
    const messageId = event.data?.email_id;
    if (!status || !messageId) return;

    const at = new Date(event.created_at);
    const eventTime = Number.isNaN(at.getTime()) ? new Date() : at;

    // Events can arrive out of order; only move forward in time.
    await this.outbox
      .updateOne(
        {
          providerMessageId: messageId,
          $or: [
            { deliveryUpdatedAt: null },
            { deliveryUpdatedAt: { $lte: eventTime } },
          ],
        },
        { $set: { deliveryStatus: status, deliveryUpdatedAt: eventTime } },
      )
      .exec();

    const reason = this.suppressionReason(event);
    const recipient = event.data.to?.[0]?.trim().toLowerCase();
    if (reason && recipient) {
      await this.suppressions
        .updateOne(
          { email: recipient },
          {
            $setOnInsert: {
              email: recipient,
              reason,
              detail: event.data.bounce?.message?.slice(0, 500) ?? event.type,
            },
          },
          { upsert: true },
        )
        .exec();
      this.logger.warn(`Suppressed ${recipient} after ${event.type}`);
    }
  }

  /** Hard bounces, complaints and provider-side suppressions stop future non-critical email. */
  private suppressionReason(event: ResendEmailEvent): SuppressionReason | null {
    if (event.type === 'email.complained') return 'complaint';
    if (event.type === 'email.suppressed') return 'bounce';
    if (
      event.type === 'email.bounced' &&
      event.data.bounce?.type === 'Permanent'
    )
      return 'bounce';
    return null;
  }
}
