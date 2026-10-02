import { ConfigModule } from '@nestjs/config';
import { MongooseModule, getModelToken } from '@nestjs/mongoose';
import { Test, type TestingModule } from '@nestjs/testing';
import type { MongoMemoryReplSet } from 'mongodb-memory-server';
import { Types, type Model } from 'mongoose';
import { startMongo } from '../../test/mongo.js';
import { AuditLog, AuditModule } from '../audit/audit.module.js';
import type { AccessTokenPayload } from '../auth/interfaces/auth.types.js';
import { FakeBookFiles, manuscriptPdf } from '../../test/fake-book-files.js';
import { BookFilesService } from '../uploads/book-files.service.js';
import {
  CloudinaryService,
  type UploadKind,
} from '../uploads/cloudinary.service.js';
import { AuthorsService } from './authors.service.js';
import { BooksService } from './books.service.js';
import { ManuscriptsService } from './manuscripts.service.js';
import { ManuscriptUpload } from './schemas/manuscript-upload.schema.js';
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
  verify(_kind: UploadKind, ownerId: string, publicId: string) {
    if (!publicId.startsWith(`books/${ownerId}/images`))
      throw new Error('wrong folder');
    return Promise.resolve({
      publicId,
      version: 7,
      format: 'jpg',
      bytes: 1000,
      width: 1600,
      height: 2400,
      dominantColor: '#5a3a22',
    });
  }
  markAttached(publicId: string) {
    this.attached.push(publicId);
    return Promise.resolve();
  }
  destroy(publicId: string) {
    this.destroyed.push(publicId);
    return Promise.resolve();
  }
  blurDataUrl() {
    return Promise.resolve(null);
  }
  stale: string[] = [];
  stalePendingAssets() {
    return Promise.resolve(this.stale);
  }
  destroyStrict(publicId: string) {
    this.destroyed.push(publicId);
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
  let files: FakeBookFiles;
  let manuscripts: ManuscriptsService;
  let uploadModel: Model<ManuscriptUpload>;
  let bookPdf: Uint8Array;

  beforeAll(async () => {
    mongod = await startMongo();
    media = new FakeCloudinary();
    files = new FakeBookFiles(1);
    bookPdf = await manuscriptPdf(40);
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
      .overrideProvider(BookFilesService)
      .useValue(files)
      .compile();
    manuscripts = moduleRef.get(ManuscriptsService);
    uploadModel = moduleRef.get(getModelToken(ManuscriptUpload.name));
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
    files.objects.clear();
    files.multipart.clear();
    files.storageLimitBytes = null;
    files.deleted = [];
    files.aborted = [];
  });

  /** Uploads `pdf` the way the editor's browser does and attaches it. */
  async function attachPdf(id: string, pdf: Uint8Array = bookPdf) {
    const key = await files.upload(manuscripts, id, pdf, admin);
    return { key, book: await books.attachManuscript(id, { key }, admin) };
  }

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
    await attachPdf(id);
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

    it('queues a preview rebuild when a different manuscript replaces the old one, still serving the current preview', async () => {
      const book = await readyBook();
      const id = book._id.toString();
      await bookModel.updateOne(
        { _id: book._id },
        {
          'preview.sections': [{ label: 'Intro', fromPage: 1, toPage: 2 }],
          'preview.status': 'ready',
        },
      );
      const before = (await bookModel.findById(book._id).lean())!.manuscript!;
      const { book: replaced } = await attachPdf(id, await manuscriptPdf(41));
      expect(replaced.preview.status).toBe('queued');
      expect(replaced.preview.enabled).toBe(true);
      expect(replaced.manuscript?.pages).toBe(41);
      // It was on sale: buyers' copies came from the old file, so it is kept (BS-9).
      expect(replaced.previousManuscripts.map((m) => m.key)).toEqual([
        before.key,
      ]);
      expect(files.objects.has(before.key)).toBe(true);
      expect(await uploadModel.countDocuments()).toBe(0);
    });

    it('emails current owners about an updated edition only when asked, once per edition', async () => {
      const book = await readyBook();
      const id = book._id.toString();
      const db = bookModel.db;
      const users = await db.collection('users').insertMany([
        { email: 'owner1@example.com', name: 'Ada Okafor' },
        { email: 'owner2@example.com', name: 'Bayo Ade' },
        { email: 'refunded@example.com', name: 'Chi Eze' },
      ]);
      const ids = Object.values(users.insertedIds);
      await db.collection('entitlements').insertMany(
        ids.map((userId, i) => ({
          userId,
          bookId: book._id,
          orderId: new Types.ObjectId(),
          grantedAt: new Date(),
          revokedAt: i === 2 ? new Date() : null,
        })),
      );
      const outbox = () =>
        db
          .collection('email_outbox')
          .find({ template: 'library.edition-updated' })
          .toArray();

      // A replacement without the box ticked: nobody is emailed.
      await attachPdf(id, await manuscriptPdf(41));
      expect(await outbox()).toHaveLength(0);

      const key = await files.upload(
        manuscripts,
        id,
        await manuscriptPdf(42),
        admin,
      );
      await books.attachManuscript(id, { key, notifyBuyers: true }, admin);
      const sent = await outbox();
      expect(sent.map((e) => e.to).sort((a, b) => a.localeCompare(b))).toEqual([
        'owner1@example.com',
        'owner2@example.com',
      ]);
      expect(sent[0].data).toMatchObject({
        title: book.title,
        libraryUrl: 'https://books.example.com/account/library',
      });
    });

    describe('book file (R2) uploads', () => {
      it('replacing a never-sold draft file deletes the old one; the same file again changes nothing', async () => {
        const id = (await books.create('Sand Moulding', admin))._id.toString();
        const first = await attachPdf(id);
        expect(first.book.manuscript).toMatchObject({
          key: first.key,
          pages: 40,
          bytes: bookPdf.length,
        });
        expect(first.book.manuscript!.checksum).toMatch(/^[a-f0-9]{64}$/);
        expect(first.book.pageCount).toBe(40);

        // Identical content: the new upload is discarded and the book is untouched.
        const again = await attachPdf(id);
        expect(again.book.manuscript!.key).toBe(first.key);
        expect(files.objects.has(again.key)).toBe(false);

        const second = await attachPdf(id, await manuscriptPdf(12));
        expect(second.book.manuscript!.pages).toBe(12);
        expect(second.book.previousManuscripts).toEqual([]);
        expect(files.objects.has(first.key)).toBe(false);
        expect(await uploadModel.countDocuments()).toBe(0);
      });

      it('refuses a key that was not uploaded for this book', async () => {
        const a = (await books.create('Book A', admin))._id.toString();
        const b = (await books.create('Book B', admin))._id.toString();
        const key = await files.upload(manuscripts, a, bookPdf, admin);
        await expect(books.attachManuscript(b, { key }, admin)).rejects.toThrow(
          /not uploaded for this book/,
        );
        await expect(
          books.attachManuscript(
            a,
            { key: `${files.manuscriptPrefix(a)}../../other.pdf` },
            admin,
          ),
        ).rejects.toThrow(/not uploaded for this book/);
        // Signing parts for another book's upload is refused too.
        const started = await manuscripts.start(a, 100, admin);
        await expect(
          manuscripts.signParts(b, started.key, started.uploadId, [1]),
        ).rejects.toThrow(/another book/);
        await expect(
          manuscripts.signParts(a, started.key, started.uploadId, [2]),
        ).rejects.toThrow(/numbered 1 to 1/);
      });

      it('refuses a file that is not a readable PDF, and deletes it', async () => {
        const id = (await books.create('Sand Moulding', admin))._id.toString();
        const fake = new TextEncoder().encode('Hello, not a PDF at all');
        const key = await files.upload(manuscripts, id, fake, admin);
        await expect(
          books.attachManuscript(id, { key }, admin),
        ).rejects.toThrow(/Upload a PDF file/);
        expect(files.objects.has(key)).toBe(false);

        const broken = new TextEncoder().encode('%PDF-1.7 truncated');
        const brokenKey = await files.upload(manuscripts, id, broken, admin);
        await expect(
          books.attachManuscript(id, { key: brokenKey }, admin),
        ).rejects.toThrow(/could not be read as a PDF/);
        expect(files.objects.has(brokenKey)).toBe(false);
        expect((await bookModel.findById(id).lean())!.manuscript).toBeNull();
      });

      it('with a storage limit, counts stored files and uploads in progress, and refuses what would exceed it', async () => {
        const id = (await books.create('Sand Moulding', admin))._id.toString();
        const { key } = await attachPdf(id); // a stored file
        const stored = files.objects.get(key)!.length;
        await manuscripts.start(id, 100_000, admin); // an upload still in progress
        files.storageLimitBytes = stored + 100_000 + 50_000;

        await manuscripts.start(id, 50_000, admin); // exactly fills the limit
        await expect(manuscripts.start(id, 1, admin)).rejects.toMatchObject({
          status: 409,
          response: {
            code: 'storage_limit',
            message: expect.stringMatching(/Not enough file storage left/),
          },
        });
        // Deleting files frees the space again.
        await books.remove(id, admin);
        await uploadModel.deleteMany({});
        const other = (await books.create('Die Casting', admin))._id.toString();
        await expect(manuscripts.start(other, 1, admin)).resolves.toBeTruthy();
      });

      it('has no storage limit unless one is configured', async () => {
        const id = (await books.create('Sand Moulding', admin))._id.toString();
        files.objects.set('x', new Uint8Array(500_000));
        await expect(
          manuscripts.start(id, 900_000, admin),
        ).resolves.toBeTruthy();
      });

      it('refuses a file over the limit before anything is uploaded', async () => {
        const id = (await books.create('Sand Moulding', admin))._id.toString();
        await expect(
          manuscripts.start(id, 2 * 1024 * 1024, admin),
        ).rejects.toThrow(/limit is 1 MB/);
        expect(files.multipart.size).toBe(0);
      });

      it('completes only when every piece arrived whole, and completing twice is harmless', async () => {
        const id = (await books.create('Sand Moulding', admin))._id.toString();
        const started = await manuscripts.start(id, bookPdf.length, admin);
        await expect(
          manuscripts.complete(id, started.key, started.uploadId),
        ).rejects.toThrow(/0 of 1 pieces arrived/);
        files.putPart(started.uploadId, 1, bookPdf.subarray(0, 100));
        await expect(
          manuscripts.complete(id, started.key, started.uploadId),
        ).rejects.toThrow(/piece 1 is incomplete/);
        files.putPart(started.uploadId, 1, bookPdf);
        await manuscripts.complete(id, started.key, started.uploadId);
        await manuscripts.complete(id, started.key, started.uploadId);
        const book = await books.attachManuscript(
          id,
          { key: started.key },
          admin,
        );
        expect(book.manuscript!.pages).toBe(40);
      });

      it('cancelling an upload removes everything of it', async () => {
        const id = (await books.create('Sand Moulding', admin))._id.toString();
        const started = await manuscripts.start(id, 100, admin);
        await manuscripts.abort(id, started.key, started.uploadId);
        expect(files.aborted).toEqual([started.uploadId]);
        expect(files.deleted).toEqual([started.key]);
        expect(await uploadModel.countDocuments()).toBe(0);
      });

      it('gives staff a 30-minute link to the current file only', async () => {
        const id = (await books.create('Sand Moulding', admin))._id.toString();
        await expect(manuscripts.readLink(id)).rejects.toThrow(/no PDF yet/);
        const { key } = await attachPdf(id);
        const link = await manuscripts.readLink(id, Date.UTC(2026, 9, 2));
        expect(link).toEqual({
          url: `https://r2.test/${key}?X-Amz-Expires=1800`,
          expiresAt: '2026-10-02T00:30:00.000Z',
        });
      });

      it('deleting a draft deletes its file', async () => {
        const id = (await books.create('Sand Moulding', admin))._id.toString();
        const { key } = await attachPdf(id);
        await books.remove(id, admin);
        expect(files.objects.has(key)).toBe(false);
      });
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
    it('deletes stale pending images but keeps (and re-confirms) attached ones', async () => {
      const id = (
        await books.create('Ferrous Foundry Practice', admin)
      )._id.toString();
      const cover = `books/${id}/images/attached`;
      await books.attachCover(id, { publicId: cover }, admin);
      media.attached = [];
      media.destroyed = [];
      media.stale = [cover, `books/${id}/images/abandoned`];

      const result = await moduleRef.get(UploadCleanupJob).run();

      expect(result.kept).toEqual([cover]);
      expect(result.deleted).toEqual([`books/${id}/images/abandoned`]);
      expect(media.destroyed).not.toContain(cover);
      expect(media.attached).toEqual([cover]);
      media.stale = [];
    });

    it('deletes book-file uploads abandoned for a day, never a file a book uses', async () => {
      const id = (await books.create('Sand Moulding', admin))._id.toString();
      const abandoned = await manuscripts.start(id, 100, admin);
      const recent = await manuscripts.start(id, 100, admin);
      const { key: attachedKey } = await attachPdf(id);
      // Bookkeeping that failed after attaching: a record lingers for a file the book uses.
      await uploadModel.create({
        bookId: id,
        key: attachedKey,
        uploadId: 'up-lingering',
        bytes: 1,
        partCount: 1,
        status: 'uploaded',
        startedBy: admin.sub,
      });
      const twoDaysAgo = new Date(Date.now() - 48 * 3600_000);
      await uploadModel.collection.updateMany(
        { key: { $in: [abandoned.key, attachedKey] } },
        { $set: { createdAt: twoDaysAgo } },
      );

      const result = await moduleRef.get(UploadCleanupJob).run();

      expect(result.deleted).toEqual([abandoned.key]);
      expect(result.kept).toEqual([attachedKey]);
      expect(files.aborted).toEqual([abandoned.uploadId]);
      expect(files.objects.has(attachedKey)).toBe(true);
      expect((await uploadModel.find().lean()).map((u) => u.key)).toEqual([
        recent.key,
      ]);
    });
  });
});
