import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Types, type Model, type QueryFilter } from 'mongoose';
import { AuditService } from '../audit/audit.module.js';
import { Book } from '../catalog/schemas/book.schema.js';
import {
  CATALOG_TAGS,
  StorefrontRevalidator,
} from '../catalog/storefront-revalidator.js';
import { Order } from '../commerce/schemas/order.schema.js';
import { toObjectId } from '../common/utils/object-id.js';
import { STAFF_ROLES, User } from '../users/schemas/user.schema.js';
import {
  Review,
  REVIEW_BODY_MAX,
  type ReviewStatus,
} from './schemas/review.schema.js';

export const REVIEWS_PAGE = 10;
export const ADMIN_REVIEWS_PAGE = 20;
/** Orders that prove a purchase: paid, possibly shipped or partly refunded (not fully refunded). */
const BOUGHT = ['paid', 'fulfilled', 'partially_refunded'] as const;

export interface PublicReview {
  id: string;
  authorName: string;
  rating: number;
  title: string;
  body: string;
  verifiedPurchase: boolean;
  createdAt: Date;
  edited: boolean;
}

export interface RatingSummary {
  average: number;
  count: number;
  /** Published reviews per star, 5 down to 1. */
  distribution: Record<1 | 2 | 3 | 4 | 5, number>;
}

type ReviewRow = Review & { _id: Types.ObjectId };

/** "Ada Obi" → "Ada O.": enough to be human, never the full name or email. */
export function reviewerName(fullName: string): string {
  const parts = fullName.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return 'A reader';
  const first = parts[0].slice(0, 40);
  const last =
    parts.length > 1 ? ` ${parts.at(-1)!.charAt(0).toUpperCase()}.` : '';
  return `${first}${last}`;
}

/** Plain text: trimmed, Windows line endings normalised, at most two blank lines in a row. */
export function cleanText(raw: string | undefined, max: number): string {
  const text = (raw ?? '')
    .replace(/\r\n?/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  if (text.length > max) {
    throw new BadRequestException(
      `Keep it under ${max.toLocaleString('en')} characters`,
    );
  }
  return text;
}

/** One decimal place, the way stars are shown ("4.3"). */
export const roundRating = (value: number) => Math.round(value * 10) / 10;

/**
 * Reviews (PRODUCT_RULES §12, BS-11). Only a buyer with a paid order for the book can review it,
 * once (they can edit or delete their own). Staff hide abusive reviews but never edit them. The
 * book's rating (`ratingAvg`, `ratingCount`) is recomputed from published reviews after every
 * change, and the storefront cache for the book is refreshed.
 */
@Injectable()
export class ReviewsService {
  constructor(
    @InjectModel(Review.name) private readonly reviews: Model<Review>,
    @InjectModel(Book.name) private readonly books: Model<Book>,
    @InjectModel(Order.name) private readonly orders: Model<Order>,
    @InjectModel(User.name) private readonly users: Model<User>,
    private readonly revalidator: StorefrontRevalidator,
    private readonly audit: AuditService,
  ) {}

  // ── public

  async forBook(
    bookId: string,
    page: number,
  ): Promise<{
    items: PublicReview[];
    total: number;
    page: number;
    pageSize: number;
    summary: RatingSummary;
  }> {
    const id = toObjectId(bookId, 'Book');
    const filter = { bookId: id, status: 'published' as const };
    const [rows, total, summary] = await Promise.all([
      this.reviews
        .find(filter)
        .sort({ createdAt: -1, _id: -1 })
        .skip((page - 1) * REVIEWS_PAGE)
        .limit(REVIEWS_PAGE)
        .lean<ReviewRow[]>()
        .exec(),
      this.reviews.countDocuments(filter).exec(),
      this.summary(id),
    ]);
    return {
      items: rows.map((r) => this.publicView(r)),
      total,
      page,
      pageSize: REVIEWS_PAGE,
      summary,
    };
  }

  // ── the buyer

  async mine(
    userId: string,
    bookId: string,
  ): Promise<{
    canReview: boolean;
    reason: 'not_bought' | 'staff' | null;
    review: (PublicReview & { status: ReviewStatus }) | null;
  }> {
    const book = toObjectId(bookId, 'Book');
    const [user, row] = await Promise.all([
      this.users.findById(toObjectId(userId), { role: 1 }).lean().exec(),
      this.reviews
        .findOne({ bookId: book, userId: toObjectId(userId) })
        .lean<ReviewRow>()
        .exec(),
    ]);
    if (!user) throw new ForbiddenException();
    const review = row ? { ...this.publicView(row), status: row.status } : null;
    if (STAFF_ROLES.includes(user.role)) {
      return { canReview: false, reason: 'staff', review };
    }
    const bought = await this.hasBought(userId, book);
    return {
      canReview: bought,
      reason: bought ? null : 'not_bought',
      review,
    };
  }

  /** Writes or updates the buyer's own review. Editing a hidden review keeps it hidden. */
  async upsert(
    userId: string,
    bookId: string,
    input: { rating: number; title?: string; body?: string },
  ): Promise<PublicReview & { status: ReviewStatus }> {
    const book = await this.publishedBook(bookId);
    const user = await this.users
      .findById(toObjectId(userId), { name: 1, role: 1 })
      .lean()
      .exec();
    if (!user) throw new ForbiddenException();
    if (STAFF_ROLES.includes(user.role)) {
      throw new ForbiddenException(
        'Store staff can’t review the store’s books',
      );
    }
    if (!(await this.hasBought(userId, book._id))) {
      throw new ForbiddenException(
        'Only readers who bought this book can review it',
      );
    }
    if (
      !Number.isInteger(input.rating) ||
      input.rating < 1 ||
      input.rating > 5
    ) {
      throw new BadRequestException('Choose 1 to 5 stars');
    }
    const title = cleanText(input.title, 120);
    const body = cleanText(input.body, REVIEW_BODY_MAX);
    const row = await this.reviews
      .findOneAndUpdate(
        { bookId: book._id, userId: user._id },
        {
          $set: { rating: input.rating, title, body },
          $setOnInsert: {
            bookId: book._id,
            userId: user._id,
            authorName: reviewerName(user.name),
            verifiedPurchase: true,
            status: 'published',
            hiddenReason: null,
          },
        },
        { upsert: true, returnDocument: 'after' },
      )
      .lean<ReviewRow>()
      .exec();
    await this.refreshRating(book._id, book.slug);
    return { ...this.publicView(row), status: row.status };
  }

  async removeOwn(userId: string, bookId: string): Promise<void> {
    const book = await this.publishedBook(bookId);
    const result = await this.reviews
      .deleteOne({ bookId: book._id, userId: toObjectId(userId) })
      .exec();
    if (result.deletedCount !== 1)
      throw new NotFoundException('You haven’t reviewed this book');
    await this.refreshRating(book._id, book.slug);
  }

  // ── staff

  async adminList(
    status: ReviewStatus | 'all',
    page: number,
  ): Promise<{
    items: Array<
      PublicReview & {
        status: ReviewStatus;
        hiddenReason: string | null;
        book: { id: string; title: string; slug: string } | null;
        reviewerEmail: string | null;
      }
    >;
    total: number;
    page: number;
    pageSize: number;
  }> {
    const filter: QueryFilter<Review> = status === 'all' ? {} : { status };
    const [rows, total] = await Promise.all([
      this.reviews
        .find(filter)
        .sort({ createdAt: -1, _id: -1 })
        .skip((page - 1) * ADMIN_REVIEWS_PAGE)
        .limit(ADMIN_REVIEWS_PAGE)
        .lean<ReviewRow[]>()
        .exec(),
      this.reviews.countDocuments(filter).exec(),
    ]);
    const [books, users] = await Promise.all([
      this.books
        .find(
          { _id: { $in: rows.map((r) => r.bookId) } },
          { title: 1, slug: 1 },
        )
        .lean()
        .exec(),
      this.users
        .find({ _id: { $in: rows.map((r) => r.userId) } }, { email: 1 })
        .lean()
        .exec(),
    ]);
    const bookById = new Map(books.map((b) => [b._id.toString(), b]));
    const emailById = new Map(users.map((u) => [u._id.toString(), u.email]));
    return {
      items: rows.map((r) => {
        const b = bookById.get(r.bookId.toString());
        return {
          ...this.publicView(r),
          status: r.status,
          hiddenReason: r.hiddenReason ?? null,
          book: b
            ? { id: b._id.toString(), title: b.title, slug: b.slug }
            : null,
          reviewerEmail: emailById.get(r.userId.toString()) ?? null,
        };
      }),
      total,
      page,
      pageSize: ADMIN_REVIEWS_PAGE,
    };
  }

  /** Hide (with a reason) or show a review. The words are never changed. Audited. */
  async setVisibility(
    reviewId: string,
    status: ReviewStatus,
    reason: string | undefined,
    actor: { id: string; role: string },
  ): Promise<void> {
    const hiddenReason =
      status === 'hidden'
        ? cleanText(reason, 300) || 'Hidden by the store'
        : null;
    const row = await this.reviews
      .findOneAndUpdate(
        { _id: toObjectId(reviewId, 'Review') },
        { $set: { status, hiddenReason } },
        { returnDocument: 'before' },
      )
      .lean<ReviewRow>()
      .exec();
    if (!row) throw new NotFoundException('Review not found');
    await this.audit.record({
      actor,
      action: status === 'hidden' ? 'review.hidden' : 'review.shown',
      entityType: 'review',
      entityId: reviewId,
      changes: { from: row.status, to: status, reason: hiddenReason },
    });
    const book = await this.books
      .findById(row.bookId, { slug: 1 })
      .lean()
      .exec();
    if (book) await this.refreshRating(row.bookId, book.slug);
  }

  // ── internals

  private async hasBought(
    userId: string,
    bookId: Types.ObjectId,
  ): Promise<boolean> {
    const order = await this.orders
      .exists({
        userId: toObjectId(userId),
        status: { $in: [...BOUGHT] },
        'items.bookId': bookId,
      })
      .exec();
    return order !== null;
  }

  private async publishedBook(bookId: string) {
    const book = await this.books
      .findOne(
        { _id: toObjectId(bookId, 'Book'), status: 'published' },
        { slug: 1 },
      )
      .lean()
      .exec();
    if (!book) throw new NotFoundException('Book not found');
    return book;
  }

  private async summary(bookId: Types.ObjectId): Promise<RatingSummary> {
    const groups = await this.reviews
      .aggregate<{ _id: number; n: number }>([
        { $match: { bookId, status: 'published' } },
        { $group: { _id: '$rating', n: { $sum: 1 } } },
      ])
      .exec();
    const distribution = {
      1: 0,
      2: 0,
      3: 0,
      4: 0,
      5: 0,
    } as RatingSummary['distribution'];
    let count = 0;
    let sum = 0;
    for (const g of groups) {
      const star = g._id as 1 | 2 | 3 | 4 | 5;
      distribution[star] = g.n;
      count += g.n;
      sum += g._id * g.n;
    }
    return {
      average: count ? roundRating(sum / count) : 0,
      count,
      distribution,
    };
  }

  /** The book's stars and count from its published reviews; the storefront refreshes. */
  private async refreshRating(
    bookId: Types.ObjectId,
    slug: string,
  ): Promise<void> {
    const { average, count } = await this.summary(bookId);
    await this.books
      .updateOne(
        { _id: bookId },
        { $set: { ratingAvg: average, ratingCount: count } },
      )
      .exec();
    this.revalidator.notify([CATALOG_TAGS.all, CATALOG_TAGS.book(slug)]);
  }

  private publicView(r: ReviewRow): PublicReview {
    return {
      id: r._id.toString(),
      authorName: r.authorName,
      rating: r.rating,
      title: r.title,
      body: r.body,
      verifiedPurchase: r.verifiedPurchase,
      createdAt: r.createdAt,
      // More than a minute between writing and the last change: say "edited".
      edited: r.updatedAt.getTime() - r.createdAt.getTime() > 60_000,
    };
  }
}
