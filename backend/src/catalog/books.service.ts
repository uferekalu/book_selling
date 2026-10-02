import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Types, type QueryFilter, type Model } from 'mongoose';
import { AuditService } from '../audit/audit.module.js';
import type { AccessTokenPayload } from '../auth/interfaces/auth.types.js';
import { CURRENCIES } from '../common/money/currency.js';
import { markdownToSafeHtml } from '../common/text/rich-text.js';
import { toObjectId } from '../common/utils/object-id.js';
import { PreviewStorage } from '../preview/preview-storage.js';
import { queuePreviewBuild } from '../preview/preview.service.js';
import { BookFilesService } from '../uploads/book-files.service.js';
import { CloudinaryService } from '../uploads/cloudinary.service.js';
import { normaliseIsbn13, publishProblems } from './catalog-rules.js';
import type {
  AdminBookListQuery,
  AttachImageDto,
  AttachManuscriptDto,
  FormatDto,
  UpdateBookDto,
} from './dto/catalog.dto.js';
import { ManuscriptsService } from './manuscripts.service.js';
import { Author } from './schemas/author.schema.js';
import {
  Book,
  type BookDocument,
  type BookFormat,
  type BookStatus,
} from './schemas/book.schema.js';
import { Category } from './schemas/category.schema.js';
import {
  CATALOG_TAGS,
  StorefrontRevalidator,
} from './storefront-revalidator.js';
import { uniqueSlug } from './unique-slug.js';

export const MAX_GALLERY_IMAGES = 8;
const ADMIN_PAGE_SIZE = 25;

/** Everything staff do to books (ARCHITECTURE §10.0). Every change is audited and refreshes the storefront. */
@Injectable()
export class BooksService {
  constructor(
    @InjectModel(Book.name) private readonly books: Model<Book>,
    @InjectModel(Author.name) private readonly authors: Model<Author>,
    @InjectModel(Category.name) private readonly categories: Model<Category>,
    private readonly media: CloudinaryService,
    private readonly audit: AuditService,
    private readonly revalidator: StorefrontRevalidator,
    private readonly previewFiles: PreviewStorage,
    private readonly manuscripts: ManuscriptsService,
    private readonly files: BookFilesService,
  ) {}

  async list(query: AdminBookListQuery): Promise<{
    items: BookDocument[];
    total: number;
    page: number;
    pageSize: number;
  }> {
    const filter: QueryFilter<Book> = {};
    if (query.status) filter.status = query.status as BookStatus;
    if (query.q) filter.title = { $regex: escapeRegex(query.q), $options: 'i' };
    const page = query.page ?? 1;
    const [items, total] = await Promise.all([
      this.books
        .find(filter)
        .sort({ updatedAt: -1 })
        .skip((page - 1) * ADMIN_PAGE_SIZE)
        .limit(ADMIN_PAGE_SIZE)
        .exec(),
      this.books.countDocuments(filter).exec(),
    ]);
    return { items, total, page, pageSize: ADMIN_PAGE_SIZE };
  }

  async get(id: string): Promise<BookDocument> {
    const book = await this.books.findById(toObjectId(id, 'Book')).exec();
    if (!book) throw new NotFoundException('Book not found');
    return book;
  }

  async create(
    title: string,
    actor: AccessTokenPayload,
  ): Promise<BookDocument> {
    const book = await this.books.create({
      title,
      slug: await uniqueSlug(this.books, title, { checkPrevious: true }),
    });
    await this.record(actor, 'book.created', book, { title });
    return book;
  }

  async update(
    id: string,
    dto: UpdateBookDto,
    actor: AccessTokenPayload,
  ): Promise<BookDocument> {
    const book = await this.get(id);
    const changed: string[] = [];
    const assign = <K extends keyof Book>(key: K, value: Book[K]) => {
      book.set(key, value);
      changed.push(key);
    };

    if (dto.title !== undefined) assign('title', dto.title);
    if (dto.subtitle !== undefined) assign('subtitle', dto.subtitle);
    if (dto.slug !== undefined && dto.slug !== book.slug)
      await this.changeSlug(book, dto.slug, changed);
    if (dto.authorIds !== undefined)
      assign(
        'authorIds',
        await this.existingIds(this.authors, dto.authorIds, 'author'),
      );
    if (dto.categoryIds !== undefined)
      assign(
        'categoryIds',
        await this.existingIds(this.categories, dto.categoryIds, 'category'),
      );
    if (dto.descriptionMarkdown !== undefined) {
      assign('descriptionMarkdown', dto.descriptionMarkdown);
      assign('descriptionHtml', markdownToSafeHtml(dto.descriptionMarkdown));
    }
    if (dto.abstractMarkdown !== undefined) {
      assign('abstractMarkdown', dto.abstractMarkdown);
      assign('abstractHtml', markdownToSafeHtml(dto.abstractMarkdown));
    }
    if (dto.tableOfContents !== undefined) {
      assign(
        'tableOfContents',
        dto.tableOfContents.map((entry) => ({
          title: entry.title,
          page: entry.page ?? null,
          children: (entry.children ?? []).map((child) => ({
            title: child.title,
            page: child.page ?? null,
          })),
        })),
      );
    }
    if (dto.isbn13 !== undefined) {
      if (dto.isbn13 === null || dto.isbn13 === '') assign('isbn13', null);
      else {
        const isbn = normaliseIsbn13(dto.isbn13);
        if (!isbn)
          throw new BadRequestException(
            'That ISBN-13 is not valid. Check the digits (978… or 979…).',
          );
        assign('isbn13', isbn);
      }
    }
    if (dto.edition !== undefined) assign('edition', dto.edition);
    if (dto.publicationDate !== undefined)
      assign(
        'publicationDate',
        dto.publicationDate ? new Date(dto.publicationDate) : null,
      );
    if (dto.pageCount !== undefined) assign('pageCount', dto.pageCount);
    if (dto.language !== undefined) assign('language', dto.language);
    if (dto.tags !== undefined) {
      assign('tags', [
        ...new Set(dto.tags.map((t) => t.trim().toLowerCase()).filter(Boolean)),
      ]);
    }
    if (dto.seo !== undefined)
      assign('seo', {
        title: dto.seo.title ?? '',
        description: dto.seo.description ?? '',
      });
    if (dto.featured !== undefined) assign('featured', dto.featured);

    await book.save();
    await this.record(actor, 'book.updated', book, { fields: changed });
    return book;
  }

  /**
   * Replaces the format list. SKUs are generated and kept stable per format type, stock already
   * reserved by unpaid orders is preserved, and prices are recorded in the audit log.
   */
  async setFormats(
    id: string,
    formats: FormatDto[],
    actor: AccessTokenPayload,
  ): Promise<BookDocument> {
    const book = await this.get(id);
    const types = formats.map((f) => f.type);
    if (new Set(types).size !== types.length)
      throw new BadRequestException('Each format can appear only once');

    const next: BookFormat[] = formats.map((dto) => {
      const existing = book.formats.find((f) => f.type === dto.type);
      const currencies = dto.prices.map((p) => p.currency);
      if (new Set(currencies).size !== currencies.length) {
        throw new BadRequestException(
          `${dto.type}: each currency can have only one price`,
        );
      }
      const reserved = existing?.print?.stockReserved ?? 0;
      if (
        dto.type === 'print' &&
        dto.print &&
        dto.print.stockOnHand < reserved
      ) {
        throw new BadRequestException(
          `Print stock can't go below the ${reserved} copies held by unpaid orders`,
        );
      }
      return {
        type: dto.type,
        sku:
          existing?.sku ??
          `BK-${book._id.toString().slice(-6).toUpperCase()}-${dto.type === 'ebook' ? 'E' : 'P'}`,
        active: dto.active,
        prices: CURRENCIES.flatMap((c) =>
          dto.prices.filter((p) => p.currency === c),
        ),
        compareAtPrices: (dto.compareAtPrices ?? []).filter((p) =>
          dto.prices.some((q) => q.currency === p.currency),
        ),
        ebook:
          dto.type === 'ebook'
            ? { stampWithBuyer: dto.ebook?.stampWithBuyer ?? true }
            : null,
        print:
          dto.type === 'print'
            ? {
                stockOnHand: dto.print?.stockOnHand ?? 0,
                stockReserved: reserved,
                weightGrams: dto.print?.weightGrams ?? 0,
                maxPerOrder: dto.print?.maxPerOrder ?? 5,
              }
            : null,
      };
    });

    if (book.status === 'published' && !next.some((f) => f.active)) {
      throw new BadRequestException(
        'A published book needs at least one format on sale. Unpublish it first.',
      );
    }
    const before = book.formats.map((f) => ({
      type: f.type,
      active: f.active,
      prices: f.prices,
    }));
    book.formats = next;
    await book.save();
    await this.record(actor, 'book.formats_changed', book, {
      before,
      after: next.map((f) => ({
        type: f.type,
        active: f.active,
        prices: f.prices,
      })),
    });
    return book;
  }

  async attachCover(
    id: string,
    dto: AttachImageDto,
    actor: AccessTokenPayload,
  ): Promise<BookDocument> {
    const book = await this.get(id);
    const asset = await this.media.verify('cover', id, dto.publicId);
    const crop = dto.crop
      ? this.checkedCrop(dto.crop, asset.width, asset.height)
      : null;
    const previous = book.cover?.publicId;
    book.cover = {
      publicId: asset.publicId,
      version: asset.version,
      width: asset.width,
      height: asset.height,
      format: asset.format,
      crop,
      dominantColor: asset.dominantColor,
      blurDataUrl: await this.media.blurDataUrl(
        asset.publicId,
        asset.version,
        crop,
      ),
      alt: dto.alt ?? '',
    };
    await book.save();
    await this.media.markAttached(asset.publicId);
    if (previous && previous !== asset.publicId)
      await this.media.destroy(previous);
    await this.record(actor, 'book.cover_changed', book);
    return book;
  }

  async addGalleryImage(
    id: string,
    dto: AttachImageDto,
    actor: AccessTokenPayload,
  ): Promise<BookDocument> {
    const book = await this.get(id);
    if (book.gallery.length >= MAX_GALLERY_IMAGES) {
      throw new BadRequestException(
        `A book can have up to ${MAX_GALLERY_IMAGES} sample images`,
      );
    }
    const asset = await this.media.verify('gallery', id, dto.publicId);
    book.gallery.push({
      publicId: asset.publicId,
      version: asset.version,
      width: asset.width,
      height: asset.height,
      format: asset.format,
      crop: null,
      dominantColor: asset.dominantColor,
      blurDataUrl: await this.media.blurDataUrl(asset.publicId, asset.version),
      alt: dto.alt ?? '',
    });
    await book.save();
    await this.media.markAttached(asset.publicId);
    await this.record(actor, 'book.gallery_added', book);
    return book;
  }

  async removeGalleryImage(
    id: string,
    publicId: string,
    actor: AccessTokenPayload,
  ): Promise<BookDocument> {
    const book = await this.get(id);
    const before = book.gallery.length;
    book.gallery = book.gallery.filter((g) => g.publicId !== publicId);
    if (book.gallery.length === before)
      throw new NotFoundException('Image not found on this book');
    await book.save();
    await this.media.destroy(publicId);
    await this.record(actor, 'book.gallery_removed', book);
    return book;
  }

  /**
   * Makes a finished upload the book's master PDF, after the server has read and checked it. The
   * same file uploaded again changes nothing. A replaced file of a book that was ever on sale is
   * kept (buyers' copies came from it; BS-9 moves them over); a never-sold book's is deleted.
   */
  async attachManuscript(
    id: string,
    dto: AttachManuscriptDto,
    actor: AccessTokenPayload,
  ): Promise<BookDocument> {
    const book = await this.get(id);
    const file = await this.manuscripts.check(id, dto.key);
    const previous = book.manuscript;
    if (previous?.checksum === file.checksum) {
      await this.manuscripts.discard(file.key);
      return book;
    }
    const now = new Date();
    book.manuscript = {
      key: file.key,
      bytes: file.bytes,
      pages: file.pages,
      checksum: file.checksum,
      uploadedAt: now,
      replacedAt: null,
    };
    if (!book.pageCount) book.pageCount = file.pages;
    if (previous) {
      if (book.listedAt) {
        book.previousManuscripts.push({
          key: previous.key,
          bytes: previous.bytes,
          pages: previous.pages,
          checksum: previous.checksum,
          uploadedAt: previous.uploadedAt,
          replacedAt: now,
        });
      }
      // Rebuild the preview from the new file. The current preview keeps being served until the
      // new one is ready, so the store never shows a book without its preview.
      queuePreviewBuild(book.preview, now);
      book.markModified('preview');
    }
    await book.save();
    await this.manuscripts.attached(file.key);
    if (previous && !book.listedAt) await this.files.delete(previous.key);
    await this.record(actor, 'book.manuscript_changed', book, {
      pages: file.pages,
      bytes: file.bytes,
      replaced: Boolean(previous),
    });
    return book;
  }

  async publish(id: string, actor: AccessTokenPayload): Promise<BookDocument> {
    const book = await this.get(id);
    const problems = publishProblems(book);
    if (problems.length) {
      throw new BadRequestException({
        message: 'This book is not ready to publish yet',
        problems,
        code: 'not_ready',
      });
    }
    book.status = 'published';
    book.listedAt ??= new Date();
    await book.save();
    await this.record(actor, 'book.published', book);
    return book;
  }

  async unpublish(
    id: string,
    actor: AccessTokenPayload,
  ): Promise<BookDocument> {
    return this.setStatus(id, 'draft', 'book.unpublished', actor);
  }

  /** Hidden from the store; buyers keep their copies. */
  async archive(id: string, actor: AccessTokenPayload): Promise<BookDocument> {
    return this.setStatus(id, 'archived', 'book.archived', actor);
  }

  /** Only a draft that has never been on sale can be deleted; anything else is archived instead. */
  async remove(id: string, actor: AccessTokenPayload): Promise<void> {
    const book = await this.get(id);
    if (book.status !== 'draft' || book.listedAt) {
      throw new ConflictException(
        'Only a draft that was never published can be deleted. Archive it instead.',
      );
    }
    await book.deleteOne();
    for (const image of [book.cover, ...book.gallery]) {
      if (image) await this.media.destroy(image.publicId);
    }
    for (const file of [book.manuscript, ...book.previousManuscripts]) {
      if (file) await this.files.delete(file.key);
    }
    if (book.preview?.fileId)
      await this.previewFiles.remove(book.preview.fileId);
    await this.record(actor, 'book.deleted', book, { title: book.title });
  }

  private async setStatus(
    id: string,
    status: 'draft' | 'archived',
    action: string,
    actor: AccessTokenPayload,
  ) {
    const book = await this.get(id);
    book.status = status;
    await book.save();
    await this.record(actor, action, book);
    return book;
  }

  private async changeSlug(
    book: BookDocument,
    slug: string,
    changed: string[],
  ) {
    const taken = await this.books
      .exists({
        _id: { $ne: book._id },
        $or: [{ slug }, { previousSlugs: slug }],
      })
      .exec();
    if (taken)
      throw new ConflictException('Another book already uses that web address');
    // A published book's old URL keeps working: it redirects to the new one.
    if (book.listedAt && !book.previousSlugs.includes(book.slug))
      book.previousSlugs.push(book.slug);
    book.previousSlugs = book.previousSlugs.filter((s) => s !== slug);
    book.slug = slug;
    changed.push('slug');
  }

  // `any`: shared by the author and category models.
  private async existingIds(
    model: Model<any>,
    ids: string[],
    what: string,
  ): Promise<Types.ObjectId[]> {
    const unique = [...new Set(ids)];
    const objectIds = unique.map((id) => toObjectId(id, what));
    const found = await model
      .countDocuments({ _id: { $in: objectIds } })
      .exec();
    if (found !== unique.length)
      throw new BadRequestException(
        `Unknown ${what}: refresh the page and try again`,
      );
    return objectIds;
  }

  private checkedCrop(
    crop: { x: number; y: number; width: number; height: number },
    width: number,
    height: number,
  ) {
    if (crop.x + crop.width > width || crop.y + crop.height > height) {
      throw new BadRequestException('The crop goes outside the image');
    }
    const ratio = crop.width / crop.height;
    if (Math.abs(ratio - 2 / 3) > 0.02)
      throw new BadRequestException('Covers are cropped to a 2:3 shape');
    return crop;
  }

  private async record(
    actor: AccessTokenPayload,
    action: string,
    book: BookDocument,
    changes?: Record<string, unknown>,
  ) {
    await this.audit.record({
      actor: { id: actor.sub, role: actor.role },
      action,
      entityType: 'book',
      entityId: book._id.toString(),
      changes,
    });
    this.revalidator.notify([
      CATALOG_TAGS.all,
      CATALOG_TAGS.book(book.slug),
      ...book.previousSlugs.map(CATALOG_TAGS.book),
    ]);
  }
}

export function escapeRegex(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
