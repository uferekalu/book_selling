import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Types, type ClientSession, type Model } from 'mongoose';
import { toObjectId } from '../common/utils/object-id.js';
import { RealtimeService } from '../realtime/realtime.service.js';
import { STAFF_ROLES, User } from '../users/schemas/user.schema.js';
import {
  Notification,
  type NotificationType,
} from './schemas/notification.schema.js';

export interface NewNotification {
  type: NotificationType;
  title: string;
  body?: string;
  /** A path inside the site, e.g. `/account/orders/BS-2026-000123`. */
  link: string;
  /** One notification per event and user; re-sending the same key is a no-op. */
  dedupeKey: string;
}

export interface NotificationView {
  id: string;
  type: NotificationType;
  title: string;
  body: string;
  link: string;
  read: boolean;
  createdAt: Date;
}

const LIST_LIMIT = 20;

/**
 * The in-app bell (ARCHITECTURE §12). Notifications are written with the change that caused
 * them (pass the caller's `session`), so a rolled-back payment never leaves a "paid" bell entry.
 * Written inside a transaction, they are not pushed live: the bell picks them up when it next
 * refreshes (on focus, on reconnect and once a minute). Written outside one, they are pushed now.
 */
@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  constructor(
    @InjectModel(Notification.name)
    private readonly notifications: Model<Notification>,
    @InjectModel(User.name) private readonly users: Model<User>,
    private readonly realtime: RealtimeService,
  ) {}

  async notify(
    userId: string | Types.ObjectId,
    notification: NewNotification,
    session?: ClientSession,
  ): Promise<void> {
    const id = typeof userId === 'string' ? toObjectId(userId) : userId;
    // Upsert, not insert-and-catch: a duplicate-key error would abort the caller's transaction.
    await this.notifications
      .updateOne(
        { userId: id, dedupeKey: notification.dedupeKey },
        {
          $setOnInsert: {
            userId: id,
            type: notification.type,
            title: notification.title.slice(0, 140),
            body: (notification.body ?? '').slice(0, 300),
            link: notification.link,
            dedupeKey: notification.dedupeKey,
            readAt: null,
          },
        },
        { upsert: true, session },
      )
      .exec();
    if (!session) this.realtime.toUser(id.toString(), 'notification:new');
  }

  /** Every active owner and admin (they share one inbox). */
  async notifyStaff(
    notification: NewNotification,
    session?: ClientSession,
  ): Promise<void> {
    const staff = await this.users
      .find({ role: { $in: STAFF_ROLES }, accountStatus: 'active' }, { _id: 1 })
      .session(session ?? null)
      .lean()
      .exec();
    for (const member of staff) {
      await this.notify(member._id, notification, session);
    }
  }

  async list(
    userId: string,
  ): Promise<{ items: NotificationView[]; unreadCount: number }> {
    const id = toObjectId(userId);
    const [rows, unreadCount] = await Promise.all([
      this.notifications
        .find({ userId: id })
        .sort({ createdAt: -1 })
        .limit(LIST_LIMIT)
        .lean()
        .exec(),
      this.notifications.countDocuments({ userId: id, readAt: null }).exec(),
    ]);
    return {
      items: rows.map((n) => ({
        id: n._id.toString(),
        type: n.type,
        title: n.title,
        body: n.body,
        link: n.link,
        read: n.readAt !== null,
        createdAt: n.createdAt,
      })),
      unreadCount,
    };
  }

  async markRead(userId: string, notificationId: string): Promise<void> {
    await this.notifications
      .updateOne(
        {
          _id: toObjectId(notificationId, 'Notification'),
          userId: toObjectId(userId),
          readAt: null,
        },
        { $set: { readAt: new Date() } },
      )
      .exec();
  }

  async markAllRead(userId: string): Promise<void> {
    await this.notifications
      .updateMany(
        { userId: toObjectId(userId), readAt: null },
        { $set: { readAt: new Date() } },
      )
      .exec();
  }

  /**
   * Reading a conversation clears its bell entries: the customer's own, or every staff member's
   * (`userId` null), since one staff member reading the inbox answers it for all of them.
   */
  async markReadByLink(link: string, userId: string | null): Promise<void> {
    try {
      await this.notifications
        .updateMany(
          {
            link,
            readAt: null,
            ...(userId ? { userId: toObjectId(userId) } : {}),
          },
          { $set: { readAt: new Date() } },
        )
        .exec();
    } catch (error) {
      // Cosmetic: never fail the read itself because of the bell.
      this.logger.warn(`Clearing notifications failed: ${String(error)}`);
    }
  }
}
