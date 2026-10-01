import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectModel } from '@nestjs/mongoose';
import type { Model } from 'mongoose';
import type { Readable } from 'node:stream';
import { AuditService } from '../audit/audit.module.js';
import type { AccessTokenPayload } from '../auth/interfaces/auth.types.js';
import { toObjectId } from '../common/utils/object-id.js';
import {
  Book,
  type BookDocument,
  type Preview,
} from '../catalog/schemas/book.schema.js';
import {
  CATALOG_TAGS,
  StorefrontRevalidator,
} from '../catalog/storefront-revalidator.js';
import { CloudinaryService } from '../uploads/cloudinary.service.js';
import {
  buildPreview,
  DEFAULT_MAX_PREVIEW_PERCENT,
  maxPreviewPages,
  previewPageNumbers,
  PreviewBuildError,
  sectionProblems,
  type PreviewSection,
} from './preview-builder.js';
import { PreviewStorage } from './preview-storage.js';

/** A build that ran longer than this is assumed dead (instance restarted) and is re-queued. */
export const STALE_BUILD_MS = 15 * 60_000;
/** Transient failures (network, Cloudinary) are retried this many times. */
export const MAX_BUILD_ATTEMPTS = 3;
const TEASER_COUNT = 2;

/** Puts a rebuild in the queue. A no-op when no sections are chosen yet. */
export function queuePreviewBuild(preview: Preview, now: Date): void {
  if (!preview.sections?.length) return;
  preview.status = 'queued';
  preview.buildToken = (preview.buildToken ?? 0) + 1;
  preview.queuedAt = now;
  preview.startedAt = null;
  preview.attempts = 0;
  preview.error = null;
}

export interface PublicOutlineEntry {
  title: string;
  level: 1 | 2;
  /** Manuscript page, or null when the contents line has no page number. */
  page: number | null;
  /** 1-based page inside the preview PDF, or null when the entry is locked. */
  previewPage: number | null;
}

export interface PublicPreview {
  slug: string;
  title: string;
  fileUrl: string;
  pageCount: number;
  totalPages: number;
  pageMap: number[];
  sections: Array<PreviewSection & { previewPage: number }>;
  outline: PublicOutlineEntry[];
  teasers: string[];
  /** Manuscript page a buyer would continue from after the preview. */
  continuesAt: number | null;
}

@Injectable()
export class PreviewService {
  private readonly logger = new Logger(PreviewService.name);

  constructor(
    @InjectModel(Book.name) private readonly books: Model<Book>,
    private readonly storage: PreviewStorage,
    private readonly media: CloudinaryService,
    private readonly audit: AuditService,
    private readonly revalidator: StorefrontRevalidator,
    private readonly config: ConfigService,
  ) {}

  maxPercent(): number {
    return (
      this.config.get<number>('PREVIEW_MAX_PERCENT') ??
      DEFAULT_MAX_PREVIEW_PERCENT
    );
  }

  // ---------------------------------------------------------------- admin

  async setSections(
    id: string,
    input: { sections: PreviewSection[]; pageOffset?: number },
    actor: AccessTokenPayload,
  ): Promise<BookDocument> {
    const book = await this.getBook(id);
    if (!book.manuscript) {
      throw new BadRequestException(
        'Upload the book PDF first; the preview is made from its pages.',
      );
    }
    const sections = input.sections.map((s) => ({
      label: s.label.trim(),
      fromPage: s.fromPage,
      toPage: s.toPage,
    }));
    const problems = sectionProblems(
      sections,
      book.manuscript.pages,
      this.maxPercent(),
    );
    if (problems.length) {
      throw new BadRequestException({
        message: 'The preview sections need a change',
        problems,
        code: 'invalid_preview',
      });
    }
    book.preview.sections = sections.sort((a, b) => a.fromPage - b.fromPage);
    book.preview.pageOffset = input.pageOffset ?? book.preview.pageOffset ?? 0;
    queuePreviewBuild(book.preview, new Date());
    book.markModified('preview');
    await book.save();
    await this.record(actor, 'book.preview_sections_changed', book, {
      sections,
      pageOffset: book.preview.pageOffset,
    });
    return book;
  }

  async rebuild(id: string, actor: AccessTokenPayload): Promise<BookDocument> {
    const book = await this.getBook(id);
    if (!book.preview.sections.length || !book.manuscript) {
      throw new BadRequestException('Choose the preview sections first.');
    }
    queuePreviewBuild(book.preview, new Date());
    book.markModified('preview');
    await book.save();
    await this.record(actor, 'book.preview_rebuild_requested', book);
    return book;
  }

  /** Signed thumbnails of manuscript pages for the section picker (staff only). */
  async manuscriptPages(
    id: string,
    from: number,
    to: number,
  ): Promise<Array<{ page: number; url: string }>> {
    const book = await this.getBook(id);
    if (!book.manuscript) return [];
    if (!this.media.configured) {
      throw new ServiceUnavailableException(
        'Page thumbnails need Cloudinary, which is not configured on this server.',
      );
    }
    const last = Math.min(to, book.manuscript.pages, from + 59);
    const pages: Array<{ page: number; url: string }> = [];
    for (let page = Math.max(1, from); page <= last; page += 1) {
      pages.push({
        page,
        url: this.media.manuscriptPageUrl(
          book.manuscript.publicId,
          book.manuscript.version,
          page,
        ),
      });
    }
    return pages;
  }

  // ---------------------------------------------------------------- worker

  /**
   * Claims and builds the oldest queued preview (or one stuck in `building`). Returns whether it
   * found work. The claim is a conditional update, so two instances never build the same book.
   */
  async processNext(now: Date = new Date()): Promise<boolean> {
    const book = await this.books
      .findOneAndUpdate(
        {
          $or: [
            { 'preview.status': 'queued' },
            {
              'preview.status': 'building',
              'preview.startedAt': {
                $lt: new Date(now.getTime() - STALE_BUILD_MS),
              },
            },
          ],
        },
        { $set: { 'preview.status': 'building', 'preview.startedAt': now } },
        { sort: { 'preview.queuedAt': 1 }, returnDocument: 'after' },
      )
      .exec();
    if (!book) return false;
    await this.build(book, now);
    return true;
  }

  private async build(book: BookDocument, now: Date): Promise<void> {
    const token = book.preview.buildToken;
    const manuscript = book.manuscript;
    try {
      if (!manuscript) {
        throw new PreviewBuildError('Upload the book PDF first.');
      }
      if (!this.media.configured) {
        throw new PreviewBuildError(
          'File storage (Cloudinary) is not configured on this server, so the book PDF can’t be read.',
        );
      }
      const source = await this.media.downloadManuscript(manuscript.publicId);
      const built = await buildPreview(source, {
        title: book.title,
        sections: book.preview.sections,
        maxPercent: this.maxPercent(),
      });
      const fileId = await this.storage.save(
        built.bytes,
        `${book.slug}-preview.pdf`,
        { bookId: book._id.toString(), sourceChecksum: manuscript.checksum },
      );
      const pageMap = previewPageNumbers(book.preview.sections);
      const teasers = await this.teasers(book, pageMap, built.sourcePages);

      // Only applies if nobody queued a newer build meanwhile.
      const previousFileId = book.preview.fileId;
      const applied = await this.books
        .updateOne(
          { _id: book._id, 'preview.buildToken': token },
          {
            $set: {
              'preview.enabled': true,
              'preview.status': 'ready',
              'preview.fileId': fileId,
              'preview.pageMap': pageMap,
              'preview.sourceChecksum': manuscript.checksum,
              'preview.teasers': teasers,
              'preview.error': null,
              'preview.generatedAt': now,
            },
          },
        )
        .exec();
      if (applied.modifiedCount === 0) {
        await this.storage.remove(fileId);
        return;
      }
      if (previousFileId && !previousFileId.equals(fileId)) {
        await this.storage.remove(previousFileId);
      }
      this.logger.log(
        `Preview built for "${book.title}": ${built.pageCount} of ${built.sourcePages} pages`,
      );
      this.revalidator.notify([CATALOG_TAGS.all, CATALOG_TAGS.book(book.slug)]);
    } catch (error) {
      await this.fail(book, token, error as Error);
    }
  }

  private async fail(
    book: BookDocument,
    token: number,
    error: Error,
  ): Promise<void> {
    const permanent = error instanceof PreviewBuildError;
    const attempts = (book.preview.attempts ?? 0) + 1;
    const retry = !permanent && attempts < MAX_BUILD_ATTEMPTS;
    this.logger.warn(
      `Preview build for "${book.title}" failed (attempt ${attempts}${retry ? ', will retry' : ''}): ${error.message}`,
    );
    await this.books
      .updateOne(
        { _id: book._id, 'preview.buildToken': token },
        {
          $set: {
            'preview.status': retry ? 'queued' : 'failed',
            'preview.attempts': attempts,
            'preview.error': permanent
              ? error.message
              : 'The preview could not be built just now. It will retry automatically; if this stays, use "Rebuild".',
          },
        },
      )
      .exec();
  }

  /** Two blurred hints of the next pages. Optional: a failure here never fails the build. */
  private async teasers(
    book: BookDocument,
    pageMap: number[],
    totalPages: number,
  ): Promise<string[]> {
    const manuscript = book.manuscript;
    if (!manuscript || !this.media.configured) return [];
    const after = pageMap.at(-1) ?? 0;
    const urls: string[] = [];
    for (let i = 1; i <= TEASER_COUNT; i += 1) {
      const page = after + i;
      if (page > totalPages || pageMap.includes(page)) continue;
      try {
        urls.push(
          await this.media.createTeaser(
            manuscript.publicId,
            manuscript.version,
            page,
            book._id.toString(),
            i,
          ),
        );
      } catch (error) {
        this.logger.warn(
          `Teaser for page ${page} skipped: ${(error as Error).message}`,
        );
      }
    }
    return urls;
  }

  // ---------------------------------------------------------------- public

  async publicPreview(slug: string): Promise<PublicPreview> {
    const book = await this.books
      .findOne({ slug, status: 'published', 'preview.enabled': true })
      .exec();
    if (!book?.preview.fileId) throw new NotFoundException('No preview');
    return presentPreview(book);
  }

  /** The preview PDF, only while it belongs to a published book's current preview. */
  async openFile(
    fileId: string,
  ): Promise<{ stream: Readable; size: number; filename: string }> {
    const id = toObjectId(fileId, 'Preview');
    const book = await this.books
      .findOne(
        { 'preview.fileId': id, status: 'published', 'preview.enabled': true },
        { slug: 1 },
      )
      .lean()
      .exec();
    const size = book ? await this.storage.size(id) : null;
    if (!book || size === null) throw new NotFoundException('No preview');
    return {
      stream: this.storage.open(id),
      size,
      filename: `${book.slug}-preview.pdf`,
    };
  }

  /** The built preview of any book (drafts too), for staff checking it before publishing. */
  async openFileForStaff(
    bookId: string,
  ): Promise<{ stream: Readable; size: number; filename: string }> {
    const book = await this.getBook(bookId);
    const id = book.preview?.fileId;
    const size = id ? await this.storage.size(id) : null;
    if (!id || size === null)
      throw new NotFoundException('This book has no built preview yet');
    return {
      stream: this.storage.open(id),
      size,
      filename: `${book.slug}-preview.pdf`,
    };
  }

  // ---------------------------------------------------------------- helpers

  private async getBook(id: string): Promise<BookDocument> {
    const book = await this.books.findById(toObjectId(id, 'Book')).exec();
    if (!book) throw new NotFoundException('Book not found');
    return book;
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
  }
}

/** Public shape, derived on read so a contents edit shows up without a rebuild. */
export function presentPreview(
  book: Pick<
    Book,
    'slug' | 'title' | 'preview' | 'manuscript' | 'tableOfContents'
  >,
): PublicPreview {
  const { preview } = book;
  const pageMap = preview.pageMap;
  const previewPageOf = (page: number | null) => {
    if (page === null) return null;
    const index = pageMap.indexOf(page);
    return index === -1 ? null : index + 1;
  };
  const toManuscriptPage = (printed: number | null | undefined) =>
    printed ? printed + (preview.pageOffset ?? 0) : null;

  const outline: PublicOutlineEntry[] = [];
  for (const entry of book.tableOfContents) {
    const page = toManuscriptPage(entry.page);
    outline.push({
      title: entry.title,
      level: 1,
      page,
      previewPage: previewPageOf(page),
    });
    for (const child of entry.children ?? []) {
      const childPage = toManuscriptPage(child.page);
      outline.push({
        title: child.title,
        level: 2,
        page: childPage,
        previewPage: previewPageOf(childPage),
      });
    }
  }

  const totalPages = book.manuscript?.pages ?? pageMap.length;
  const last = pageMap.at(-1) ?? 0;
  return {
    slug: book.slug,
    title: book.title,
    fileUrl: `/catalog/previews/${preview.fileId!.toString()}`,
    pageCount: pageMap.length,
    totalPages,
    pageMap,
    sections: preview.sections.map((s) => ({
      label: s.label,
      fromPage: s.fromPage,
      toPage: s.toPage,
      previewPage: pageMap.indexOf(s.fromPage) + 1,
    })),
    outline,
    teasers: preview.teasers ?? [],
    continuesAt: last < totalPages ? last + 1 : null,
  };
}

/** For the editor: what the preview can be, given the manuscript and the cap. */
export function previewLimits(
  pages: number | undefined,
  maxPercent: number,
): { maxPercent: number; maxPages: number | null } {
  return {
    maxPercent,
    maxPages: pages ? maxPreviewPages(pages, maxPercent) : null,
  };
}
