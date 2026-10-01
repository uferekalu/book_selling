import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectModel } from '@nestjs/mongoose';
import { Interval } from '@nestjs/schedule';
import type { Model } from 'mongoose';
import { JobLockService } from '../jobs/job-lock.service.js';
import { CloudinaryService } from '../uploads/cloudinary.service.js';
import { Author } from './schemas/author.schema.js';
import { Book } from './schemas/book.schema.js';

const HOUR_MS = 60 * 60 * 1000;
/** An upload not attached within a day was abandoned (the editor closed the tab or cancelled). */
export const ABANDONED_AFTER_MS = 24 * HOUR_MS;

/**
 * Deletes abandoned uploads (ARCHITECTURE §10.0, step 7). Every upload is tagged `pending` and the
 * tag is removed when it is attached. Before deleting, the database is checked too, so an asset
 * whose untagging failed after it was attached is kept (and untagged) rather than lost.
 */
@Injectable()
export class UploadCleanupJob {
  private readonly logger = new Logger(UploadCleanupJob.name);
  private readonly enabled: boolean;

  constructor(
    private readonly media: CloudinaryService,
    private readonly locks: JobLockService,
    @InjectModel(Book.name) private readonly books: Model<Book>,
    @InjectModel(Author.name) private readonly authors: Model<Author>,
    config: ConfigService,
  ) {
    this.enabled = config.get<string>('NODE_ENV') !== 'test';
  }

  @Interval('upload-cleanup', HOUR_MS)
  async tick(): Promise<void> {
    if (!this.enabled || !this.media.configured) return;
    await this.locks.runExclusive('upload-cleanup', 15 * 60_000, async () => {
      await this.run();
    });
  }

  /** Returns what it deleted and what it rescued. */
  async run(
    now: Date = new Date(),
  ): Promise<{ deleted: string[]; kept: string[] }> {
    const stale = await this.media.stalePendingAssets(
      new Date(now.getTime() - ABANDONED_AFTER_MS),
    );
    if (stale.length === 0) return { deleted: [], kept: [] };

    const referenced = await this.referenced(stale.map((a) => a.publicId));
    const deleted: string[] = [];
    const kept: string[] = [];
    for (const asset of stale) {
      try {
        if (referenced.has(asset.publicId)) {
          await this.media.markAttached(
            asset.deliveryType === 'authenticated' ? 'manuscript' : 'cover',
            asset.publicId,
          );
          kept.push(asset.publicId);
        } else {
          await this.media.destroyAsset(asset);
          deleted.push(asset.publicId);
        }
      } catch (error) {
        this.logger.warn(
          `Cleanup of ${asset.publicId} failed: ${(error as Error).message}`,
        );
      }
    }
    if (deleted.length || kept.length) {
      this.logger.log(
        `Upload cleanup: deleted ${deleted.length} abandoned upload(s), re-confirmed ${kept.length} attached one(s)`,
      );
    }
    return { deleted, kept };
  }

  private async referenced(publicIds: string[]): Promise<Set<string>> {
    const [books, authors] = await Promise.all([
      this.books
        .find(
          {
            $or: [
              { 'cover.publicId': { $in: publicIds } },
              { 'gallery.publicId': { $in: publicIds } },
              { 'manuscript.publicId': { $in: publicIds } },
            ],
          },
          {
            'cover.publicId': 1,
            'gallery.publicId': 1,
            'manuscript.publicId': 1,
          },
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
      if (book.manuscript?.publicId) ids.add(book.manuscript.publicId);
    }
    for (const author of authors) {
      if (author.photo?.publicId) ids.add(author.photo.publicId);
    }
    return ids;
  }
}
