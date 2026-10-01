import { ConfigModule } from '@nestjs/config';
import { MongooseModule, getModelToken } from '@nestjs/mongoose';
import { Test, type TestingModule } from '@nestjs/testing';
import type { MongoMemoryReplSet } from 'mongodb-memory-server';
import type { Model } from 'mongoose';
import { startMongo } from '../../test/mongo.js';
import { AuditLog, AuditModule } from '../audit/audit.module.js';
import type { AccessTokenPayload } from '../auth/interfaces/auth.types.js';
import {
  CloudinaryService,
  type PendingAsset,
  type UploadKind,
} from '../uploads/cloudinary.service.js';
import { AuthorsService } from './authors.service.js';
import { BooksService } from './books.service.js';
import { UploadCleanupJob } from './upload-cleanup.job.js';
import { CatalogModule } from './catalog.module.js';
import { CatalogQueryService } from './catalog-query.service.js';
import { CategoriesService } from './categories.service.js';
import type { FormatDto as FormatDtoClass } from './dto/catalog.dto.js';

/** Plain-object form of the DTO (spreading a class-typed value trips the linter). */
type FormatDto = { [K in keyof FormatDtoClass]: FormatDtoClass[K] };
import { Book } from './schemas/book.schema.js';

const admin: AccessTokenPayload = {
  sub: '64b000000000000000000001',
  email: 'a@x.com',
  role: 'admin',
  mfa: true,
  sid: 's',
  typ: 'access',
};

/** Stands in for Cloudinary: "uploads" are whatever ids the test passes, with fixed metadata. */
class FakeCloudinary {
  configured = true;
  cloudName = 'demo';
  destroyed: string[] = [];
  attached: string[] = [];
  verify(kind: UploadKind, ownerId: string, publicId: string) {
    const folder =
      kind === 'manuscript'
        ? `books/${ownerId}/manuscript`
        : `books/${ownerId}/images`;
    if (!publicId.startsWith(folder)) throw new Error('wrong folder');
    return Promise.resolve({
      publicId,
      version: 7,
      format: kind === 'manuscript' ? 'pdf' : 'jpg',
      bytes: 1000,
      width: 1600,
      height: 2400,
      pages: kind === 'manuscript' ? 312 : 1,
      etag: publicId.endsWith('v2') ? 'etag-2' : 'etag-1',
      dominantColor: '#5a3a22',
    });
  }
  markAttached(_kind: UploadKind, publicId: string) {
    this.attached.push(publicId);
    return Promise.resolve();
  }
  destroy(_kind: UploadKind, publicId: string) {
    this.destroyed.push(publicId);
    return Promise.resolve();
  }
  blurDataUrl() {
    return Promise.resolve(null);
  }
  stale: PendingAsset[] = [];
  stalePendingAssets() {
    return Promise.resolve(this.stale);
  }
  destroyAsset(asset: PendingAsset) {
    this.destroyed.push(asset.publicId);
    return Promise.resolve();
  }
  imageUrl(publicId: string, version: number) {
    return `https://res.cloudinary.com/demo/image/upload/v${version}/${publicId}`;
  }
}

const prices = (base: number) => [
  { currency: 'NGN' as const, amount: base * 1000 },
  { currency: 'USD' as const, amount: base },
  { currency: 'GBP' as const, amount: base - 400 },
  { currency: 'EUR' as const, amount: base - 200 },
];
const ebook = (base = 2500): FormatDto => ({
  type: 'ebook',
  active: true,
  prices: prices(base),
  ebook: { stampWithBuyer: true },
});
const print = (base = 3500, stock = 10): FormatDto => ({
  type: 'print',
  active: true,
  prices: prices(base),
  print: { stockOnHand: stock, weightGrams: 650 },
});

describe('Catalog (books, authors, categories, storefront queries)', () => {
  let mongod: MongoMemoryReplSet;
  let moduleRef: TestingModule;
  let books: BooksService;
  let authors: AuthorsService;
  let categories: CategoriesService;
  let query: CatalogQueryService;
  let bookModel: Model<Book>;
  let auditModel: Model<AuditLog>;
  let media: FakeCloudinary;

  beforeAll(async () => {
    mongod = await startMongo();
    media = new FakeCloudinary();
    moduleRef = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({
          isGlobal: true,
          ignoreEnvFile: true,
          load: [() => ({ FRONTEND_URL: 'https://books.example.com' })],
        }),
        MongooseModule.forRoot(mongod.getUri()),
        AuditModule,
        CatalogModule,
      ],
    })
      .overrideProvider(CloudinaryService)
      .useValue(media)
      .compile();
    books = moduleRef.get(BooksService);
    authors = moduleRef.get(AuthorsService);
    categories = moduleRef.get(CategoriesService);
    query = moduleRef.get(CatalogQueryService);
    bookModel = moduleRef.get(getModelToken(Book.name));
    auditModel = moduleRef.get(getModelToken(AuditLog.name));
    await bookModel.syncIndexes();
  }, 90_000);

  afterAll(async () => {
    await moduleRef?.close();
    await mongod?.stop();
  });

  beforeEach(async () => {
    const collections = await bookModel.db.listCollections();
    await Promise.all(
      collections
        .filter((c) => c.name !== 'system.views')
        .map((c) => bookModel.db.collection(c.name).deleteMany({})),
    );
    media.destroyed = [];
    media.attached = [];
  });

  /** A complete, publishable book. */
  async function readyBook(
    title = 'Principles of Foundry Technology',
    base = 2500,
    categoryIds: string[] = [],
  ) {
    const author =
      (await authors.list())[0] ??
      (await authors.create(
        { name: 'Prof. A. Author', title: 'Foundry lecturer' },
        admin,
      ));
    const book = await books.create(title, admin);
    const id = book._id.toString();
    await books.update(
      id,
      {
        authorIds: [author._id.toString()],
        categoryIds,
        abstractMarkdown:
          'A practical guide to moulding, melting and casting sound metal parts, with worked examples from real foundries.',
        descriptionMarkdown:
          'For students and **practising** foundry engineers.',
      },
      admin,
    );
    await books.setFormats(id, [ebook(base), print(base + 1000)], admin);
    await books.attachCover(
      id,
      {
        publicId: `books/${id}/images/cover`,
        crop: { x: 0, y: 0, width: 1600, height: 2400 },
      },
      admin,
    );
    await books.attachManuscript(
      id,
      { publicId: `books/${id}/manuscript/file` },
      admin,
    );
    await bookModel.updateOne({ _id: book._id }, { 'preview.enabled': true }); // BS-6 builds this
    return books.publish(id, admin);
  }

  describe('admin: books', () => {
    it('creates drafts with unique, URL-safe slugs', async () => {
      const a = await books.create('Heat Treatment of Steels', admin);
      const b = await books.create('Heat Treatment of Steels', admin);
      expect([a.slug, b.slug]).toEqual([
        'heat-treatment-of-steels',
        'heat-treatment-of-steels-2',
      ]);
      expect(a.status).toBe('draft');
    });

    it('sanitises Markdown, validates ISBN-13 and rejects unknown authors', async () => {
      const book = await books.create('Casting Defects', admin);
      const id = book._id.toString();
      const updated = await books.update(
        id,
        {
          abstractMarkdown: 'Real **text**<script>alert(1)</script>',
          isbn13: '978-0-306-40615-7',
        },
        admin,
      );
      expect(updated.abstractHtml).toBe('<p>Real <strong>text</strong></p>');
      expect(updated.isbn13).toBe('9780306406157');
      await expect(
        books.update(id, { isbn13: '978-0-306-40615-8' }, admin),
      ).rejects.toThrow(/ISBN-13 is not valid/);
      await expect(
        books.update(id, { authorIds: ['64b0000000000000000000ff'] }, admin),
      ).rejects.toThrow(/Unknown author/);
    });

    it('keeps SKUs stable, computes "from" prices and protects reserved stock', async () => {
      const book = await books.create('Furnaces and Melting Practice', admin);
      const id = book._id.toString();
      const first = await books.setFormats(
        id,
        [ebook(2000), print(3000, 5)],
        admin,
      );
      const skus = first.formats.map((f) => f.sku);
      expect(first.fromPrices).toEqual({
        NGN: 2_000_000,
        USD: 2000,
        GBP: 1600,
        EUR: 1800,
      });

      await bookModel.updateOne(
        { _id: book._id, 'formats.type': 'print' },
        { $set: { 'formats.$.print.stockReserved': 3 } },
      );
      await expect(
        books.setFormats(id, [ebook(2000), print(3000, 2)], admin),
      ).rejects.toThrow(/held by unpaid orders/);
      const again = await books.setFormats(
        id,
        [print(3000, 8), ebook(2100)],
        admin,
      );
      expect(again.formats.map((f) => f.sku).sort()).toEqual([...skus].sort());
      expect(
        again.formats.find((f) => f.type === 'print')?.print?.stockReserved,
      ).toBe(3);
    });

    it('rejects duplicate formats or currencies', async () => {
      const id = (
        await books.create('Non-Ferrous Casting', admin)
      )._id.toString();
      await expect(
        books.setFormats(id, [ebook(), ebook()], admin),
      ).rejects.toThrow(/only once/);
      const dup = {
        ...ebook(),
        prices: [...prices(2000), { currency: 'USD' as const, amount: 1 }],
      };
      await expect(books.setFormats(id, [dup], admin)).rejects.toThrow(
        /only one price/,
      );
    });

    it('only accepts covers from this book\x27s own upload folder and a 2:3 crop', async () => {
      const id = (await books.create('Sand Moulding', admin))._id.toString();
      await expect(
        books.attachCover(
          id,
          { publicId: 'books/someone-else/images/x' },
          admin,
        ),
      ).rejects.toThrow();
      await expect(
        books.attachCover(
          id,
          {
            publicId: `books/${id}/images/c`,
            crop: { x: 0, y: 0, width: 1600, height: 1600 },
          },
          admin,
        ),
      ).rejects.toThrow(/2:3/);
      await books.attachCover(id, { publicId: `books/${id}/images/c1` }, admin);
      await books.attachCover(id, { publicId: `books/${id}/images/c2` }, admin);
      expect(media.destroyed).toEqual([`books/${id}/images/c1`]);
      expect(media.attached).toContain(`books/${id}/images/c2`);
    });

    it('turns off the preview when a different manuscript replaces the old one', async () => {
      const book = await readyBook();
      const id = book._id.toString();
      const replaced = await books.attachManuscript(
        id,
        { publicId: `books/${id}/manuscript/v2` },
        admin,
      );
      expect(replaced.preview.enabled).toBe(false);
      expect(replaced.manuscript?.pages).toBe(312);
    });

    it('publishes only when the checklist passes, with every problem listed', async () => {
      const id = (
        await books.create('Ferrous Foundry Practice', admin)
      )._id.toString();
      const error = (await books
        .publish(id, admin)
        .catch((e: { getResponse(): { problems: string[] } }) =>
          e.getResponse(),
        )) as { problems: string[] };
      expect(error.problems).toEqual(
        expect.arrayContaining([
          'Upload a cover image',
          'Upload the book PDF (the manuscript)',
        ]),
      );
      const book = await readyBook('Solidification and Casting', 2000);
      expect(book.status).toBe('published');
      expect(book.listedAt).toBeInstanceOf(Date);
    });

    it('keeps an old address working after a published book is renamed', async () => {
      const book = await readyBook('Heat Treatment of Steels');
      await books.update(
        book._id.toString(),
        { slug: 'heat-treatment-of-steels-2nd-edition' },
        admin,
      );
      expect(await query.bySlug('heat-treatment-of-steels', 'USD')).toEqual({
        redirectTo: 'heat-treatment-of-steels-2nd-edition',
      });
      const other = await books.create('Another', admin);
      await expect(
        books.update(
          other._id.toString(),
          { slug: 'heat-treatment-of-steels' },
          admin,
        ),
      ).rejects.toThrow(/already uses/);
    });

    it('deletes only never-published drafts; published books are archived instead', async () => {
      const draft = await books.create('Draft', admin);
      await books.remove(draft._id.toString(), admin);
      const published = await readyBook();
      await expect(
        books.remove(published._id.toString(), admin),
      ).rejects.toThrow(/Archive it instead/);
      await books.archive(published._id.toString(), admin);
      await expect(query.bySlug(published.slug, 'USD')).rejects.toThrow(
        /not found/,
      );
    });

    it('audits every change, including prices', async () => {
      await readyBook();
      const actions = (await auditModel.find().lean()).map((a) => a.action);
      expect(actions).toEqual(
        expect.arrayContaining([
          'book.created',
          'book.updated',
          'book.formats_changed',
          'book.cover_changed',
          'book.manuscript_changed',
          'book.published',
        ]),
      );
    });
  });

  describe('admin: authors and categories', () => {
    it('refuses to delete an author or category still used by a book', async () => {
      const category = await categories.create(
        { name: 'Heat Treatment' },
        admin,
      );
      await readyBook('Hardening and Tempering', 2500, [
        category._id.toString(),
      ]);
      const [author] = await authors.list();
      await expect(
        authors.remove(author._id.toString(), admin),
      ).rejects.toThrow(/on at least one book/);
      await expect(
        categories.remove(category._id.toString(), admin),
      ).rejects.toThrow(/Move them/);
    });

    it('renders author bios safely', async () => {
      const author = await authors.create(
        {
          name: 'Prof. B',
          bioMarkdown: 'Teaches **foundry**. <img src=x onerror=1>',
        },
        admin,
      );
      expect(author.bioHtml).toBe('<p>Teaches <strong>foundry</strong>. </p>');
    });
  });

  describe('storefront queries', () => {
    it('shows only published books, priced in the requested currency', async () => {
      await books.create('Unpublished Draft', admin);
      await readyBook('Principles of Foundry Technology', 2500);
      const page = await query.list({ currency: 'GBP' });
      expect(page.total).toBe(1);
      expect(page.items[0]).toMatchObject({
        title: 'Principles of Foundry Technology',
        fromPrice: { amount: 2100, currency: 'GBP' },
        priceIsFrom: true,
        formats: ['ebook', 'print'],
      });
    });

    it('filters by category, format and price range, and sorts by price', async () => {
      const heat = await categories.create({ name: 'Heat Treatment' }, admin);
      await readyBook('Annealing, Quenching and Tempering', 1500, [
        heat._id.toString(),
      ]);
      await readyBook('Principles of Foundry Technology', 3000);
      await readyBook('Casting Defects', 2000);

      expect(
        (await query.list({ category: heat.slug })).items.map((b) => b.title),
      ).toEqual(['Annealing, Quenching and Tempering']);
      expect((await query.list({ category: 'no-such' })).total).toBe(0);
      expect(
        (
          await query.list({ currency: 'USD', minPrice: 1800, maxPrice: 2500 })
        ).items.map((b) => b.title),
      ).toEqual(['Casting Defects']);
      expect(
        (await query.list({ currency: 'USD', sort: 'price_asc' })).items.map(
          (b) => b.fromPrice?.amount,
        ),
      ).toEqual([1500, 2000, 3000]);
      expect((await query.list({ format: 'print' })).total).toBe(3);
    });

    it('finds books by text search, ranking title matches first', async () => {
      await readyBook('Heat Treatment of Steels');
      await readyBook('Principles of Foundry Technology');
      const result = await query.list({ q: 'heat treatment' });
      expect(result.items[0].title).toBe('Heat Treatment of Steels');
    });

    it('reports print stock without exposing exact numbers above the low-stock line', async () => {
      const book = await readyBook();
      await bookModel.updateOne(
        { _id: book._id, 'formats.type': 'print' },
        { $set: { 'formats.$.print.stockOnHand': 2 } },
      );
      const lookup = await query.bySlug(book.slug, 'NGN');
      if (!('book' in lookup)) throw new Error('expected a book');
      const printFormat = lookup.book.formatDetails.find(
        (f) => f.type === 'print',
      );
      expect(printFormat).toMatchObject({
        stock: 'low_stock',
        stockLeft: 2,
        available: true,
      });
      expect(lookup.book).not.toHaveProperty('manuscript');
    });

    it('suggests related books without the book itself, and counts only published books per category', async () => {
      const cat = await categories.create({ name: 'Metal Casting' }, admin);
      await categories.create({ name: 'Empty Category' }, admin);
      const a = await readyBook('Sand Casting', 2000, [cat._id.toString()]);
      await readyBook('Die Casting', 2200, [cat._id.toString()]);
      await readyBook('Investment Casting', 2400);
      const related = await query.related(a.slug, 'USD');
      expect(related.map((b) => b.title)).not.toContain('Sand Casting');
      expect(related[0].title).toBe('Die Casting');
      expect(await query.categoriesWithCounts()).toEqual([
        expect.objectContaining({ name: 'Metal Casting', bookCount: 2 }),
      ]);
    });
  });

  describe('abandoned upload cleanup', () => {
    it('deletes stale pending uploads but keeps (and re-confirms) anything attached', async () => {
      const id = (
        await books.create('Ferrous Foundry Practice', admin)
      )._id.toString();
      const cover = `books/${id}/images/attached`;
      await books.attachCover(id, { publicId: cover }, admin);
      media.attached = [];
      media.destroyed = [];
      media.stale = [
        { publicId: cover, deliveryType: 'upload' },
        { publicId: `books/${id}/images/abandoned`, deliveryType: 'upload' },
        {
          publicId: `books/${id}/manuscript/abandoned`,
          deliveryType: 'authenticated',
        },
      ];

      const result = await moduleRef.get(UploadCleanupJob).run();

      expect(result.kept).toEqual([cover]);
      expect(result.deleted).toEqual([
        `books/${id}/images/abandoned`,
        `books/${id}/manuscript/abandoned`,
      ]);
      expect(media.destroyed).not.toContain(cover);
      expect(media.attached).toEqual([cover]);
    });
  });
});
