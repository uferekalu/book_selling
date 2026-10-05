import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
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
import { MailService } from './mail.service.js';
import { BOUNCE_ALERT_TEMPLATES, templateLabel } from './template-labels.js';

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
  private readonly ownerEmail: string | null;
  private readonly frontendUrl: string;

  constructor(
    @InjectModel(EmailOutbox.name) private readonly outbox: Model<EmailOutbox>,
    @InjectModel(EmailSuppression.name)
    private readonly suppressions: Model<EmailSuppression>,
    private readonly mail: MailService,
    config: ConfigService,
  ) {
    this.ownerEmail = config.get<string>('OWNER_ALERT_EMAIL') || null;
    this.frontendUrl = (config.get<string>('FRONTEND_URL') ?? '').replace(
      /\/+$/,
      '',
    );
  }

  async apply(event: ResendEmailEvent): Promise<void> {
    const status = STATUS_BY_EVENT[event.type];
    const messageId = event.data?.email_id;
    if (!status || !messageId) return;

    const at = new Date(event.created_at);
    const eventTime = Number.isNaN(at.getTime()) ? new Date() : at;

    // Events can arrive out of order; only move forward in time.
    const row = await this.outbox
      .findOneAndUpdate(
        {
          providerMessageId: messageId,
          $or: [
            { deliveryUpdatedAt: null },
            { deliveryUpdatedAt: { $lte: eventTime } },
          ],
        },
        { $set: { deliveryStatus: status, deliveryUpdatedAt: eventTime } },
        { returnDocument: 'after' },
      )
      .exec();
    if (row && (status === 'bounced' || status === 'failed')) {
      await this.alertBounce(row, event);
    }

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

  /**
   * A buyer-facing email (receipt, set-your-password link, shipping notice, a reply) that
   * bounced: the buyer won't know, so the owner is told once (dedupe key per outbox row), never
   * about their own alert emails.
   */
  private async alertBounce(
    row: {
      _id: { toString(): string };
      to: string;
      template: string;
      data: Record<string, unknown> | null;
    },
    event: ResendEmailEvent,
  ): Promise<void> {
    if (!this.ownerEmail || !BOUNCE_ALERT_TEMPLATES.has(row.template)) return;
    if (row.to === this.ownerEmail.trim().toLowerCase()) return;
    const orderNumber = row.data?.orderNumber;
    await this.mail.enqueue({
      to: this.ownerEmail,
      template: 'ops.email-bounced',
      dedupeKey: `email-bounced:${row._id.toString()}`,
      data: {
        recipient: row.to,
        email: templateLabel(row.template),
        reason:
          event.data.bounce?.message?.slice(0, 300) ??
          (event.type === 'email.failed'
            ? 'The email provider could not deliver it.'
            : 'The recipient’s mail server refused it.'),
        orderNumber: typeof orderNumber === 'string' ? orderNumber : null,
        adminUrl: `${this.frontendUrl}/admin/emails`,
      },
    });
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
