import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectModel } from '@nestjs/mongoose';
import { Interval } from '@nestjs/schedule';
import type { Model } from 'mongoose';
import { JobLockService } from '../jobs/job-lock.service.js';
import { BookFilesService } from '../uploads/book-files.service.js';
import { CloudinaryService } from '../uploads/cloudinary.service.js';
import { Author } from './schemas/author.schema.js';
import { Book } from './schemas/book.schema.js';
import { ManuscriptUpload } from './schemas/manuscript-upload.schema.js';

const HOUR_MS = 60 * 60 * 1000;
/** An upload not attached within a day was abandoned (the editor closed the tab or cancelled). */
export const ABANDONED_AFTER_MS = 24 * HOUR_MS;
const MANUSCRIPT_BATCH = 200;

export interface CleanupResult {
  deleted: string[];
  kept: string[];
}

/**
 * Deletes abandoned uploads (ARCHITECTURE §10.0, step 7), in both stores:
 * - Cloudinary images are tagged `pending` until attached.
 * - R2 book files have a `manuscript_uploads` record until attached.
 * Before deleting, the books are checked too, so a file whose bookkeeping failed after it was
 * attached is kept (and its bookkeeping fixed) rather than lost.
 */
@Injectable()
export class UploadCleanupJob {
  private readonly logger = new Logger(UploadCleanupJob.name);
  private readonly enabled: boolean;

  constructor(
    private readonly media: CloudinaryService,
    private readonly files: BookFilesService,
    private readonly locks: JobLockService,
    @InjectModel(Book.name) private readonly books: Model<Book>,
    @InjectModel(Author.name) private readonly authors: Model<Author>,
    @InjectModel(ManuscriptUpload.name)
    private readonly uploads: Model<ManuscriptUpload>,
    config: ConfigService,
  ) {
    this.enabled = config.get<string>('NODE_ENV') !== 'test';
  }

  @Interval('upload-cleanup', HOUR_MS)
  async tick(): Promise<void> {
    if (!this.enabled) return;
    await this.locks.runExclusive('upload-cleanup', 15 * 60_000, async () => {
      await this.run();
    });
  }

  /** Returns what it deleted and what it rescued. */
  async run(now: Date = new Date()): Promise<CleanupResult> {
    const olderThan = new Date(now.getTime() - ABANDONED_AFTER_MS);
    const images = this.media.configured
      ? await this.cleanImages(olderThan)
      : { deleted: [], kept: [] };
    const manuscripts = this.files.configured
      ? await this.cleanManuscripts(olderThan)
      : { deleted: [], kept: [] };
    const result = {
      deleted: [...images.deleted, ...manuscripts.deleted],
      kept: [...images.kept, ...manuscripts.kept],
    };
    if (result.deleted.length || result.kept.length) {
      this.logger.log(
        `Upload cleanup: deleted ${result.deleted.length} abandoned upload(s), re-confirmed ${result.kept.length} attached one(s)`,
      );
    }
    return result;
  }

  private async cleanImages(olderThan: Date): Promise<CleanupResult> {
    const stale = await this.media.stalePendingAssets(olderThan);
    if (stale.length === 0) return { deleted: [], kept: [] };
    const referenced = await this.referencedImages(stale);
    const deleted: string[] = [];
    const kept: string[] = [];
    for (const publicId of stale) {
      try {
        if (referenced.has(publicId)) {
          await this.media.markAttached(publicId);
          kept.push(publicId);
        } else {
          await this.media.destroyStrict(publicId);
          deleted.push(publicId);
        }
      } catch (error) {
        this.logger.warn(
          `Cleanup of ${publicId} failed: ${(error as Error).message}`,
        );
      }
    }
    return { deleted, kept };
  }

  private async cleanManuscripts(olderThan: Date): Promise<CleanupResult> {
    const stale = await this.uploads
      .find({ createdAt: { $lt: olderThan } })
      .sort({ createdAt: 1 })
      .limit(MANUSCRIPT_BATCH)
      .lean()
      .exec();
    if (stale.length === 0) return { deleted: [], kept: [] };
    const keys = stale.map((u) => u.key);
    const books = await this.books
      .find(
        {
          $or: [
            { 'manuscript.key': { $in: keys } },
            { 'previousManuscripts.key': { $in: keys } },
          ],
        },
        { 'manuscript.key': 1, 'previousManuscripts.key': 1 },
      )
      .lean()
      .exec();
    const referenced = new Set<string>();
    for (const book of books) {
      if (book.manuscript?.key) referenced.add(book.manuscript.key);
      for (const file of book.previousManuscripts ?? [])
        referenced.add(file.key);
    }

    const deleted: string[] = [];
    const kept: string[] = [];
    for (const upload of stale) {
      try {
        if (referenced.has(upload.key)) {
          kept.push(upload.key);
        } else {
          await this.files.abortUpload(upload.key, upload.uploadId, {
            strict: true,
          });
          await this.files.delete(upload.key, { strict: true });
          deleted.push(upload.key);
        }
        await this.uploads.deleteOne({ _id: upload._id }).exec();
      } catch (error) {
        this.logger.warn(
          `Cleanup of ${upload.key} failed: ${(error as Error).message}`,
        );
      }
    }
    return { deleted, kept };
  }

  private async referencedImages(publicIds: string[]): Promise<Set<string>> {
    const [books, authors] = await Promise.all([
      this.books
        .find(
          {
            $or: [
              { 'cover.publicId': { $in: publicIds } },
              { 'gallery.publicId': { $in: publicIds } },
            ],
          },
          { 'cover.publicId': 1, 'gallery.publicId': 1 },
        )
        .lean()
        .exec(),
      this.authors
        .find({ 'photo.publicId': { $in: publicIds } }, { 'photo.publicId': 1 })
        .lean()
        .exec(),
    ]);
    const ids = new Set<string>();
    for (const book of books) {
      if (book.cover?.publicId) ids.add(book.cover.publicId);
      for (const image of book.gallery ?? []) ids.add(image.publicId);
    }
    for (const author of authors) {
      if (author.photo?.publicId) ids.add(author.photo.publicId);
    }
    return ids;
  }
}
