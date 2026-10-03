import {
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectConnection, InjectModel } from '@nestjs/mongoose';
import {
  Types,
  type ClientSession,
  type Connection,
  type Model,
  type QueryFilter,
} from 'mongoose';
import { AuditService } from '../audit/audit.module.js';
import { hashToken } from '../common/crypto/tokens.js';
import { toObjectId } from '../common/utils/object-id.js';
import { MailService } from '../mail/mail.service.js';
import { NotificationsService } from '../notifications/notifications.service.js';
import { RealtimeService } from '../realtime/realtime.service.js';
import { User } from '../users/schemas/user.schema.js';
import {
  cleanMessageBody,
  INBOX_PAGE,
  MessagingService,
} from './messaging.service.js';
import type { Actor } from './messaging.service.js';
import {
  ContactRequest,
  type ContactStatus,
} from './schemas/contact-request.schema.js';

/** A real person takes longer than this to fill in the form; faster submissions are bots. */
export const MIN_FILL_MS = 2_500;
/** Acknowledgement emails per address per day: stops the form being used to mail-bomb someone. */
export const MAX_ACKS_PER_DAY = 3;

export interface ContactInput {
  name: string;
  email: string;
  subject: string;
  body: string;
  /** Honeypot: a hidden field people never fill in. */
  website?: string;
  /** How long the form was open before sending. */
  elapsedMs?: number;
}

export interface ContactView {
  id: string;
  name: string;
  email: string;
  subject: string;
  body: string;
  status: ContactStatus;
  replies: Array<{ staffName: string; body: string; at: Date }>;
  createdAt: Date;
}

type ContactRow = ContactRequest & { _id: Types.ObjectId };

/**
 * The contact form for visitors who aren't signed in (ARCHITECTURE §12). Bots are turned away
 * quietly (honeypot, fill time, the route's rate limit) with the same "sent" answer a person
 * gets, so they learn nothing. Staff reply by email, and the replies are kept with the request.
 */
@Injectable()
export class ContactService {
  private readonly logger = new Logger(ContactService.name);
  private readonly frontendUrl: string;
  private readonly ownerEmail: string | null;

  constructor(
    @InjectModel(ContactRequest.name)
    private readonly requests: Model<ContactRequest>,
    @InjectModel(User.name) private readonly users: Model<User>,
    @InjectConnection() private readonly connection: Connection,
    private readonly mail: MailService,
    private readonly notifications: NotificationsService,
    private readonly realtime: RealtimeService,
    private readonly messaging: MessagingService,
    private readonly audit: AuditService,
    config: ConfigService,
  ) {
    this.frontendUrl = (config.get<string>('FRONTEND_URL') ?? '').replace(
      /\/+$/,
      '',
    );
    this.ownerEmail = config.get<string>('OWNER_ALERT_EMAIL') || null;
  }

  async submit(input: ContactInput, ip: string | undefined): Promise<void> {
    if (input.website?.trim()) {
      this.logger.warn('Contact form: honeypot filled, ignored');
      return;
    }
    if (input.elapsedMs !== undefined && input.elapsedMs < MIN_FILL_MS) {
      this.logger.warn('Contact form: sent too fast, ignored');
      return;
    }
    const email = input.email.trim().toLowerCase();
    const name = input.name.trim();
    const subject = input.subject.trim();
    const body = cleanMessageBody(input.body);
    const since = new Date(Date.now() - 24 * 3600_000);
    const recent = await this.requests
      .countDocuments({ email, createdAt: { $gt: since } })
      .exec();
    const { replyTime } = await this.messaging.getSettings();

    const id = new Types.ObjectId();
    await this.inTransaction(async (session) => {
      await this.requests.create(
        [
          {
            _id: id,
            name,
            email,
            subject,
            body,
            status: 'new',
            ipHash: ip ? hashToken(`contact:${ip}`) : null,
          },
        ],
        { session },
      );
      if (recent < MAX_ACKS_PER_DAY) {
        await this.mail.enqueue(
          {
            to: email,
            template: 'messaging.contact-received',
            dedupeKey: `contact-ack:${id.toString()}`,
            data: { name: name.split(' ')[0] || name, subject, replyTime },
          },
          session,
        );
      }
      const path = `/admin/messages/contact/${id.toString()}`;
      if (this.ownerEmail) {
        await this.mail.enqueue(
          {
            to: this.ownerEmail,
            template: 'messaging.contact-new',
            dedupeKey: `contact-new:${id.toString()}`,
            data: {
              from: `${name} (${email})`,
              subject,
              body,
              inboxUrl: `${this.frontendUrl}${path}`,
            },
          },
          session,
        );
      }
      await this.notifications.notifyStaff(
        {
          type: 'contact',
          title: `Contact form: ${subject}`,
          body: `${name}: ${body.replace(/\s+/g, ' ').slice(0, 200)}`,
          link: path,
          dedupeKey: `contact:${id.toString()}`,
        },
        session,
      );
    });
    this.realtime.toStaff('conversation:updated', {});
    this.logger.log(`Contact request ${id.toString()} received`);
  }

  async list(
    status: ContactStatus | 'all',
    page: number,
  ): Promise<{
    items: ContactView[];
    total: number;
    page: number;
    pageSize: number;
  }> {
    const query: QueryFilter<ContactRequest> =
      status === 'all' ? {} : { status };
    const [rows, total] = await Promise.all([
      this.requests
        .find(query)
        .sort({ createdAt: -1 })
        .skip((page - 1) * INBOX_PAGE)
        .limit(INBOX_PAGE)
        .lean<ContactRow[]>()
        .exec(),
      this.requests.countDocuments(query).exec(),
    ]);
    return {
      items: rows.map((r) => this.view(r)),
      total,
      page,
      pageSize: INBOX_PAGE,
    };
  }

  async get(id: string): Promise<ContactView> {
    return this.view(await this.rowOrThrow(id));
  }

  async countNew(): Promise<number> {
    return this.requests.countDocuments({ status: 'new' }).exec();
  }

  async reply(staff: Actor, id: string, rawBody: string): Promise<ContactView> {
    const body = cleanMessageBody(rawBody);
    const member = await this.users
      .findById(toObjectId(staff.id), { name: 1 })
      .lean()
      .exec();
    const staffName = member?.name ?? 'The store';
    const updated = await this.inTransaction(async (session) => {
      const row = await this.requests
        .findOneAndUpdate(
          { _id: toObjectId(id, 'Message') },
          {
            $push: {
              replies: {
                staffId: toObjectId(staff.id),
                staffName,
                body,
                at: new Date(),
              },
            },
            $set: { status: 'replied' },
          },
          { session, returnDocument: 'after' },
        )
        .lean<ContactRow>()
        .exec();
      if (!row) throw new NotFoundException('Message not found');
      await this.mail.enqueue(
        {
          to: row.email,
          template: 'messaging.contact-reply',
          dedupeKey: `contact-reply:${id}:${row.replies.length}`,
          data: {
            name: row.name.split(' ')[0] || row.name,
            subject: row.subject,
            reply: body,
            from: staffName,
            original: row.body,
            contactUrl: `${this.frontendUrl}/contact`,
          },
        },
        session,
      );
      await this.audit.record(
        {
          actor: staff,
          action: 'contact.replied',
          entityType: 'contact_request',
          entityId: id,
        },
        session,
      );
      return row;
    });
    await this.notifications.markReadByLink(
      `/admin/messages/contact/${id}`,
      null,
    );
    this.realtime.toStaff('conversation:updated', {});
    return this.view(updated);
  }

  async setStatus(
    staff: Actor,
    id: string,
    status: ContactStatus,
  ): Promise<ContactView> {
    const row = await this.requests
      .findOneAndUpdate(
        { _id: toObjectId(id, 'Message') },
        { $set: { status } },
        { returnDocument: 'after' },
      )
      .lean<ContactRow>()
      .exec();
    if (!row) throw new NotFoundException('Message not found');
    await this.audit.record({
      actor: staff,
      action: 'contact.status_changed',
      entityType: 'contact_request',
      entityId: id,
      changes: { status },
    });
    if (status !== 'new') {
      await this.notifications.markReadByLink(
        `/admin/messages/contact/${id}`,
        null,
      );
    }
    this.realtime.toStaff('conversation:updated', {});
    return this.view(row);
  }

  private async rowOrThrow(id: string): Promise<ContactRow> {
    const row = await this.requests
      .findById(toObjectId(id, 'Message'))
      .lean<ContactRow>()
      .exec();
    if (!row) throw new NotFoundException('Message not found');
    return row;
  }

  private view(row: ContactRow): ContactView {
    return {
      id: row._id.toString(),
      name: row.name,
      email: row.email,
      subject: row.subject,
      body: row.body,
      status: row.status,
      replies: (row.replies ?? []).map((r) => ({
        staffName: r.staffName,
        body: r.body,
        at: r.at,
      })),
      createdAt: row.createdAt,
    };
  }

  private async inTransaction<T>(
    work: (session: ClientSession) => Promise<T>,
  ): Promise<T> {
    const session = await this.connection.startSession();
    try {
      return await session.withTransaction(() => work(session));
    } catch (error) {
      const message = (error as Error).message ?? '';
      if (/Transaction numbers are only allowed|replica set/i.test(message)) {
        throw new ServiceUnavailableException(
          'Messages can’t be sent right now. Please try again shortly.',
        );
      }
      throw error;
    } finally {
      await session.endSession();
    }
  }
}
