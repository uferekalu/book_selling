import {
  BadRequestException,
  ForbiddenException,
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
import { Book } from '../catalog/schemas/book.schema.js';
import { Order } from '../commerce/schemas/order.schema.js';
import { toObjectId } from '../common/utils/object-id.js';
import { MailService } from '../mail/mail.service.js';
import { NotificationsService } from '../notifications/notifications.service.js';
import { RealtimeService } from '../realtime/realtime.service.js';
import { STAFF_ROLES, User } from '../users/schemas/user.schema.js';
import {
  Conversation,
  type ConversationStatus,
  type SenderRole,
} from './schemas/conversation.schema.js';
import { Message, MESSAGE_MAX_LENGTH } from './schemas/message.schema.js';
import {
  DEFAULT_REPLY_TIME,
  MessagingSettings,
} from './schemas/messaging-settings.schema.js';

/** "You have a new message" goes out if the message is still unread after this long. */
export const REMINDER_DELAY_MS = 10 * 60_000;
export const MESSAGES_PAGE = 50;
export const INBOX_PAGE = 20;
const PREVIEW_LENGTH = 160;
const SETTINGS_ID = 'messaging';

export const INBOX_FILTERS = [
  'open',
  'unread',
  'order',
  'closed',
  'all',
] as const;
export type InboxFilter = (typeof INBOX_FILTERS)[number];

export interface Actor {
  id: string;
  role: string;
}

export interface MessageView {
  id: string;
  senderRole: SenderRole;
  senderName: string;
  body: string;
  createdAt: Date;
  /** When the other side read it; null while unread. */
  readAt: Date | null;
}

export interface ConversationSummary {
  id: string;
  subject: string;
  status: ConversationStatus;
  orderNumber: string | null;
  bookTitle: string | null;
  lastMessageAt: Date;
  lastMessagePreview: string;
  lastMessageBy: SenderRole;
  /** Unread messages for the side asking. */
  unread: number;
  createdAt: Date;
  /** Staff views only. */
  customer?: { id: string; name: string; email: string };
}

export interface ConversationDetail extends ConversationSummary {
  messages: MessageView[];
  /** Older messages exist; ask again with `before` = the first message's id. */
  hasMore: boolean;
}

export interface StartConversationInput {
  subject?: string;
  body: string;
  orderNumber?: string;
  bookId?: string;
}

type ConversationRow = Conversation & { _id: Types.ObjectId };
type MessageRow = Message & { _id: Types.ObjectId };

const otherSide = (side: SenderRole): SenderRole =>
  side === 'customer' ? 'staff' : 'customer';

/** Plain text in, plain text out: trimmed, Windows line endings normalised, at most 2 blank lines. */
export function cleanMessageBody(raw: string): string {
  const body = raw
    .replace(/\r\n?/g, '\n')
    .replace(/\n{4,}/g, '\n\n\n')
    .trim();
  if (!body) throw new BadRequestException('Write a message first');
  if (body.length > MESSAGE_MAX_LENGTH) {
    throw new BadRequestException(
      `Messages can be up to ${MESSAGE_MAX_LENGTH.toLocaleString('en')} characters`,
    );
  }
  return body;
}

export function previewOf(body: string): string {
  const flat = body.replace(/\s+/g, ' ').trim();
  return flat.length > PREVIEW_LENGTH
    ? `${flat.slice(0, PREVIEW_LENGTH - 1)}…`
    : flat;
}

/**
 * Conversations between customers and the store (ARCHITECTURE §12, PRODUCT_RULES §11).
 *
 * Every write is persisted in a transaction before anything is pushed: the message, the
 * conversation's counters, the delayed "unread" email and the bell entry commit together, and
 * only then does the socket say "something changed". Unread counters change only with `$inc` /
 * `$set` inside those transactions, so they always match the messages.
 */
@Injectable()
export class MessagingService {
  private readonly logger = new Logger(MessagingService.name);
  private readonly frontendUrl: string;
  private readonly ownerEmail: string | null;

  constructor(
    @InjectModel(Conversation.name)
    private readonly conversations: Model<Conversation>,
    @InjectModel(Message.name) private readonly messages: Model<Message>,
    @InjectModel(MessagingSettings.name)
    private readonly settings: Model<MessagingSettings>,
    @InjectModel(User.name) private readonly users: Model<User>,
    @InjectModel(Order.name) private readonly orders: Model<Order>,
    @InjectModel(Book.name) private readonly books: Model<Book>,
    @InjectConnection() private readonly connection: Connection,
    private readonly mail: MailService,
    private readonly notifications: NotificationsService,
    private readonly realtime: RealtimeService,
    private readonly audit: AuditService,
    config: ConfigService,
  ) {
    this.frontendUrl = (config.get<string>('FRONTEND_URL') ?? '').replace(
      /\/+$/,
      '',
    );
    this.ownerEmail = config.get<string>('OWNER_ALERT_EMAIL') || null;
  }

  // ── Customer side ────────────────────────────────────────────────────────────────────────────

  /**
   * Starts a conversation, from the account, an order ("Question about this order") or a book
   * ("Ask the author"). A second question about the same order goes into its open conversation
   * rather than starting another.
   */
  async start(
    userId: string,
    input: StartConversationInput,
  ): Promise<ConversationDetail> {
    const customer = await this.customerOrThrow(userId);
    const body = cleanMessageBody(input.body);
    let subject = input.subject?.trim() ?? '';
    let order: { _id: Types.ObjectId; orderNumber: string } | null = null;
    let book: { _id: Types.ObjectId; title: string } | null = null;

    if (input.orderNumber) {
      order = await this.orders
        .findOne(
          { orderNumber: input.orderNumber, userId: customer._id },
          { orderNumber: 1 },
        )
        .lean()
        .exec();
      if (!order) throw new NotFoundException('Order not found');
      const existing = await this.conversations
        .findOne(
          { customerId: customer._id, orderId: order._id, status: 'open' },
          { _id: 1 },
        )
        .lean()
        .exec();
      if (existing) {
        await this.send(userId, existing._id.toString(), body);
        return this.forCustomer(userId, existing._id.toString());
      }
      subject ||= `Question about order ${order.orderNumber}`;
    } else if (input.bookId) {
      book = await this.books
        .findOne(
          { _id: toObjectId(input.bookId, 'Book'), status: 'published' },
          { title: 1 },
        )
        .lean()
        .exec();
      if (!book) throw new NotFoundException('Book not found');
      subject ||= `About “${book.title}”`;
    }
    if (!subject) throw new BadRequestException('Add a subject');

    const conversationId = new Types.ObjectId();
    const messageId = new Types.ObjectId();
    await this.inTransaction(async (session) => {
      const now = new Date();
      await this.conversations.create(
        [
          {
            _id: conversationId,
            customerId: customer._id,
            subject: subject.slice(0, 140),
            orderId: order?._id ?? null,
            orderNumber: order?.orderNumber ?? null,
            bookId: book?._id ?? null,
            bookTitle: book?.title ?? null,
            status: 'open',
            lastMessageAt: now,
            lastMessagePreview: previewOf(body),
            lastMessageBy: 'customer',
            unread: { customer: 0, staff: 0 },
          },
        ],
        { session },
      );
      await this.append(
        conversationId,
        { id: customer._id, side: 'customer', name: customer.name },
        body,
        messageId,
        session,
      );
    });
    this.pushChange(customer._id.toString(), 'conversation:updated', {
      conversationId: conversationId.toString(),
    });
    this.logger.log(`Conversation ${conversationId.toString()} started`);
    return this.forCustomer(userId, conversationId.toString());
  }

  async listForCustomer(userId: string): Promise<ConversationSummary[]> {
    const rows = await this.conversations
      .find({ customerId: toObjectId(userId) })
      .sort({ lastMessageAt: -1 })
      .limit(100)
      .lean<ConversationRow[]>()
      .exec();
    return rows.map((row) => this.summary(row, 'customer'));
  }

  async forCustomer(
    userId: string,
    conversationId: string,
    before?: string,
  ): Promise<ConversationDetail> {
    const row = await this.ownedConversation(userId, conversationId);
    return this.detail(row, 'customer', before);
  }

  async send(
    userId: string,
    conversationId: string,
    rawBody: string,
  ): Promise<MessageView> {
    const customer = await this.customerOrThrow(userId);
    const row = await this.ownedConversation(userId, conversationId);
    const body = cleanMessageBody(rawBody);
    // Created once, outside the transaction: a retried attempt reuses it (same email dedupeKey).
    const messageId = new Types.ObjectId();
    const message = await this.inTransaction((session) =>
      this.append(
        row._id,
        { id: customer._id, side: 'customer', name: customer.name },
        body,
        messageId,
        session,
      ),
    );
    this.pushChange(userId, 'message:new', { conversationId });
    return message;
  }

  async markReadByCustomer(
    userId: string,
    conversationId: string,
  ): Promise<void> {
    const row = await this.ownedConversation(userId, conversationId);
    await this.markRead(row, 'customer', userId);
  }

  async unreadForCustomer(userId: string): Promise<{ count: number }> {
    const [result] = await this.conversations
      .aggregate<{ count: number }>([
        { $match: { customerId: toObjectId(userId) } },
        { $group: { _id: null, count: { $sum: '$unread.customer' } } },
      ])
      .exec();
    return { count: result?.count ?? 0 };
  }

  // ── Staff side ───────────────────────────────────────────────────────────────────────────────

  async inbox(
    filter: InboxFilter,
    page: number,
  ): Promise<{
    items: ConversationSummary[];
    total: number;
    page: number;
    pageSize: number;
  }> {
    const query: QueryFilter<Conversation> =
      filter === 'open'
        ? { status: 'open' }
        : filter === 'closed'
          ? { status: 'closed' }
          : filter === 'unread'
            ? { 'unread.staff': { $gt: 0 } }
            : filter === 'order'
              ? { orderId: { $ne: null } }
              : {};
    const [rows, total] = await Promise.all([
      this.conversations
        .find(query)
        .sort({ lastMessageAt: -1 })
        .skip((page - 1) * INBOX_PAGE)
        .limit(INBOX_PAGE)
        .lean<ConversationRow[]>()
        .exec(),
      this.conversations.countDocuments(query).exec(),
    ]);
    const customers = await this.customersById(rows.map((r) => r.customerId));
    return {
      items: rows.map((row) =>
        this.summary(row, 'staff', customers.get(row.customerId.toString())),
      ),
      total,
      page,
      pageSize: INBOX_PAGE,
    };
  }

  async forStaff(
    conversationId: string,
    before?: string,
  ): Promise<ConversationDetail> {
    const row = await this.conversationOrThrow(conversationId);
    const customers = await this.customersById([row.customerId]);
    return this.detail(
      row,
      'staff',
      before,
      customers.get(row.customerId.toString()),
    );
  }

  async reply(
    staff: Actor,
    conversationId: string,
    rawBody: string,
  ): Promise<MessageView> {
    const row = await this.conversationOrThrow(conversationId);
    const body = cleanMessageBody(rawBody);
    const member = await this.users
      .findById(toObjectId(staff.id), { name: 1 })
      .lean()
      .exec();
    if (!member) throw new ForbiddenException();
    // Created once, outside the transaction: a retried attempt reuses it (same email dedupeKey).
    const messageId = new Types.ObjectId();
    const message = await this.inTransaction((session) =>
      this.append(
        row._id,
        { id: member._id, side: 'staff', name: member.name },
        body,
        messageId,
        session,
      ),
    );
    this.pushChange(row.customerId.toString(), 'message:new', {
      conversationId,
    });
    return message;
  }

  async markReadByStaff(conversationId: string): Promise<void> {
    const row = await this.conversationOrThrow(conversationId);
    await this.markRead(row, 'staff', null);
  }

  async setStatus(
    staff: Actor,
    conversationId: string,
    status: ConversationStatus,
  ): Promise<ConversationSummary> {
    const id = toObjectId(conversationId, 'Conversation');
    const updated = await this.conversations
      .findOneAndUpdate(
        { _id: id, status: status === 'open' ? 'closed' : 'open' },
        {
          $set: { status, closedAt: status === 'closed' ? new Date() : null },
        },
        { returnDocument: 'after' },
      )
      .lean<ConversationRow>()
      .exec();
    if (!updated) {
      const exists = await this.conversations.exists({ _id: id }).exec();
      if (!exists) throw new NotFoundException('Conversation not found');
      // Already in that state: nothing to do.
      return this.forStaff(conversationId);
    }
    await this.audit.record({
      actor: staff,
      action:
        status === 'closed' ? 'conversation.closed' : 'conversation.reopened',
      entityType: 'conversation',
      entityId: conversationId,
    });
    this.pushChange(updated.customerId.toString(), 'conversation:updated', {
      conversationId,
    });
    const customers = await this.customersById([updated.customerId]);
    return this.summary(
      updated,
      'staff',
      customers.get(updated.customerId.toString()),
    );
  }

  async unreadForStaff(): Promise<{ conversations: number }> {
    const conversations = await this.conversations
      .countDocuments({ 'unread.staff': { $gt: 0 } })
      .exec();
    return { conversations };
  }

  // ── Settings ─────────────────────────────────────────────────────────────────────────────────

  async getSettings(): Promise<{ replyTime: string }> {
    const doc = await this.settings.findById(SETTINGS_ID).lean().exec();
    return { replyTime: doc?.replyTime || DEFAULT_REPLY_TIME };
  }

  async updateSettings(
    staff: Actor,
    replyTime: string,
  ): Promise<{ replyTime: string }> {
    const value = replyTime.trim() || DEFAULT_REPLY_TIME;
    await this.settings
      .updateOne(
        { _id: SETTINGS_ID },
        { $set: { replyTime: value } },
        { upsert: true },
      )
      .exec();
    await this.audit.record({
      actor: staff,
      action: 'messaging.settings_updated',
      entityType: 'settings',
      entityId: SETTINGS_ID,
      changes: { replyTime: value },
    });
    return { replyTime: value };
  }

  // ── Internals ────────────────────────────────────────────────────────────────────────────────

  /**
   * Adds one message: bumps the recipient's unread counter and, when that counter goes from 0 to
   * 1, schedules the delayed email and the bell entry. Later messages in the same unread streak
   * add to the count only, so a burst of messages sends one email. Any new message reopens a
   * closed conversation. Runs inside the caller's transaction.
   */
  private async append(
    conversationId: Types.ObjectId,
    sender: { id: Types.ObjectId; side: SenderRole; name: string },
    body: string,
    messageId: Types.ObjectId,
    session: ClientSession,
  ): Promise<MessageView> {
    const now = new Date();
    const recipient = otherSide(sender.side);
    const before = await this.conversations
      .findOneAndUpdate(
        { _id: conversationId },
        {
          $inc: { [`unread.${recipient}`]: 1 },
          $set: {
            lastMessageAt: now,
            lastMessagePreview: previewOf(body),
            lastMessageBy: sender.side,
            status: 'open',
            closedAt: null,
          },
        },
        { session, returnDocument: 'before' },
      )
      .lean<ConversationRow>()
      .exec();
    if (!before) throw new NotFoundException('Conversation not found');

    const [message] = await this.messages.create(
      [
        {
          _id: messageId,
          conversationId,
          senderId: sender.id,
          senderRole: sender.side,
          senderName: sender.name,
          body,
          readAt: null,
        },
      ],
      { session },
    );
    if ((before.unread?.[recipient] ?? 0) === 0) {
      await this.startUnreadStreak(
        before,
        recipient,
        messageId,
        sender.name,
        body,
        session,
      );
    }
    return this.messageView(message.toObject() as MessageRow);
  }

  private async startUnreadStreak(
    conversation: ConversationRow,
    recipient: SenderRole,
    messageId: Types.ObjectId,
    from: string,
    body: string,
    session: ClientSession,
  ): Promise<void> {
    const id = conversation._id.toString();
    const path =
      recipient === 'customer'
        ? `/account/messages/${id}`
        : `/admin/messages/${id}`;
    const dedupeKey = `message-unread:${recipient}:${id}:${messageId.toString()}`;
    let to: string | null = this.ownerEmail;
    let name: string | null = null;
    if (recipient === 'customer') {
      const customer = await this.users
        .findById(conversation.customerId, { email: 1, name: 1 })
        .session(session)
        .lean()
        .exec();
      to = customer?.email ?? null;
      name = customer ? customer.name.split(' ')[0] || customer.name : null;
    }
    if (to) {
      await this.mail.enqueue(
        {
          to,
          template: 'messaging.unread-message',
          dedupeKey,
          sendAfter: new Date(Date.now() + REMINDER_DELAY_MS),
          data: {
            name,
            from,
            subject: conversation.subject,
            preview: previewOf(body),
            conversationUrl: `${this.frontendUrl}${path}`,
          },
        },
        session,
      );
      await this.conversations
        .updateOne(
          { _id: conversation._id },
          { $set: { [`reminders.${recipient}`]: dedupeKey } },
          { session },
        )
        .exec();
    }
    const notification = {
      type: 'message' as const,
      title:
        recipient === 'customer'
          ? `New reply from ${from}`
          : `New message from ${from}`,
      body: `${conversation.subject}: ${previewOf(body)}`,
      link: path,
      dedupeKey: `message:${messageId.toString()}`,
    };
    if (recipient === 'customer') {
      await this.notifications.notify(
        conversation.customerId,
        notification,
        session,
      );
    } else {
      await this.notifications.notifyStaff(notification, session);
    }
  }

  /**
   * Marks the other side's messages read for `side`, zeroes its counter and withdraws the
   * delayed email if it hasn't gone yet. Cheap no-op when nothing is unread (opening a thread
   * calls this every time).
   */
  private async markRead(
    row: ConversationRow,
    side: SenderRole,
    customerUserId: string | null,
  ): Promise<void> {
    if ((row.unread?.[side] ?? 0) === 0 && !row.reminders?.[side]) return;
    await this.inTransaction(async (session) => {
      const before = await this.conversations
        .findOneAndUpdate(
          { _id: row._id },
          { $set: { [`unread.${side}`]: 0, [`reminders.${side}`]: null } },
          { session, returnDocument: 'before' },
        )
        .lean<ConversationRow>()
        .exec();
      await this.messages
        .updateMany(
          {
            conversationId: row._id,
            senderRole: otherSide(side),
            readAt: null,
          },
          { $set: { readAt: new Date() } },
          { session },
        )
        .exec();
      const pending = before?.reminders?.[side];
      if (pending) await this.mail.cancel(pending, session);
    });
    const id = row._id.toString();
    await this.notifications.markReadByLink(
      side === 'customer' ? `/account/messages/${id}` : `/admin/messages/${id}`,
      side === 'customer' ? customerUserId : null,
    );
    // Read receipts: the sender sees "Seen" on their messages.
    this.pushChange(row.customerId.toString(), 'message:read', {
      conversationId: id,
    });
  }

  private async detail(
    row: ConversationRow,
    side: SenderRole,
    before?: string,
    customer?: ConversationSummary['customer'],
  ): Promise<ConversationDetail> {
    const query: QueryFilter<Message> = { conversationId: row._id };
    if (before) query._id = { $lt: toObjectId(before, 'Message') };
    const rows = await this.messages
      .find(query)
      .sort({ _id: -1 })
      .limit(MESSAGES_PAGE + 1)
      .lean<MessageRow[]>()
      .exec();
    const hasMore = rows.length > MESSAGES_PAGE;
    const page = rows.slice(0, MESSAGES_PAGE).reverse();
    return {
      ...this.summary(row, side, customer),
      messages: page.map((m) => this.messageView(m)),
      hasMore,
    };
  }

  private summary(
    row: ConversationRow,
    side: SenderRole,
    customer?: ConversationSummary['customer'],
  ): ConversationSummary {
    return {
      id: row._id.toString(),
      subject: row.subject,
      status: row.status,
      orderNumber: row.orderNumber ?? null,
      bookTitle: row.bookTitle ?? null,
      lastMessageAt: row.lastMessageAt,
      lastMessagePreview: row.lastMessagePreview,
      lastMessageBy: row.lastMessageBy,
      unread: row.unread?.[side] ?? 0,
      createdAt: row.createdAt,
      ...(side === 'staff' && customer ? { customer } : {}),
    };
  }

  private messageView(m: MessageRow): MessageView {
    return {
      id: m._id.toString(),
      senderRole: m.senderRole,
      senderName: m.senderName,
      body: m.body,
      createdAt: m.createdAt,
      readAt: m.readAt ?? null,
    };
  }

  private async customersById(
    ids: Types.ObjectId[],
  ): Promise<Map<string, { id: string; name: string; email: string }>> {
    const users = await this.users
      .find({ _id: { $in: ids } }, { name: 1, email: 1 })
      .lean()
      .exec();
    return new Map(
      users.map((u) => [
        u._id.toString(),
        { id: u._id.toString(), name: u.name, email: u.email },
      ]),
    );
  }

  /** Only customers start or write in their own conversations; staff answer from the inbox. */
  private async customerOrThrow(userId: string) {
    const user = await this.users
      .findById(toObjectId(userId), { name: 1, role: 1, accountStatus: 1 })
      .lean()
      .exec();
    if (!user || user.accountStatus !== 'active') {
      throw new ForbiddenException('Your account can’t send messages');
    }
    if (STAFF_ROLES.includes(user.role)) {
      throw new ForbiddenException(
        'Staff answer customers from the admin inbox',
      );
    }
    return user;
  }

  /** 404, not 403, for someone else's conversation: never confirm it exists. */
  private async ownedConversation(
    userId: string,
    conversationId: string,
  ): Promise<ConversationRow> {
    const row = await this.conversations
      .findOne({
        _id: toObjectId(conversationId, 'Conversation'),
        customerId: toObjectId(userId),
      })
      .lean<ConversationRow>()
      .exec();
    if (!row) throw new NotFoundException('Conversation not found');
    return row;
  }

  private async conversationOrThrow(
    conversationId: string,
  ): Promise<ConversationRow> {
    const row = await this.conversations
      .findById(toObjectId(conversationId, 'Conversation'))
      .lean<ConversationRow>()
      .exec();
    if (!row) throw new NotFoundException('Conversation not found');
    return row;
  }

  /** Tells the customer's devices and every staff browser to refresh (after the commit). */
  private pushChange(
    customerId: string,
    event: 'message:new' | 'message:read' | 'conversation:updated',
    payload: { conversationId: string },
  ): void {
    this.realtime.toUser(customerId, event, payload);
    this.realtime.toStaff(event, payload);
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
