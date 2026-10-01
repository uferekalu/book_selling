import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Types, type HydratedDocument } from 'mongoose';
import { CURRENCIES, type Currency } from '../../common/money/currency.js';
import {
  Manuscript,
  ManuscriptSchema,
  StoredImage,
  StoredImageSchema,
} from './image.schema.js';

export const BOOK_STATUSES = ['draft', 'published', 'archived'] as const;
export type BookStatus = (typeof BOOK_STATUSES)[number];

export const FORMAT_TYPES = ['ebook', 'print'] as const;
export type FormatType = (typeof FORMAT_TYPES)[number];

@Schema({ _id: false })
export class Price {
  @Prop({ type: String, enum: CURRENCIES, required: true }) currency: Currency;
  /** Integer minor units (ARCHITECTURE §8.1). */
  @Prop({ type: Number, required: true, min: 1 }) amount: number;
}
const PriceSchema = SchemaFactory.createForClass(Price);

@Schema({ _id: false })
export class EbookOptions {
  /** Footer "Licensed to <buyer>" on every page of the downloaded copy (BS-9). */
  @Prop({ type: Boolean, default: true }) stampWithBuyer: boolean;
}
const EbookOptionsSchema = SchemaFactory.createForClass(EbookOptions);

@Schema({ _id: false })
export class PrintOptions {
  @Prop({ type: Number, default: 0, min: 0 }) stockOnHand: number;
  /** Held by unpaid orders (BS-7). Changed only by conditional atomic updates. */
  @Prop({ type: Number, default: 0, min: 0 }) stockReserved: number;
  @Prop({ type: Number, default: 0, min: 0 }) weightGrams: number;
  @Prop({ type: Number, default: 5, min: 1, max: 50 }) maxPerOrder: number;
}
const PrintOptionsSchema = SchemaFactory.createForClass(PrintOptions);

@Schema({ _id: false })
export class BookFormat {
  @Prop({ type: String, enum: FORMAT_TYPES, required: true }) type: FormatType;
  @Prop({ type: String, required: true }) sku: string;
  @Prop({ type: Boolean, default: true }) active: boolean;
  @Prop({ type: [PriceSchema], default: [] }) prices: Price[];
  /** Optional "was" prices for a sale, per currency. */
  @Prop({ type: [PriceSchema], default: [] }) compareAtPrices: Price[];
  @Prop({ type: EbookOptionsSchema, default: null }) ebook: EbookOptions | null;
  @Prop({ type: PrintOptionsSchema, default: null }) print: PrintOptions | null;
}
const BookFormatSchema = SchemaFactory.createForClass(BookFormat);

@Schema({ _id: false })
export class TocEntry {
  @Prop({ type: String, required: true, trim: true, maxlength: 200 })
  title: string;
  @Prop({ type: Number, default: null }) page: number | null;
  @Prop({ type: [{ title: String, page: Number }], default: [] })
  children: Array<{ title: string; page: number | null }>;
}
const TocEntrySchema = SchemaFactory.createForClass(TocEntry);

@Schema({ _id: false })
export class Seo {
  @Prop({ type: String, default: '', maxlength: 70 }) title: string;
  @Prop({ type: String, default: '', maxlength: 170 }) description: string;
}
const SeoSchema = SchemaFactory.createForClass(Seo);

/** BS-6 fills this in (server-generated preview PDF). Present now so publishing can require it. */
@Schema({ _id: false })
export class Preview {
  @Prop({ type: Boolean, default: false }) enabled: boolean;
}
const PreviewSchema = SchemaFactory.createForClass(Preview);

@Schema({ collection: 'books', timestamps: true })
export class Book {
  @Prop({ type: String, required: true, trim: true, maxlength: 200 })
  title: string;
  @Prop({ type: String, default: '', trim: true, maxlength: 240 })
  subtitle: string;
  /** Stable URL part. Renaming keeps old slugs in `previousSlugs`, which redirect. */
  @Prop({ type: String, required: true, unique: true }) slug: string;
  @Prop({ type: [String], default: [], index: true }) previousSlugs: string[];
  @Prop({ type: [Types.ObjectId], default: [], index: true })
  authorIds: Types.ObjectId[];
  @Prop({ type: [Types.ObjectId], default: [], index: true })
  categoryIds: Types.ObjectId[];

  @Prop({ type: String, default: '' }) descriptionMarkdown: string;
  @Prop({ type: String, default: '' }) descriptionHtml: string;
  @Prop({ type: String, default: '' }) abstractMarkdown: string;
  @Prop({ type: String, default: '' }) abstractHtml: string;
  @Prop({ type: [TocEntrySchema], default: [] }) tableOfContents: TocEntry[];

  @Prop({ type: String, default: null }) isbn13: string | null;
  @Prop({ type: String, default: '', maxlength: 40 }) edition: string;
  @Prop({ type: Date, default: null }) publicationDate: Date | null;
  @Prop({ type: Number, default: null, min: 1 }) pageCount: number | null;
  @Prop({ type: String, default: 'en' }) language: string;

  @Prop({ type: StoredImageSchema, default: null }) cover: StoredImage | null;
  @Prop({ type: [StoredImageSchema], default: [] }) gallery: StoredImage[];
  @Prop({ type: ManuscriptSchema, default: null })
  manuscript: Manuscript | null;
  @Prop({ type: PreviewSchema, default: () => ({}) }) preview: Preview;

  @Prop({ type: [BookFormatSchema], default: [] }) formats: BookFormat[];
  /**
   * Lowest active price per currency, kept in sync on every save. Powers "From ₦…" labels and
   * indexed price sorting/filtering without unwinding formats.
   */
  @Prop({ type: Object, default: {} }) fromPrices: Partial<
    Record<Currency, number>
  >;

  @Prop({ type: String, enum: BOOK_STATUSES, default: 'draft' })
  status: BookStatus;
  /** When it first went on sale (sorting "newest"). */
  @Prop({ type: Date, default: null }) listedAt: Date | null;
  @Prop({ type: Boolean, default: false }) featured: boolean;

  @Prop({ type: [String], default: [] }) tags: string[];
  @Prop({ type: SeoSchema, default: () => ({}) }) seo: Seo;

  @Prop({ type: Number, default: 0, min: 0, max: 5 }) ratingAvg: number;
  @Prop({ type: Number, default: 0, min: 0 }) ratingCount: number;
  @Prop({ type: Number, default: 0, min: 0 }) salesCount: number;
}

export type BookDocument = HydratedDocument<Book>;
export const BookSchema = SchemaFactory.createForClass(Book);

BookSchema.index({ status: 1, listedAt: -1 });
BookSchema.index({ status: 1, featured: -1, listedAt: -1 });
for (const currency of CURRENCIES)
  BookSchema.index({ status: 1, [`fromPrices.${currency}`]: 1 });
BookSchema.index(
  { 'formats.sku': 1 },
  {
    unique: true,
    partialFilterExpression: { 'formats.sku': { $type: 'string' } },
  },
);
BookSchema.index(
  {
    title: 'text',
    subtitle: 'text',
    tags: 'text',
    descriptionMarkdown: 'text',
    abstractMarkdown: 'text',
  },
  {
    weights: {
      title: 10,
      subtitle: 5,
      tags: 4,
      abstractMarkdown: 2,
      descriptionMarkdown: 1,
    },
    name: 'book_search',
  },
);

/** Recomputes `fromPrices` from active formats. Called before every save. */
export function computeFromPrices(
  formats: BookFormat[],
): Partial<Record<Currency, number>> {
  const result: Partial<Record<Currency, number>> = {};
  for (const format of formats) {
    if (!format.active) continue;
    for (const price of format.prices) {
      const current = result[price.currency];
      if (current === undefined || price.amount < current)
        result[price.currency] = price.amount;
    }
  }
  return result;
}

BookSchema.pre('save', function syncFromPrices() {
  this.fromPrices = computeFromPrices(this.formats);
});
