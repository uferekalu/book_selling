import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectModel } from '@nestjs/mongoose';
import { Interval } from '@nestjs/schedule';
import type { Model } from 'mongoose';
import { JobLockService } from '../jobs/job-lock.service.js';
import { AttachmentRegistry, type ResolvedAttachment } from './attachments.js';
import { MailService } from './mail.service.js';
import {
  MAX_ATTEMPTS,
  RETENTION_MS,
  SEND_LEASE_MS,
  retryDelayMs,
} from './retry-policy.js';
import {
  EmailOutbox,
  type EmailOutboxDocument,
} from './schemas/email-outbox.schema.js';
import {
  TemplateRendererService,
  type RenderedEmail,
} from './template-renderer.service.js';
import { EMAIL_TEMPLATES, isTemplateName } from './templates/registry.js';
import {
  EMAIL_TRANSPORT,
  EmailSendError,
  type EmailTransport,
} from './transports/email-transport.js';

const TICK_MS = 5_000;
const BATCH_SIZE = 25;

/**
 * Delivers the email outbox (docs/ARCHITECTURE.md §11). Every few seconds, under a job lease so
 * only one API instance works at a time, it claims due rows atomically, renders them, sends them
 * through the transport with the outbox id as idempotency key, and records the outcome. Retryable
 * failures back off; permanent ones and exhausted retries become `dead` and alert the owner.
 */
/** Attempts to build an email's attachments before it is sent without them. */
const ATTACHMENT_ATTEMPTS = 3;

@Injectable()
export class OutboxWorker {
  private readonly logger = new Logger(OutboxWorker.name);
  private readonly from: string;
  private readonly replyTo: string | undefined;
  private readonly ownerAlertEmail: string | undefined;
  private readonly enabled: boolean;

  constructor(
    @InjectModel(EmailOutbox.name) private readonly outbox: Model<EmailOutbox>,
    @Inject(EMAIL_TRANSPORT) private readonly transport: EmailTransport,
    private readonly renderer: TemplateRendererService,
    private readonly mail: MailService,
    private readonly locks: JobLockService,
    private readonly attachmentFiles: AttachmentRegistry,
    config: ConfigService,
  ) {
    this.from =
      config.get<string>('MAIL_FROM') ||
      `${renderer.brand.name} <onboarding@resend.dev>`;
    this.replyTo =
      config.get<string>('MAIL_REPLY_TO') ||
      config.get<string>('SUPPORT_EMAIL') ||
      undefined;
    this.ownerAlertEmail = config.get<string>('OWNER_ALERT_EMAIL') || undefined;
    // Tests drive `processDue()` directly with a controlled clock instead of the timer.
    this.enabled = config.get<string>('NODE_ENV') !== 'test';
  }

  @Interval('mail-outbox', TICK_MS)
  async tick(): Promise<void> {
    if (!this.enabled) return;
    await this.locks.runExclusive('mail-outbox', 60_000, async () => {
      await this.processDue();
    });
  }

  /** Delivers everything due at `now`. Returns how many rows were attempted. */
  async processDue(
    now: Date = new Date(),
    limit = BATCH_SIZE,
  ): Promise<number> {
    await this.reclaimStale(now);
    let processed = 0;
    while (processed < limit) {
      const row = await this.claimNext(now);
      if (!row) break;
      await this.deliver(row, now);
      processed += 1;
    }
    return processed;
  }

  /**
   * A row stuck in `sending` past its lease means a worker died mid-send. It may or may not
   * have reached the provider; retrying is safe because the idempotency key is the outbox id.
   */
  private async reclaimStale(now: Date): Promise<void> {
    const result = await this.outbox
      .updateMany(
        { status: 'sending', lockedUntil: { $lt: now } },
        {
          $set: {
            status: 'failed',
            nextAttemptAt: now,
            lockedUntil: null,
            lastError:
              'Worker lease expired mid-send; retrying with the same idempotency key',
          },
        },
      )
      .exec();
    if (result.modifiedCount > 0) {
      this.logger.warn(`Reclaimed ${result.modifiedCount} stale outbox row(s)`);
    }
  }

  private claimNext(now: Date): Promise<EmailOutboxDocument | null> {
    return this.outbox
      .findOneAndUpdate(
        { status: { $in: ['queued', 'failed'] }, nextAttemptAt: { $lte: now } },
        {
          $set: {
            status: 'sending',
            lockedUntil: new Date(now.getTime() + SEND_LEASE_MS),
          },
          $inc: { attempts: 1 },
        },
        { sort: { nextAttemptAt: 1 }, returnDocument: 'after' },
      )
      .exec();
  }

  private async deliver(row: EmailOutboxDocument, now: Date): Promise<void> {
    const id = row._id.toString();

    if (row.category !== 'critical' && (await this.mail.isSuppressed(row.to))) {
      await this.finish(row, now, {
        status: 'suppressed',
        lastError: 'Recipient is on the suppression list',
      });
      return;
    }

    let rendered: RenderedEmail;
    try {
      rendered = await this.renderer.render(row.template, row.data);
    } catch (error) {
      // A template bug or bad data: retrying can't fix it.
      await this.fail(
        row,
        now,
        new EmailSendError(`Render failed: ${(error as Error).message}`, false),
      );
      return;
    }

    let attachments: ResolvedAttachment[] = [];
    if (row.attachments?.length) {
      try {
        attachments = await this.attachmentFiles.resolve(row.attachments);
      } catch (error) {
        // The email matters more than its attachment (a receipt also links to the invoice):
        // retry a couple of times, then send it without.
        if (row.attempts < ATTACHMENT_ATTEMPTS) {
          await this.fail(
            row,
            now,
            new EmailSendError(
              `Attachment failed: ${(error as Error).message}`,
              true,
            ),
            rendered.subject,
          );
          return;
        }
        this.logger.warn(
          `Sending ${row.template} (${id}) without its attachment: ${(error as Error).message}`,
        );
      }
    }

    try {
      const { providerMessageId } = await this.transport.send({
        from: this.from,
        to: row.to,
        replyTo: this.replyTo,
        subject: rendered.subject,
        html: rendered.html,
        text: rendered.text,
        idempotencyKey: `outbox-${id}`,
        tags: { template: row.template, category: row.category },
        ...(attachments.length ? { attachments } : {}),
      });
      const sensitive =
        isTemplateName(row.template) && EMAIL_TEMPLATES[row.template].sensitive;
      await this.finish(row, now, {
        status: 'sent',
        sentAt: now,
        subject: rendered.subject,
        providerMessageId,
        lastError: null,
        // One-time links must not sit in the database after they've been delivered.
        ...(sensitive ? { data: null } : {}),
      });
      this.logger.log(`Sent ${row.template} (${id}) to ${row.to}`);
    } catch (error) {
      const sendError =
        error instanceof EmailSendError
          ? error
          : new EmailSendError((error as Error).message, true);
      await this.fail(row, now, sendError, rendered.subject);
    }
  }

  private async fail(
    row: EmailOutboxDocument,
    now: Date,
    error: EmailSendError,
    subject?: string,
  ) {
    const giveUp = !error.retryable || row.attempts >= MAX_ATTEMPTS;
    if (!giveUp) {
      await this.outbox
        .updateOne(
          { _id: row._id, status: 'sending' },
          {
            $set: {
              status: 'failed',
              lockedUntil: null,
              lastError: error.message,
              nextAttemptAt: new Date(
                now.getTime() + retryDelayMs(row.attempts),
              ),
              ...(subject ? { subject } : {}),
            },
          },
        )
        .exec();
      this.logger.warn(
        `Retrying ${row.template} (${row._id.toString()}) after attempt ${row.attempts}: ${error.message}`,
      );
      return;
    }

    await this.finish(row, now, {
      status: 'dead',
      lastError: error.message,
      ...(subject ? { subject } : {}),
    });
    this.logger.error(
      `Gave up on ${row.template} (${row._id.toString()}) to ${row.to}: ${error.message}`,
    );
    await this.alertOwner(row, error.message);
  }

  private async finish(
    row: EmailOutboxDocument,
    now: Date,
    fields: Partial<EmailOutbox>,
  ) {
    await this.outbox
      .updateOne(
        { _id: row._id, status: 'sending' },
        {
          $set: {
            ...fields,
            lockedUntil: null,
            expireAt: new Date(now.getTime() + RETENTION_MS),
          },
        },
      )
      .exec();
  }

  private async alertOwner(row: EmailOutboxDocument, lastError: string) {
    // Never alert about a failed alert: that loops if the owner's own address is the problem.
    if (!this.ownerAlertEmail || row.template === 'ops.email-dead-letter')
      return;
    await this.mail.enqueue({
      to: this.ownerAlertEmail,
      template: 'ops.email-dead-letter',
      dedupeKey: `email-dead-letter:${row._id.toString()}`,
      data: {
        outboxId: row._id.toString(),
        recipient: row.to,
        template: row.template,
        attempts: row.attempts,
        lastError: lastError.slice(0, 500),
      },
    });
  }
}
