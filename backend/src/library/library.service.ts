import {
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectModel } from '@nestjs/mongoose';
import { Types, type Model } from 'mongoose';
import { Author } from '../catalog/schemas/author.schema.js';
import { Book, type BookDocument } from '../catalog/schemas/book.schema.js';
import { CatalogPresenter } from '../catalog/catalog.presenter.js';
import type { PublicImage } from '../catalog/catalog.presenter.js';
import { Order } from '../commerce/schemas/order.schema.js';
import {
  Entitlement,
  type EntitlementDocument,
} from '../commerce/schemas/entitlement.schema.js';
import { toObjectId } from '../common/utils/object-id.js';
import { MailService } from '../mail/mail.service.js';
import { BookFilesService } from '../uploads/book-files.service.js';
import { CloudinaryService } from '../uploads/cloudinary.service.js';
import { User } from '../users/schemas/user.schema.js';
import { DownloadEvent } from './schemas/download-event.schema.js';
import { ReadingProgress } from './schemas/reading-progress.schema.js';

/** Reading streams pages over a long session, so its link lives longer than a download's. */
export const READ_LINK_SECONDS = 60 * 60;
export const DOWNLOAD_LINK_SECONDS = 5 * 60;
/** PRODUCT_RULES §8: up to 10 downloads of a book per hour. */
export const DOWNLOADS_PER_HOUR = 10;
/** Downloads of one book in 24 hours that alert the owner (once a day). */
export const ABUSE_THRESHOLD = 30;
/** A failed copy is tried again on the buyer's next visit, but not sooner than this. */
const FAILED_RETRY_AFTER_MS = 30 * 60_000;

export type CopyState = 'ready' | 'preparing' | 'failed';

export interface LibraryItem {
  bookId: string;
  slug: string;
  title: string;
  subtitle: string;
  authors: string[];
  cover: PublicImage | null;
  pages: number;
  grantedAt: string;
  orderNumber: string | null;
  copy: CopyState;
  /** A newer edition is being prepared; the current copy is still readable. */
  updating: boolean;
  progress: { page: number; maxPage: number; updatedAt: string } | null;
}

export interface LibraryOutlineEntry {
  title: string;
  level: 1 | 2;
  /** PDF page, or null when the contents line has no page number. */
  page: number | null;
}

export type FileLink =
  | { status: 'ready'; url: string; expiresAt: string; updating: boolean }
  | { status: 'preparing' };

type LibraryBook = Pick<
  BookDocument,
  | '_id'
  | 'slug'
  | 'title'
  | 'subtitle'
  | 'authorIds'
  | 'cover'
  | 'manuscript'
  | 'formats'
  | 'tableOfContents'
  | 'preview'
>;

/** Where the buyer's file is right now, and whether a (newer) copy has to be made. */
interface Resolved {
  key: string | null;
  updating: boolean;
  needsBuild: boolean;
  failed: boolean;
}

/**
 * My Library (ARCHITECTURE §10.2–10.3): the ebooks a customer owns, read online and downloaded
 * through short-lived signed links to their personal copy. Every method checks the entitlement
 * belongs to the signed-in user and is not revoked (a full refund removes the book).
 */
@Injectable()
export class LibraryService {
  private readonly logger = new Logger(LibraryService.name);
  private readonly present: CatalogPresenter;
  private readonly frontendUrl: string;
  private readonly ownerEmail: string | null;

  constructor(
    @InjectModel(Entitlement.name)
    private readonly entitlements: Model<Entitlement>,
    @InjectModel(Book.name) private readonly books: Model<Book>,
    @InjectModel(Author.name) private readonly authors: Model<Author>,
    @InjectModel(Order.name) private readonly orders: Model<Order>,
    @InjectModel(User.name) private readonly users: Model<User>,
    @InjectModel(ReadingProgress.name)
    private readonly progress: Model<ReadingProgress>,
    @InjectModel(DownloadEvent.name)
    private readonly downloads: Model<DownloadEvent>,
    private readonly files: BookFilesService,
    private readonly mail: MailService,
    media: CloudinaryService,
    config: ConfigService,
  ) {
    this.present = new CatalogPresenter(media);
    this.frontendUrl = (config.get<string>('FRONTEND_URL') ?? '').replace(
      /\/+$/,
      '',
    );
    this.ownerEmail = config.get<string>('OWNER_ALERT_EMAIL') || null;
  }

  // ---------------------------------------------------------------- reading the library

  async list(userId: string): Promise<LibraryItem[]> {
    const owned = await this.entitlements
      .find({ userId: toObjectId(userId, 'User'), revokedAt: null })
      .sort({ grantedAt: -1 })
      .exec();
    if (owned.length === 0) return [];
    const books = await this.loadBooks(owned.map((e) => e.bookId));
    const [orders, progress, authors] = await Promise.all([
      this.orders
        .find({ _id: { $in: owned.map((e) => e.orderId) } }, { orderNumber: 1 })
        .lean()
        .exec(),
      this.progress
        .find({ userId: toObjectId(userId, 'User') })
        .lean()
        .exec(),
      this.authors
        .find(
          { _id: { $in: [...books.values()].flatMap((b) => b.authorIds) } },
          { name: 1 },
        )
        .lean()
        .exec(),
    ]);
    const orderNumbers = new Map(
      orders.map((o) => [o._id.toString(), o.orderNumber]),
    );
    const progressByBook = new Map(
      progress.map((p) => [p.bookId.toString(), p]),
    );
    const authorNames = new Map(authors.map((a) => [a._id.toString(), a.name]));

    const items: LibraryItem[] = [];
    for (const entitlement of owned) {
      const book = books.get(entitlement.bookId.toString());
      if (!book) continue; // a deleted draft can't have buyers; skip defensively
      const resolved = this.resolve(entitlement, book);
      // Opening the library is a good moment to start any copy that is missing or out of date.
      if (resolved.needsBuild) await this.queueCopy(entitlement, book);
      const saved = progressByBook.get(book._id.toString());
      items.push({
        bookId: book._id.toString(),
        slug: book.slug,
        title: book.title,
        subtitle: book.subtitle ?? '',
        authors: book.authorIds
          .map((id) => authorNames.get(id.toString()))
          .filter((name): name is string => Boolean(name)),
        cover: this.present.image(book.cover, `Cover of ${book.title}`),
        pages: book.manuscript?.pages ?? 0,
        grantedAt: entitlement.grantedAt.toISOString(),
        orderNumber: orderNumbers.get(entitlement.orderId.toString()) ?? null,
        copy: resolved.key ? 'ready' : resolved.failed ? 'failed' : 'preparing',
        updating: resolved.updating,
        progress: saved
          ? {
              page: saved.page,
              maxPage: saved.maxPage,
              updatedAt: saved.updatedAt.toISOString(),
            }
          : null,
      });
    }
    return items;
  }

  /** One owned book, with the whole table of contents mapped to PDF pages (the full reader). */
  async item(
    userId: string,
    bookId: string,
  ): Promise<LibraryItem & { outline: LibraryOutlineEntry[] }> {
    const items = await this.list(userId);
    const item = items.find((i) => i.bookId === bookId);
    if (!item) throw this.notOwned();
    const book = (await this.loadBooks([toObjectId(bookId, 'Book')])).get(
      bookId,
    )!;
    const offset = book.preview?.pageOffset ?? 0;
    // Printed page numbers in the contents, shifted past the front matter, never past the end.
    const toPdfPage = (printed: number | null | undefined) =>
      printed
        ? Math.min(printed + offset, item.pages || printed + offset)
        : null;
    const outline: LibraryOutlineEntry[] = [];
    for (const entry of book.tableOfContents) {
      outline.push({
        title: entry.title,
        level: 1,
        page: toPdfPage(entry.page),
      });
      for (const child of entry.children ?? []) {
        outline.push({
          title: child.title,
          level: 2,
          page: toPdfPage(child.page),
        });
      }
    }
    return { ...item, outline };
  }

  /** Which books the user owns: the storefront shows "In your library" and opens the full reader. */
  async owned(
    userId: string,
  ): Promise<Array<{ bookId: string; slug: string }>> {
    const owned = await this.entitlements
      .find(
        { userId: toObjectId(userId, 'User'), revokedAt: null },
        { bookId: 1 },
      )
      .lean()
      .exec();
    const books = await this.books
      .find({ _id: { $in: owned.map((e) => e.bookId) } }, { slug: 1 })
      .lean()
      .exec();
    return books.map((b) => ({ bookId: b._id.toString(), slug: b.slug }));
  }

  // ---------------------------------------------------------------- files

  /** A link for the online reader (pdf.js reads it page by page with range requests). */
  async readLink(
    userId: string,
    bookId: string,
    now = new Date(),
  ): Promise<FileLink> {
    const { entitlement, book } = await this.ownedBook(userId, bookId);
    const link = await this.fileLink(entitlement, book, READ_LINK_SECONDS, now);
    if (link.status === 'ready' && !entitlement.firstOpenedAt) {
      await this.entitlements
        .updateOne(
          { _id: entitlement._id, firstOpenedAt: null },
          { $set: { firstOpenedAt: now } },
        )
        .exec();
    }
    return link;
  }

  /**
   * A 5-minute download link (PRODUCT_RULES §8), at most 10 per book per hour. Every link issued
   * is recorded; an unusual number in a day alerts the owner, once a day.
   */
  async downloadLink(
    userId: string,
    bookId: string,
    now = new Date(),
  ): Promise<FileLink> {
    const { entitlement, book } = await this.ownedBook(userId, bookId);
    const hourAgo = new Date(now.getTime() - 60 * 60_000);
    const recent = await this.downloads
      .find(
        {
          userId: entitlement.userId,
          bookId: entitlement.bookId,
          at: { $gt: hourAgo },
        },
        { at: 1 },
      )
      .sort({ at: 1 })
      .lean()
      .exec();
    if (recent.length >= DOWNLOADS_PER_HOUR) {
      const freeAt = recent[0].at.getTime() + 60 * 60_000;
      const minutes = Math.max(1, Math.ceil((freeAt - now.getTime()) / 60_000));
      throw new HttpException(
        {
          message: `You've downloaded this book ${DOWNLOADS_PER_HOUR} times in the last hour. You can download it again in ${minutes} minute${minutes === 1 ? '' : 's'}, or keep reading online.`,
          code: 'download_limit',
        },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
    const link = await this.fileLink(
      entitlement,
      book,
      DOWNLOAD_LINK_SECONDS,
      now,
      {
        downloadAs: `${book.slug}.pdf`,
      },
    );
    if (link.status !== 'ready') return link;

    await this.downloads.create({
      userId: entitlement.userId,
      bookId: entitlement.bookId,
      entitlementId: entitlement._id,
      at: now,
    });
    await this.entitlements
      .updateOne(
        { _id: entitlement._id },
        { $inc: { downloadCount: 1 }, $set: { lastDownloadedAt: now } },
      )
      .exec();
    await this.alertIfUnusual(entitlement, book, now);
    return link;
  }

  /** Saves where the reader is; `maxPage` only ever grows (the refund rule reads it). */
  async saveProgress(
    userId: string,
    bookId: string,
    page: number,
  ): Promise<void> {
    const { entitlement, book } = await this.ownedBook(userId, bookId);
    const pages = book.manuscript?.pages ?? page;
    const clamped = Math.max(1, Math.min(page, pages));
    await this.progress
      .updateOne(
        { userId: entitlement.userId, bookId: entitlement.bookId },
        { $set: { page: clamped }, $max: { maxPage: clamped } },
        { upsert: true },
      )
      .exec();
  }

  // ---------------------------------------------------------------- copies

  /**
   * The buyer's file: the master itself when the book isn't stamped; otherwise their personal
   * copy. A copy made from an older edition stays readable while the new one is built.
   */
  private resolve(
    entitlement: EntitlementDocument,
    book: LibraryBook,
  ): Resolved {
    const manuscript = book.manuscript;
    if (!manuscript)
      return { key: null, updating: false, needsBuild: false, failed: true };
    if (!stampsCopies(book)) {
      return {
        key: manuscript.key,
        updating: false,
        needsBuild: false,
        failed: false,
      };
    }
    const copy = entitlement.copy;
    if (copy?.key && copy.sourceChecksum === manuscript.checksum) {
      return {
        key: copy.key,
        updating: false,
        needsBuild: false,
        failed: false,
      };
    }
    const building =
      copy?.targetChecksum === manuscript.checksum &&
      (copy.status === 'queued' || copy.status === 'preparing');
    const failedRecently =
      copy?.targetChecksum === manuscript.checksum &&
      copy.status === 'failed' &&
      Date.now() - (copy.startedAt?.getTime() ?? 0) < FAILED_RETRY_AFTER_MS;
    return {
      key: copy?.key ?? null,
      updating: Boolean(copy?.key),
      needsBuild: !building && !failedRecently,
      failed: failedRecently && !copy?.key,
    };
  }

  private async fileLink(
    entitlement: EntitlementDocument,
    book: LibraryBook,
    seconds: number,
    now: Date,
    options: { downloadAs?: string } = {},
  ): Promise<FileLink> {
    if (!this.files.configured) {
      throw new ServiceUnavailableException(
        'Book files are not available on this server right now. Please try again later.',
      );
    }
    const resolved = this.resolve(entitlement, book);
    if (resolved.needsBuild) await this.queueCopy(entitlement, book);
    if (resolved.key) {
      return {
        status: 'ready',
        url: await this.files.signedReadUrl(resolved.key, seconds, options),
        expiresAt: new Date(now.getTime() + seconds * 1000).toISOString(),
        updating: resolved.updating,
      };
    }
    if (resolved.failed) {
      throw new ServiceUnavailableException(
        'We couldn’t prepare your copy of this book. The store has been told and will fix it; please try again later.',
      );
    }
    return { status: 'preparing' };
  }

  /** Asks `CopyWorker` for a copy of the current edition (a no-op if one is already on its way). */
  async queueCopy(
    entitlement: EntitlementDocument,
    book: LibraryBook,
  ): Promise<void> {
    const checksum = book.manuscript?.checksum;
    if (!checksum || !stampsCopies(book)) return;
    const now = new Date();
    if (!entitlement.copy) {
      await this.entitlements
        .updateOne(
          { _id: entitlement._id, copy: null },
          {
            $set: {
              copy: {
                status: 'queued',
                key: null,
                bytes: null,
                sourceChecksum: null,
                targetChecksum: checksum,
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
      return;
    }
    await this.entitlements
      .updateOne(
        {
          _id: entitlement._id,
          $or: [
            { 'copy.targetChecksum': { $ne: checksum } },
            { 'copy.status': 'failed' },
            {
              'copy.status': 'ready',
              'copy.sourceChecksum': { $ne: checksum },
            },
          ],
        },
        {
          $set: {
            'copy.status': 'queued',
            'copy.targetChecksum': checksum,
            'copy.attempts': 0,
            'copy.queuedAt': now,
            'copy.startedAt': null,
            'copy.error': null,
          },
          $inc: { 'copy.buildToken': 1 },
        },
      )
      .exec();
  }

  // ---------------------------------------------------------------- helpers

  private async ownedBook(
    userId: string,
    bookId: string,
  ): Promise<{ entitlement: EntitlementDocument; book: LibraryBook }> {
    const entitlement = await this.entitlements
      .findOne({
        userId: toObjectId(userId, 'User'),
        bookId: toObjectId(bookId, 'Book'),
        revokedAt: null,
      })
      .exec();
    if (!entitlement) throw this.notOwned();
    const book = (await this.loadBooks([entitlement.bookId])).get(bookId);
    if (!book) throw this.notOwned();
    return { entitlement, book };
  }

  private async loadBooks(
    ids: Types.ObjectId[],
  ): Promise<Map<string, LibraryBook>> {
    // Any status: archiving a book never breaks a buyer's library (PRODUCT_RULES §3).
    const books = await this.books
      .find(
        { _id: { $in: ids } },
        {
          slug: 1,
          title: 1,
          subtitle: 1,
          authorIds: 1,
          cover: 1,
          manuscript: 1,
          formats: 1,
          tableOfContents: 1,
          preview: 1,
        },
      )
      .exec();
    return new Map(books.map((b) => [b._id.toString(), b]));
  }

  private async alertIfUnusual(
    entitlement: EntitlementDocument,
    book: LibraryBook,
    now: Date,
  ): Promise<void> {
    if (!this.ownerEmail) return;
    const dayAgo = new Date(now.getTime() - 24 * 60 * 60_000);
    const count = await this.downloads
      .countDocuments({
        userId: entitlement.userId,
        bookId: entitlement.bookId,
        at: { $gt: dayAgo },
      })
      .exec();
    if (count < ABUSE_THRESHOLD) return;
    const [user, order] = await Promise.all([
      this.users
        .findById(entitlement.userId, { name: 1, email: 1 })
        .lean()
        .exec(),
      this.orders
        .findById(entitlement.orderId, { orderNumber: 1 })
        .lean()
        .exec(),
    ]);
    await this.mail.enqueue({
      to: this.ownerEmail,
      template: 'ops.download-abuse',
      dedupeKey: `download-abuse:${entitlement._id.toString()}:${now.toISOString().slice(0, 10)}`,
      data: {
        customer: user ? `${user.name} (${user.email})` : 'A customer',
        title: book.title,
        downloadsLast24h: count,
        adminUrl: `${this.frontendUrl}/admin/orders/${order?.orderNumber ?? ''}`,
      },
    });
    this.logger.warn(
      `Unusual downloads: entitlement ${entitlement._id.toString()} downloaded ${count} times in 24h`,
    );
  }

  private notOwned(): NotFoundException {
    return new NotFoundException('This book isn’t in your library.');
  }
}

/** Per-buyer stamping is on unless the ebook format turns it off (it defaults to on). */
export function stampsCopies(book: Pick<Book, 'formats'>): boolean {
  const ebook = book.formats.find((f) => f.type === 'ebook');
  return ebook?.ebook?.stampWithBuyer !== false;
}
