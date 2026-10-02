import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectModel } from '@nestjs/mongoose';
import type { Model } from 'mongoose';
import { Book } from '../catalog/schemas/book.schema.js';
import {
  Entitlement,
  type EntitlementDocument,
} from '../commerce/schemas/entitlement.schema.js';
import { Order } from '../commerce/schemas/order.schema.js';
import { MailService } from '../mail/mail.service.js';
import { PreviewBuildError } from '../preview/preview-builder.js';
import { BookFilesService } from '../uploads/book-files.service.js';
import { User } from '../users/schemas/user.schema.js';
import { buildCopy } from './copy-builder.js';
import { stampsCopies } from './library.service.js';

/** A build running longer than this is assumed dead (instance restarted) and is claimed again. */
export const STALE_COPY_MS = 15 * 60_000;
/** Transient failures (network, R2) are retried this many times. */
export const MAX_COPY_ATTEMPTS = 3;

/**
 * Makes buyers' personal copies (ARCHITECTURE §10.3), one at a time: claim the oldest queued
 * entitlement with a conditional update, stamp the current edition, store it in R2, then apply it
 * only if no newer request arrived meanwhile (`buildToken`). The previous copy is deleted after
 * the new one is in place.
 */
@Injectable()
export class CopiesService {
  private readonly logger = new Logger(CopiesService.name);
  private readonly frontendUrl: string;
  private readonly ownerEmail: string | null;

  constructor(
    @InjectModel(Entitlement.name)
    private readonly entitlements: Model<Entitlement>,
    @InjectModel(Book.name) private readonly books: Model<Book>,
    @InjectModel(Order.name) private readonly orders: Model<Order>,
    @InjectModel(User.name) private readonly users: Model<User>,
    private readonly files: BookFilesService,
    private readonly mail: MailService,
    config: ConfigService,
  ) {
    this.frontendUrl = (config.get<string>('FRONTEND_URL') ?? '').replace(
      /\/+$/,
      '',
    );
    this.ownerEmail = config.get<string>('OWNER_ALERT_EMAIL') || null;
  }

  /** Builds the oldest queued copy (or one stuck in `preparing`). Returns whether it found work. */
  async processNext(now: Date = new Date()): Promise<boolean> {
    if (!this.files.configured) return false;
    const entitlement = await this.entitlements
      .findOneAndUpdate(
        {
          revokedAt: null,
          $or: [
            { 'copy.status': 'queued' },
            {
              'copy.status': 'preparing',
              'copy.startedAt': {
                $lt: new Date(now.getTime() - STALE_COPY_MS),
              },
            },
          ],
        },
        { $set: { 'copy.status': 'preparing', 'copy.startedAt': now } },
        { sort: { 'copy.queuedAt': 1 }, returnDocument: 'after' },
      )
      .exec();
    if (!entitlement?.copy) return false;
    await this.build(entitlement, now);
    return true;
  }

  /**
   * Queues copies for entitlements granted recently that have none yet, so a buyer's book is
   * usually ready before they first open it. (Anything missed is queued when they open it.)
   */
  async queueNew(now: Date = new Date(), limit = 50): Promise<number> {
    const fresh = await this.entitlements
      .find({
        copy: null,
        revokedAt: null,
        grantedAt: { $gt: new Date(now.getTime() - 24 * 60 * 60_000) },
      })
      .limit(limit)
      .exec();
    let queued = 0;
    for (const entitlement of fresh) {
      const book = await this.books
        .findById(entitlement.bookId, { manuscript: 1, formats: 1 })
        .lean()
        .exec();
      if (!book?.manuscript || !stampsCopies(book)) continue;
      const result = await this.entitlements
        .updateOne(
          { _id: entitlement._id, copy: null },
          {
            $set: {
              copy: {
                status: 'queued',
                key: null,
                bytes: null,
                sourceChecksum: null,
                targetChecksum: book.manuscript.checksum,
                buildToken: 1,
                attempts: 0,
                queuedAt: now,
                startedAt: null,
                readyAt: null,
                error: null,
              },
            },
          },
        )
        .exec();
      queued += result.modifiedCount;
    }
    return queued;
  }

  private async build(
    entitlement: EntitlementDocument,
    now: Date,
  ): Promise<void> {
    const copy = entitlement.copy!;
    const token = copy.buildToken;
    let newKey: string | null = null;
    try {
      const [book, order, user] = await Promise.all([
        this.books
          .findById(entitlement.bookId, { title: 1, manuscript: 1 })
          .lean()
          .exec(),
        this.orders
          .findById(entitlement.orderId, {
            orderNumber: 1,
            customerName: 1,
            email: 1,
          })
          .lean()
          .exec(),
        this.users
          .findById(entitlement.userId, { name: 1, email: 1 })
          .lean()
          .exec(),
      ]);
      if (!book?.manuscript)
        throw new PreviewBuildError('The book has no PDF.');
      if (!order) throw new PreviewBuildError('The order was not found.');
      // Always the current edition, even if the queue asked for an older one.
      const checksum = book.manuscript.checksum;
      const manuscript = await this.files.download(book.manuscript.key);
      const bytes = await buildCopy(manuscript, {
        // The account's current name and email: the person the copy is licensed to.
        name: user?.name || order.customerName,
        email: user?.email || order.email,
        orderNumber: order.orderNumber,
      });
      newKey = this.files.copyKey(
        entitlement.bookId.toString(),
        entitlement._id.toString(),
      );
      await this.files.put(newKey, bytes);

      const applied = await this.entitlements
        .updateOne(
          { _id: entitlement._id, 'copy.buildToken': token },
          {
            $set: {
              'copy.status': 'ready',
              'copy.key': newKey,
              'copy.bytes': bytes.length,
              'copy.sourceChecksum': checksum,
              'copy.targetChecksum': checksum,
              'copy.readyAt': now,
              'copy.error': null,
            },
          },
        )
        .exec();
      if (applied.modifiedCount === 0) {
        // A newer request (a new edition) took over: this copy is already out of date.
        await this.files.delete(newKey);
        return;
      }
      if (copy.key && copy.key !== newKey) await this.files.delete(copy.key);
      this.logger.log(
        `Copy ready for entitlement ${entitlement._id.toString()} (${book.title})`,
      );
    } catch (error) {
      if (newKey) await this.files.delete(newKey);
      await this.fail(entitlement, token, error as Error);
    }
  }

  private async fail(
    entitlement: EntitlementDocument,
    token: number,
    error: Error,
  ): Promise<void> {
    const permanent = error instanceof PreviewBuildError;
    const attempts = (entitlement.copy?.attempts ?? 0) + 1;
    const retry = !permanent && attempts < MAX_COPY_ATTEMPTS;
    this.logger.warn(
      `Copy for entitlement ${entitlement._id.toString()} failed (attempt ${attempts}${retry ? ', will retry' : ''}): ${error.message}`,
    );
    const message = permanent
      ? error.message
      : 'The copy could not be made just now (storage or network).';
    const result = await this.entitlements
      .updateOne(
        { _id: entitlement._id, 'copy.buildToken': token },
        {
          $set: {
            'copy.status': retry ? 'queued' : 'failed',
            'copy.attempts': attempts,
            'copy.error': message,
          },
        },
      )
      .exec();
    if (!retry && result.modifiedCount === 1)
      await this.alertOwner(entitlement, message);
  }

  private async alertOwner(
    entitlement: EntitlementDocument,
    error: string,
  ): Promise<void> {
    if (!this.ownerEmail) return;
    const [book, order, user] = await Promise.all([
      this.books.findById(entitlement.bookId, { title: 1 }).lean().exec(),
      this.orders
        .findById(entitlement.orderId, { orderNumber: 1 })
        .lean()
        .exec(),
      this.users
        .findById(entitlement.userId, { name: 1, email: 1 })
        .lean()
        .exec(),
    ]);
    await this.mail.enqueue({
      to: this.ownerEmail,
      template: 'ops.copy-failed',
      dedupeKey: `copy-failed:${entitlement._id.toString()}:${entitlement.copy?.targetChecksum ?? ''}`,
      data: {
        customer: user ? `${user.name} (${user.email})` : 'A customer',
        title: book?.title ?? 'A book',
        error,
        adminUrl: `${this.frontendUrl}/admin/orders/${order?.orderNumber ?? ''}`,
      },
    });
  }
}
