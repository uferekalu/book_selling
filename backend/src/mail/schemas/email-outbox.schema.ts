import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Schema as MongooseSchema, type HydratedDocument } from 'mongoose';

export const OUTBOX_STATUSES = [
  'queued', // waiting for its first attempt (or for `nextAttemptAt` when delayed)
  'sending', // claimed by a worker, lease in `lockedUntil`
  'failed', // last attempt failed with a retryable error; retried at `nextAttemptAt`
  'sent', // accepted by the provider (final)
  'dead', // gave up: permanent error or retries exhausted (final, alerts the owner)
  'suppressed', // not sent: recipient bounced/complained earlier (final)
  'cancelled', // withdrawn before sending, e.g. a message read in time (final)
] as const;
export type OutboxStatus = (typeof OUTBOX_STATUSES)[number];

export const DELIVERY_STATUSES = [
  'delivered',
  'delivery_delayed',
  'bounced',
  'complained',
  'failed',
  'suppressed',
] as const;
export type DeliveryStatus = (typeof DELIVERY_STATUSES)[number];

export const EMAIL_CATEGORIES = ['critical', 'notification'] as const;
/**
 * `critical`: account security and money (verification, reset, receipts). Always attempted,
 * even to a suppressed address, because the person explicitly needs it.
 * `notification`: everything else. Skipped for suppressed addresses.
 */
export type EmailCategory = (typeof EMAIL_CATEGORIES)[number];

/**
 * The transactional outbox (docs/ARCHITECTURE.md §11). Business code inserts a row, inside the
 * same transaction as the state change that caused it when there is one. The worker delivers it.
 * Nothing calls the email provider directly.
 */
@Schema({ collection: 'email_outbox', timestamps: true })
export class EmailOutbox {
  @Prop({ type: String, required: true, lowercase: true, trim: true })
  to: string;

  @Prop({ type: String, required: true })
  template: string;

  /** Template input. Nulled after sending for templates marked sensitive (links with tokens). */
  @Prop({ type: MongooseSchema.Types.Mixed, default: null })
  data: Record<string, unknown> | null;

  @Prop({ type: String, enum: EMAIL_CATEGORIES, required: true })
  category: EmailCategory;

  /** One email per business event, e.g. `order-receipt:<orderId>`. Enqueueing twice is a no-op. */
  @Prop({ type: String, required: true, unique: true })
  dedupeKey: string;

  @Prop({ type: String, enum: OUTBOX_STATUSES, default: 'queued' })
  status: OutboxStatus;

  @Prop({ type: Number, default: 0 })
  attempts: number;

  /** When the next attempt may run. Also implements delayed sending (`sendAfter`). */
  @Prop({ type: Date, required: true })
  nextAttemptAt: Date;

  @Prop({ type: Date, default: null })
  lockedUntil: Date | null;

  @Prop({ type: String, default: null })
  subject: string | null;

  @Prop({ type: String, default: null, index: { sparse: true } })
  providerMessageId: string | null;

  @Prop({ type: String, default: null })
  lastError: string | null;

  @Prop({ type: Date, default: null })
  sentAt: Date | null;

  @Prop({ type: String, enum: [...DELIVERY_STATUSES, null], default: null })
  deliveryStatus: DeliveryStatus | null;

  @Prop({ type: Date, default: null })
  deliveryUpdatedAt: Date | null;

  /** Set when the row reaches a final state; a TTL index removes it 180 days later. */
  @Prop({ type: Date, default: null })
  expireAt: Date | null;
}

export type EmailOutboxDocument = HydratedDocument<EmailOutbox>;
export const EmailOutboxSchema = SchemaFactory.createForClass(EmailOutbox);

// The worker's claim query: due rows in a claimable state, oldest first.
EmailOutboxSchema.index({ status: 1, nextAttemptAt: 1 });
EmailOutboxSchema.index({ expireAt: 1 }, { expireAfterSeconds: 0 });
