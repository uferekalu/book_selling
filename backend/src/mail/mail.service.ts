import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Types, type ClientSession, type Model } from 'mongoose';
import { RETENTION_MS } from './retry-policy.js';
import {
  EmailOutbox,
  type EmailOutboxDocument,
} from './schemas/email-outbox.schema.js';
import { EmailSuppression } from './schemas/email-suppression.schema.js';
import {
  EMAIL_TEMPLATES,
  type TemplateData,
  type TemplateName,
} from './templates/registry.js';

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export interface EnqueueEmail<N extends TemplateName> {
  to: string;
  template: N;
  data: TemplateData<N>;
  /** One email per business event, e.g. `verify-email:<tokenId>`. Re-enqueueing is a no-op. */
  dedupeKey: string;
  /** Deliver no earlier than this, e.g. "unread message" reminders (docs/ARCHITECTURE.md §11). */
  sendAfter?: Date;
}

/**
 * The only way the platform sends email. Callers enqueue; `OutboxWorker` delivers. Pass the
 * caller's `session` so the email commits or rolls back together with the state change that
 * triggered it (e.g. a receipt with a paid order).
 */
@Injectable()
export class MailService {
  constructor(
    @InjectModel(EmailOutbox.name) private readonly outbox: Model<EmailOutbox>,
    @InjectModel(EmailSuppression.name)
    private readonly suppressions: Model<EmailSuppression>,
  ) {}

  /**
   * Idempotent: an upsert on `dedupeKey`, so a second call returns the existing row. It is
   * deliberately not an insert-and-catch-duplicate, because a duplicate-key error inside a
   * transaction aborts the caller's whole transaction.
   */
  async enqueue<N extends TemplateName>(
    email: EnqueueEmail<N>,
    session?: ClientSession,
  ): Promise<EmailOutboxDocument> {
    const to = email.to.trim().toLowerCase();
    if (!EMAIL_PATTERN.test(to))
      throw new Error(`Invalid recipient email "${email.to}"`);
    if (!email.dedupeKey) throw new Error('An email needs a dedupeKey');
    const definition = EMAIL_TEMPLATES[email.template];

    const row = await this.outbox
      .findOneAndUpdate(
        { dedupeKey: email.dedupeKey },
        {
          $setOnInsert: {
            to,
            template: email.template,
            data: email.data,
            category: definition.category,
            dedupeKey: email.dedupeKey,
            status: 'queued',
            attempts: 0,
            nextAttemptAt: email.sendAfter ?? new Date(),
          },
        },
        { upsert: true, returnDocument: 'after', session },
      )
      .exec();
    return row;
  }

  /** Withdraws an email that hasn't been sent yet. Returns true if it was cancelled. */
  async cancel(dedupeKey: string, session?: ClientSession): Promise<boolean> {
    const result = await this.outbox
      .updateOne(
        { dedupeKey, status: { $in: ['queued', 'failed'] } },
        {
          $set: {
            status: 'cancelled',
            expireAt: new Date(Date.now() + RETENTION_MS),
            lockedUntil: null,
          },
        },
        { session },
      )
      .exec();
    return result.modifiedCount === 1;
  }

  /**
   * Puts a dead or failed email back in the queue once its cause is fixed (admin action). Not
   * possible for a sent sensitive email: its one-time link was erased.
   */
  async requeue(outboxId: string): Promise<boolean> {
    if (!Types.ObjectId.isValid(outboxId)) return false;
    const result = await this.outbox
      .updateOne(
        {
          _id: new Types.ObjectId(outboxId),
          status: { $in: ['dead', 'failed'] },
          data: { $ne: null },
        },
        {
          $set: {
            status: 'queued',
            attempts: 0,
            nextAttemptAt: new Date(),
            lastError: null,
            expireAt: null,
          },
        },
      )
      .exec();
    return result.modifiedCount === 1;
  }

  async isSuppressed(email: string): Promise<boolean> {
    const found = await this.suppressions
      .exists({ email: email.trim().toLowerCase() })
      .exec();
    return found !== null;
  }
}
