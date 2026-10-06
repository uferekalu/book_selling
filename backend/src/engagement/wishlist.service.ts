import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import type { Model } from 'mongoose';
import { CatalogQueryService } from '../catalog/catalog-query.service.js';
import type { BookCardDto } from '../catalog/catalog.presenter.js';
import { Book } from '../catalog/schemas/book.schema.js';
import type { Currency } from '../common/money/currency.js';
import { toObjectId } from '../common/utils/object-id.js';
import { Wishlist, WISHLIST_MAX } from './schemas/wishlist.schema.js';

/** Saved books (PRODUCT_RULES §12, BS-11). Each customer's own; adding twice is a no-op. */
@Injectable()
export class WishlistService {
  constructor(
    @InjectModel(Wishlist.name) private readonly wishlists: Model<Wishlist>,
    @InjectModel(Book.name) private readonly books: Model<Book>,
    private readonly catalog: CatalogQueryService,
  ) {}

  async ids(userId: string): Promise<string[]> {
    const doc = await this.wishlists
      .findOne({ userId: toObjectId(userId) }, { bookIds: 1 })
      .lean()
      .exec();
    return (doc?.bookIds ?? []).map(String);
  }

  /** Saved books as storefront cards in the buyer's currency; unpublished ones drop out. */
  async list(userId: string, currency: Currency): Promise<BookCardDto[]> {
    return this.catalog.cardsByIds(await this.ids(userId), currency);
  }

  async add(userId: string, bookId: string): Promise<string[]> {
    const book = await this.books
      .exists({ _id: toObjectId(bookId, 'Book'), status: 'published' })
      .exec();
    if (!book) throw new NotFoundException('Book not found');
    const user = toObjectId(userId);
    const id = toObjectId(bookId, 'Book');
    const current = await this.ids(userId);
    if (current.includes(bookId)) return current;
    if (current.length >= WISHLIST_MAX) {
      throw new ConflictException(
        `Your wishlist is full (${WISHLIST_MAX} books)`,
      );
    }
    // Newest first, never twice: the $ne guard makes a racing duplicate add a no-op.
    const pushed = await this.wishlists
      .updateOne(
        { userId: user, bookIds: { $ne: id } },
        { $push: { bookIds: { $each: [id], $position: 0 } } },
      )
      .exec();
    if (pushed.matchedCount === 0) {
      // No wishlist yet (or the book is already in it, in which case this changes nothing).
      try {
        await this.wishlists
          .updateOne(
            { userId: user },
            { $setOnInsert: { userId: user, bookIds: [id] } },
            { upsert: true },
          )
          .exec();
      } catch (error) {
        // Two first adds at once: the unique index keeps one document; retry the push.
        if ((error as { code?: number }).code !== 11000) throw error;
        await this.wishlists
          .updateOne(
            { userId: user, bookIds: { $ne: id } },
            { $push: { bookIds: { $each: [id], $position: 0 } } },
          )
          .exec();
      }
    }
    return this.ids(userId);
  }

  async remove(userId: string, bookId: string): Promise<string[]> {
    await this.wishlists
      .updateOne(
        { userId: toObjectId(userId) },
        { $pull: { bookIds: toObjectId(bookId, 'Book') } },
      )
      .exec();
    return this.ids(userId);
  }
}
