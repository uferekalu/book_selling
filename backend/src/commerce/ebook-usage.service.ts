import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import type { Model } from 'mongoose';
import { Book } from '../catalog/schemas/book.schema.js';
import { ReadingProgress } from '../library/schemas/reading-progress.schema.js';
import { Entitlement } from './schemas/entitlement.schema.js';
import type { OrderDocument } from './schemas/order.schema.js';

export interface EbookUsage {
  bookId: string;
  title: string;
  downloads: number;
  lastDownloadedAt: string | null;
  firstOpenedAt: string | null;
  /** Furthest PDF page the buyer reached in the online reader. */
  furthestPage: number | null;
  /** Last PDF page of the free preview: reading past it counts as "read beyond the preview". */
  previewEndsAt: number | null;
  readBeyondPreview: boolean;
  removed: boolean;
}

/**
 * What a buyer did with the ebooks of an order, for staff deciding a refund (PRODUCT_RULES §9:
 * ebooks are refundable within 7 days if not downloaded or read beyond the preview).
 */
@Injectable()
export class EbookUsageService {
  constructor(
    @InjectModel(Entitlement.name)
    private readonly entitlements: Model<Entitlement>,
    @InjectModel(ReadingProgress.name)
    private readonly progress: Model<ReadingProgress>,
    @InjectModel(Book.name) private readonly books: Model<Book>,
  ) {}

  async forOrder(order: OrderDocument): Promise<EbookUsage[]> {
    const ebooks = order.items.filter((i) => i.format === 'ebook');
    if (ebooks.length === 0) return [];
    const bookIds = ebooks.map((i) => i.bookId);
    const [entitlements, progress, books] = await Promise.all([
      this.entitlements
        .find({ orderId: order._id, bookId: { $in: bookIds } })
        .lean()
        .exec(),
      this.progress
        .find({ userId: order.userId, bookId: { $in: bookIds } })
        .lean()
        .exec(),
      this.books
        .find({ _id: { $in: bookIds } }, { 'preview.pageMap': 1 })
        .lean()
        .exec(),
    ]);
    return ebooks.map((item) => {
      const id = item.bookId.toString();
      const entitlement = entitlements.find((e) => e.bookId.toString() === id);
      const read = progress.find((p) => p.bookId.toString() === id);
      const previewEndsAt =
        books.find((b) => b._id.toString() === id)?.preview?.pageMap?.at(-1) ??
        null;
      const furthestPage = read?.maxPage ?? null;
      return {
        bookId: id,
        title: item.titleSnapshot,
        downloads: entitlement?.downloadCount ?? 0,
        lastDownloadedAt: entitlement?.lastDownloadedAt?.toISOString() ?? null,
        firstOpenedAt: entitlement?.firstOpenedAt?.toISOString() ?? null,
        furthestPage,
        previewEndsAt,
        readBeyondPreview:
          furthestPage !== null && furthestPage > (previewEndsAt ?? 0),
        removed: Boolean(entitlement?.revokedAt),
      };
    });
  }
}
