import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Types, type QueryFilter, type Model, type SortOrder } from 'mongoose';
import type { Currency } from '../common/money/currency.js';
import { CloudinaryService } from '../uploads/cloudinary.service.js';
import {
  CatalogPresenter,
  type BookCardDto,
  type PublicAuthorDto,
  type PublicBookDto,
  type PublicCategoryDto,
} from './catalog.presenter.js';
import type { BookListQuery } from './dto/catalog.dto.js';
import { Author, type AuthorDocument } from './schemas/author.schema.js';
import { Book, type BookDocument } from './schemas/book.schema.js';
import { Category, type CategoryDocument } from './schemas/category.schema.js';

export interface BookPage {
  items: BookCardDto[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

export type BookLookup = { book: PublicBookDto } | { redirectTo: string };

const DEFAULT_PAGE_SIZE = 20;
const PUBLISHED = 'published' as const;

/** Read-only storefront queries. Only published books are ever visible here. */
@Injectable()
export class CatalogQueryService {
  private readonly present: CatalogPresenter;

  constructor(
    @InjectModel(Book.name) private readonly books: Model<Book>,
    @InjectModel(Author.name) private readonly authors: Model<Author>,
    @InjectModel(Category.name) private readonly categories: Model<Category>,
    media: CloudinaryService,
  ) {
    this.present = new CatalogPresenter(media);
  }

  async list(query: BookListQuery): Promise<BookPage> {
    const currency: Currency = query.currency ?? 'USD';
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? DEFAULT_PAGE_SIZE;
    const filter: QueryFilter<Book> = { status: PUBLISHED };

    if (query.q) filter.$text = { $search: query.q };
    if (query.featured) filter.featured = true;
    if (query.format)
      filter.formats = { $elemMatch: { type: query.format, active: true } };
    if (query.category) {
      const category = await this.categories
        .findOne({ slug: query.category })
        .exec();
      if (!category)
        return { items: [], total: 0, page, pageSize, totalPages: 0 };
      filter.categoryIds = category._id;
    }
    if (query.author) {
      const author = await this.authors.findOne({ slug: query.author }).exec();
      if (!author)
        return { items: [], total: 0, page, pageSize, totalPages: 0 };
      filter.authorIds = author._id;
    }
    if (query.minPrice !== undefined || query.maxPrice !== undefined) {
      filter[`fromPrices.${currency}`] = {
        ...(query.minPrice !== undefined ? { $gte: query.minPrice } : {}),
        ...(query.maxPrice !== undefined ? { $lte: query.maxPrice } : {}),
      };
    }

    const sort = this.sortFor(
      query.sort ?? (query.q ? 'relevance' : 'newest'),
      currency,
      Boolean(query.q),
    );
    const projection = query.q ? { score: { $meta: 'textScore' } } : {};
    const [docs, total] = await Promise.all([
      this.books
        .find(filter, projection)
        .sort(sort)
        .skip((page - 1) * pageSize)
        .limit(pageSize)
        .exec(),
      this.books.countDocuments(filter).exec(),
    ]);
    const authors = await this.authorsFor(docs);
    return {
      items: docs.map((book) => this.present.card(book, authors, currency)),
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize),
    };
  }

  /** Book page data, or where a renamed book now lives. */
  async bySlug(slug: string, currency: Currency): Promise<BookLookup> {
    const book = await this.books.findOne({ slug, status: PUBLISHED }).exec();
    if (book) {
      const [authors, categories] = await Promise.all([
        this.authorsFor([book]),
        this.categoriesFor([book]),
      ]);
      return { book: this.present.book(book, authors, categories, currency) };
    }
    const renamed = await this.books
      .findOne({ previousSlugs: slug, status: PUBLISHED }, { slug: 1 })
      .exec();
    if (renamed) return { redirectTo: renamed.slug };
    throw new NotFoundException('Book not found');
  }

  /** Same category first, then same author, then the newest; never the book itself. */
  async related(
    slug: string,
    currency: Currency,
    limit = 5,
  ): Promise<BookCardDto[]> {
    const book = await this.books.findOne({ slug, status: PUBLISHED }).exec();
    if (!book) throw new NotFoundException('Book not found');
    const picked = new Map<string, BookDocument>();
    const pools: Array<QueryFilter<Book>> = [
      { categoryIds: { $in: book.categoryIds } },
      { authorIds: { $in: book.authorIds } },
      {},
    ];
    for (const extra of pools) {
      if (picked.size >= limit) break;
      const docs = await this.books
        .find({
          status: PUBLISHED,
          _id: {
            $nin: [
              book._id,
              ...[...picked.keys()].map((id) => new Types.ObjectId(id)),
            ],
          },
          ...extra,
        })
        .sort({ salesCount: -1, listedAt: -1 })
        .limit(limit - picked.size)
        .exec();
      for (const doc of docs) picked.set(doc._id.toString(), doc);
    }
    const docs = [...picked.values()];
    const authors = await this.authorsFor(docs);
    return docs.map((doc) => this.present.card(doc, authors, currency));
  }

  /** Categories that have at least one published book, with counts. */
  async categoriesWithCounts(): Promise<PublicCategoryDto[]> {
    const [categories, counts] = await Promise.all([
      this.categories.find().sort({ sortOrder: 1, name: 1 }).exec(),
      this.books
        .aggregate<{ _id: Types.ObjectId; count: number }>([
          { $match: { status: PUBLISHED } },
          { $unwind: '$categoryIds' },
          { $group: { _id: '$categoryIds', count: { $sum: 1 } } },
        ])
        .exec(),
    ]);
    const countById = new Map(
      counts.map((row) => [row._id.toString(), row.count]),
    );
    return categories
      .map((category) =>
        this.present.category(
          category,
          countById.get(category._id.toString()) ?? 0,
        ),
      )
      .filter((category) => (category.bookCount ?? 0) > 0);
  }

  async authorBySlug(slug: string): Promise<PublicAuthorDto> {
    const author = await this.authors.findOne({ slug }).exec();
    if (!author) throw new NotFoundException('Author not found');
    return this.present.author(author);
  }

  /** The store's own author(s), for the home page and "About the author". */
  async featuredAuthors(): Promise<PublicAuthorDto[]> {
    const ids = await this.books
      .distinct('authorIds', { status: PUBLISHED })
      .exec();
    const authors = await this.authors
      .find({ _id: { $in: ids } })
      .sort({ name: 1 })
      .limit(4)
      .exec();
    return authors.map((author) => this.present.author(author));
  }

  /** Published slugs and last-modified dates for the sitemap. */
  async sitemapEntries(): Promise<Array<{ slug: string; updatedAt: string }>> {
    const docs = await this.books
      .find({ status: PUBLISHED }, { slug: 1, updatedAt: 1 })
      .lean()
      .exec();
    return docs.map((doc) => ({
      slug: doc.slug,
      updatedAt: (
        doc as unknown as { updatedAt: Date }
      ).updatedAt.toISOString(),
    }));
  }

  private sortFor(
    sort: string,
    currency: Currency,
    hasText: boolean,
  ): Record<string, SortOrder | { $meta: 'textScore' }> {
    switch (sort) {
      case 'relevance':
        return hasText
          ? { score: { $meta: 'textScore' }, listedAt: -1 }
          : { featured: -1, listedAt: -1 };
      case 'price_asc':
        return { [`fromPrices.${currency}`]: 1, listedAt: -1 };
      case 'price_desc':
        return { [`fromPrices.${currency}`]: -1, listedAt: -1 };
      case 'rating':
        return { ratingAvg: -1, ratingCount: -1, listedAt: -1 };
      case 'title':
        return { title: 1 };
      default:
        return { listedAt: -1, _id: -1 };
    }
  }

  private async authorsFor(
    books: BookDocument[],
  ): Promise<Map<string, AuthorDocument>> {
    const ids = [
      ...new Set(books.flatMap((b) => b.authorIds.map((id) => id.toString()))),
    ];
    const docs = await this.authors
      .find({ _id: { $in: ids.map((id) => new Types.ObjectId(id)) } })
      .exec();
    return new Map(docs.map((doc) => [doc._id.toString(), doc]));
  }

  private async categoriesFor(
    books: BookDocument[],
  ): Promise<Map<string, CategoryDocument>> {
    const ids = [
      ...new Set(
        books.flatMap((b) => b.categoryIds.map((id) => id.toString())),
      ),
    ];
    const docs = await this.categories
      .find({ _id: { $in: ids.map((id) => new Types.ObjectId(id)) } })
      .exec();
    return new Map(docs.map((doc) => [doc._id.toString(), doc]));
  }
}
