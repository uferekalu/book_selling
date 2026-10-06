import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import type { Model, QueryFilter } from 'mongoose';
import { AuditService } from '../audit/audit.module.js';
import { toObjectId } from '../common/utils/object-id.js';
import { MailService } from './mail.service.js';
import {
  EmailOutbox,
  type DeliveryStatus,
  type OutboxStatus,
} from './schemas/email-outbox.schema.js';
import { EmailSuppression } from './schemas/email-suppression.schema.js';
import { templateLabel } from './template-labels.js';

export const PROBLEMS_PAGE = 25;

/** What went wrong, in one word the page explains in plain language. */
export type EmailProblem = 'not_sent' | 'bounced' | 'failed' | 'complained';

export interface EmailProblemView {
  id: string;
  to: string;
  template: string;
  /** What the email was, in plain words. */
  label: string;
  subject: string | null;
  problem: EmailProblem;
  status: OutboxStatus;
  deliveryStatus: DeliveryStatus | null;
  lastError: string | null;
  attempts: number;
  createdAt: Date;
  sentAt: Date | null;
  orderNumber: string | null;
  /** Only an email that was never sent, and still has its content, can be sent again. */
  canResend: boolean;
  /** Further non-essential emails to this address are paused (bounce or spam report). */
  addressPaused: boolean;
  reviewedAt: Date | null;
}

type Row = EmailOutbox & {
  _id: { toString(): string };
  createdAt: Date;
};

export const PROBLEM_FILTER: QueryFilter<EmailOutbox> = {
  $or: [
    { status: 'dead' },
    { deliveryStatus: { $in: ['bounced', 'failed', 'complained'] } },
  ],
};

/**
 * The staff Emails page (BS-30): every email that didn't reach its recipient, why, and what can
 * be done: send it again (never sent), allow an address again (paused after a bounce or spam
 * report), or mark the problem as dealt with. Every action is audited.
 */
@Injectable()
export class AdminEmailsService {
  constructor(
    @InjectModel(EmailOutbox.name) private readonly outbox: Model<EmailOutbox>,
    @InjectModel(EmailSuppression.name)
    private readonly suppressions: Model<EmailSuppression>,
    private readonly mail: MailService,
    private readonly audit: AuditService,
  ) {}

  async problems(
    show: 'open' | 'all',
    page: number,
  ): Promise<{
    items: EmailProblemView[];
    total: number;
    page: number;
    pageSize: number;
  }> {
    const filter: QueryFilter<EmailOutbox> =
      show === 'open'
        ? { ...PROBLEM_FILTER, reviewedAt: null }
        : PROBLEM_FILTER;
    const [rows, total] = await Promise.all([
      this.outbox
        .find(filter)
        .sort({ createdAt: -1 })
        .skip((page - 1) * PROBLEMS_PAGE)
        .limit(PROBLEMS_PAGE)
        .lean<Row[]>()
        .exec(),
      this.outbox.countDocuments(filter).exec(),
    ]);
    const paused = new Set(
      (
        await this.suppressions
          .find(
            { email: { $in: [...new Set(rows.map((r) => r.to))] } },
            { email: 1 },
          )
          .lean()
          .exec()
      ).map((s) => s.email),
    );
    return {
      items: rows.map((r) => this.view(r, paused.has(r.to))),
      total,
      page,
      pageSize: PROBLEMS_PAGE,
    };
  }

  async countOpen(): Promise<number> {
    return this.outbox
      .countDocuments({ ...PROBLEM_FILTER, reviewedAt: null })
      .exec();
  }

  async resend(
    id: string,
    actor: { id: string; role: string },
  ): Promise<EmailProblemView> {
    const row = await this.rowOrThrow(id);
    if (!(await this.mail.requeue(id))) {
      throw new ConflictException(
        row.status === 'sent'
          ? 'This email was sent; the recipient’s mail server refused it. Sending it again to the same address would fail the same way.'
          : 'This email can’t be sent again (it is not failed, or it held a one-time link that was erased).',
      );
    }
    await this.audit.record({
      actor,
      action: 'email.resent',
      entityType: 'email',
      entityId: id,
      changes: { to: row.to, template: row.template },
    });
    return this.get(id);
  }

  async markReviewed(
    id: string,
    actor: { id: string; role: string },
  ): Promise<EmailProblemView> {
    const row = await this.rowOrThrow(id);
    await this.outbox
      .updateOne({ _id: row._id }, { $set: { reviewedAt: new Date() } })
      .exec();
    await this.audit.record({
      actor,
      action: 'email.problem_reviewed',
      entityType: 'email',
      entityId: id,
      changes: { to: row.to, template: row.template },
    });
    return this.get(id);
  }

  /** Lets non-essential email reach an address again (the customer fixed their mailbox). */
  async allowAddress(
    email: string,
    actor: { id: string; role: string },
  ): Promise<{ email: string; paused: false }> {
    const address = email.trim().toLowerCase();
    const removed = await this.suppressions
      .deleteOne({ email: address })
      .exec();
    if (removed.deletedCount !== 1) {
      throw new NotFoundException('That address is not paused');
    }
    await this.audit.record({
      actor,
      action: 'email.address_allowed',
      entityType: 'email_address',
      entityId: address,
    });
    return { email: address, paused: false };
  }

  private async get(id: string): Promise<EmailProblemView> {
    const row = await this.rowOrThrow(id);
    const paused = await this.suppressions.exists({ email: row.to }).exec();
    return this.view(row, paused !== null);
  }

  private async rowOrThrow(id: string): Promise<Row> {
    const row = await this.outbox
      .findById(toObjectId(id, 'Email'))
      .lean<Row>()
      .exec();
    if (!row) throw new NotFoundException('Email not found');
    return row;
  }

  private view(r: Row, addressPaused: boolean): EmailProblemView {
    const problem: EmailProblem =
      r.status === 'dead'
        ? 'not_sent'
        : r.deliveryStatus === 'complained'
          ? 'complained'
          : r.deliveryStatus === 'failed'
            ? 'failed'
            : 'bounced';
    const orderNumber = r.data?.orderNumber;
    return {
      id: r._id.toString(),
      to: r.to,
      template: r.template,
      label: templateLabel(r.template),
      subject: r.subject ?? null,
      problem,
      status: r.status,
      deliveryStatus: r.deliveryStatus ?? null,
      lastError: r.lastError ?? null,
      attempts: r.attempts,
      createdAt: r.createdAt,
      sentAt: r.sentAt ?? null,
      orderNumber: typeof orderNumber === 'string' ? orderNumber : null,
      canResend: r.status === 'dead' && r.data !== null,
      addressPaused,
      reviewedAt: r.reviewedAt ?? null,
    };
  }
}
