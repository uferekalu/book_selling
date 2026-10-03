import { createHash, randomBytes } from 'node:crypto';
import { ConfigModule } from '@nestjs/config';
import { MongooseModule, getModelToken } from '@nestjs/mongoose';
import { Test, type TestingModule } from '@nestjs/testing';
import type { MongoMemoryReplSet } from 'mongodb-memory-server';
import { Types, type Model } from 'mongoose';
import { PDFDocument } from 'pdf-lib';
import { FakeBookFiles, manuscriptPdf } from '../../test/fake-book-files.js';
import { startMongo } from '../../test/mongo.js';
import { AuditModule } from '../audit/audit.module.js';
import { Book } from '../catalog/schemas/book.schema.js';
import { Entitlement } from '../commerce/schemas/entitlement.schema.js';
import { Order } from '../commerce/schemas/order.schema.js';
import { MailService } from '../mail/mail.service.js';
import { NotificationsModule } from '../notifications/notifications.module.js';
import { RealtimeModule } from '../realtime/realtime.module.js';
import { BookFilesService } from '../uploads/book-files.service.js';
import { CloudinaryService } from '../uploads/cloudinary.service.js';
import { User } from '../users/schemas/user.schema.js';
import { CopiesService, MAX_COPY_ATTEMPTS } from './copies.service.js';
import { LibraryModule } from './library.module.js';
import {
  ABUSE_THRESHOLD,
  DOWNLOADS_PER_HOUR,
  LibraryService,
} from './library.service.js';
import { DownloadEvent } from './schemas/download-event.schema.js';

class FakeMail {
  sent: Array<{
    to: string;
    template: string;
    dedupeKey: string;
    data: Record<string, unknown>;
  }> = [];
  enqueue(email: {
    to: string;
    template: string;
    dedupeKey: string;
    data: Record<string, unknown>;
  }) {
    if (!this.sent.some((e) => e.dedupeKey === email.dedupeKey))
      this.sent.push(email);
    return Promise.resolve({});
  }
}

const fakeMedia = { configured: false, imageUrl: () => null };
const sha = (bytes: Uint8Array) =>
  createHash('sha256').update(bytes).digest('hex');

describe('Library (owned ebooks, personal copies, reading and downloads)', () => {
  let mongod: MongoMemoryReplSet;
  let moduleRef: TestingModule;
  let library: LibraryService;
  let copies: CopiesService;
  let bookModel: Model<Book>;
  let userModel: Model<User>;
  let orderModel: Model<Order>;
  let entitlementModel: Model<Entitlement>;
  let downloadModel: Model<DownloadEvent>;
  const files = new FakeBookFiles();
  const mail = new FakeMail();

  beforeAll(async () => {
    mongod = await startMongo();
    moduleRef = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({
          isGlobal: true,
          ignoreEnvFile: true,
          load: [
            () => ({
              NODE_ENV: 'test',
              FRONTEND_URL: 'https://books.example.com',
              OWNER_ALERT_EMAIL: 'owner@books.example.com',
            }),
          ],
        }),
        MongooseModule.forRoot(mongod.getUri()),
        AuditModule,
        RealtimeModule,
        NotificationsModule,
        LibraryModule,
      ],
    })
      .overrideProvider(CloudinaryService)
      .useValue(fakeMedia)
      .overrideProvider(MailService)
      .useValue(mail)
      .overrideProvider(BookFilesService)
      .useValue(files)
      .compile();
    library = moduleRef.get(LibraryService);
    copies = moduleRef.get(CopiesService);
    bookModel = moduleRef.get(getModelToken(Book.name));
    userModel = moduleRef.get(getModelToken(User.name));
    orderModel = moduleRef.get(getModelToken(Order.name));
    entitlementModel = moduleRef.get(getModelToken(Entitlement.name));
    downloadModel = moduleRef.get(getModelToken(DownloadEvent.name));
    for (const model of [entitlementModel, downloadModel])
      await model.syncIndexes();
  }, 120_000);

  afterAll(async () => {
    await moduleRef?.close();
    await mongod?.stop();
  });

  beforeEach(async () => {
    const collections = await bookModel.db.listCollections();
    await Promise.all(
      collections
        .filter((c) => !c.name.startsWith('system.'))
        .map((c) => bookModel.db.collection(c.name).deleteMany({})),
    );
    mail.sent = [];
    files.objects.clear();
    Object.assign(files, {
      deleted: [],
      downloads: 0,
      downloadError: null,
      onDownload: null,
    });
  });

  let seq = 0;
  /** A published book whose PDF is in (fake) R2, and a customer who bought its ebook. */
  async function ownedBook({ stamp = true, pages = 12 } = {}) {
    seq += 1;
    const pdf = await manuscriptPdf(pages);
    const key = `test-root/books/b${seq}/manuscript/${randomBytes(16).toString('hex')}.pdf`;
    files.objects.set(key, pdf);
    const book = await bookModel.create({
      title: `Sand Casting ${seq}`,
      slug: `sand-casting-${seq}`,
      status: 'published',
      tableOfContents: [
        {
          title: 'Introduction',
          page: 1,
          children: [{ title: 'History', page: 2 }],
        },
        { title: 'Moulds', page: 6 },
        { title: 'Index' },
      ],
      preview: { pageOffset: 2 },
      formats: [
        {
          type: 'ebook',
          sku: `E-${seq}`,
          active: true,
          prices: [{ currency: 'NGN', amount: 1_500_000 }],
          ebook: { stampWithBuyer: stamp },
        },
      ],
      manuscript: {
        key,
        bytes: pdf.length,
        pages,
        checksum: sha(pdf),
        uploadedAt: new Date(),
      },
    });
    const user = await userModel.create({
      email: `reader${seq}@example.com`,
      name: 'Ṣọlá Adéọlá',
    });
    const order = await orderModel.create({
      orderNumber: `BS-2026-${String(seq).padStart(6, '0')}`,
      userId: user._id,
      email: user.email,
      customerName: user.name,
      currency: 'NGN',
      items: [
        {
          bookId: book._id,
          format: 'ebook',
          sku: `E-${seq}`,
          titleSnapshot: book.title,
          slugSnapshot: book.slug,
          unitAmount: 1_500_000,
          quantity: 1,
          lineTotal: 1_500_000,
        },
      ],
      subtotal: 1_500_000,
      discountTotal: 0,
      shippingTotal: 0,
      taxTotal: 0,
      total: 1_500_000,
      status: 'paid',
      shipment: { status: 'not_required' },
      checkoutKeyHash: randomBytes(16).toString('hex'),
    });
    const entitlement = await entitlementModel.create({
      userId: user._id,
      bookId: book._id,
      orderId: order._id,
      grantedAt: new Date(),
    });
    return {
      book,
      user,
      order,
      entitlement,
      userId: user._id.toString(),
      bookId: book._id.toString(),
    };
  }

  const entitlementOf = async (id: Types.ObjectId) =>
    (await entitlementModel.findById(id).lean())!;

  describe('personal copies', () => {
    it('prepares a stamped copy in the background, then serves it through a 60-minute link', async () => {
      const { userId, bookId, entitlement, order } = await ownedBook();

      // Opening the library queues the copy; until it's built the book shows as preparing.
      let [item] = await library.list(userId);
      expect(item).toMatchObject({
        bookId,
        copy: 'preparing',
        pages: 12,
        orderNumber: order.orderNumber,
      });
      expect(await library.readLink(userId, bookId)).toEqual({
        status: 'preparing',
      });

      expect(await copies.processNext()).toBe(true);
      expect(await copies.processNext()).toBe(false);

      [item] = await library.list(userId);
      expect(item.copy).toBe('ready');
      const now = new Date('2026-10-02T10:00:00Z');
      const link = await library.readLink(userId, bookId, now);
      const copyKey = (await entitlementOf(entitlement._id)).copy!.key!;
      expect(link).toEqual({
        status: 'ready',
        url: `https://r2.test/${copyKey}?X-Amz-Expires=3600`,
        expiresAt: '2026-10-02T11:00:00.000Z',
        updating: false,
      });
      // The copy is licensed to this buyer and this order, and lives apart from the master.
      expect(copyKey).toMatch(
        new RegExp(`/books/${bookId}/copies/${entitlement._id.toString()}-`),
      );
      const stamped = await PDFDocument.load(files.objects.get(copyKey)!);
      expect(stamped.getSubject()).toBe(
        `Licensed to Solá Adéolá · ${'reader'}${seq}@example.com · Order ${order.orderNumber}`,
      );
      expect((await entitlementOf(entitlement._id)).firstOpenedAt).toEqual(now);
    });

    it('serves the master file directly when the book is not stamped (no copy made)', async () => {
      const { userId, bookId, book } = await ownedBook({ stamp: false });
      const link = await library.readLink(userId, bookId);
      expect(link).toMatchObject({
        status: 'ready',
        url: `https://r2.test/${book.manuscript!.key}?X-Amz-Expires=3600`,
      });
      expect(await copies.processNext()).toBe(false);
    });

    it('brings owners the new edition automatically, serving the old copy until it is ready', async () => {
      const { userId, bookId, book, entitlement } = await ownedBook();
      await library.list(userId);
      await copies.processNext();
      const firstKey = (await entitlementOf(entitlement._id)).copy!.key!;

      // The author uploads a corrected PDF.
      const corrected = await manuscriptPdf(14);
      files.objects.set('test-root/new-edition.pdf', corrected);
      await bookModel.updateOne(
        { _id: book._id },
        {
          'manuscript.key': 'test-root/new-edition.pdf',
          'manuscript.checksum': sha(corrected),
          'manuscript.pages': 14,
        },
      );
      const meanwhile = await library.readLink(userId, bookId);
      expect(meanwhile).toMatchObject({ status: 'ready', updating: true });
      expect((meanwhile as { url: string }).url).toContain(firstKey);

      await copies.processNext();
      const after = (await entitlementOf(entitlement._id)).copy!;
      expect(after.sourceChecksum).toBe(sha(corrected));
      expect(after.key).not.toBe(firstKey);
      expect(files.deleted).toContain(firstKey);
      expect(
        (await PDFDocument.load(files.objects.get(after.key!)!)).getPageCount(),
      ).toBe(14);
      expect(await library.readLink(userId, bookId)).toMatchObject({
        updating: false,
      });
    });

    it('discards a build overtaken by a newer request', async () => {
      const { userId, bookId, book, entitlement } = await ownedBook();
      await library.list(userId);
      const corrected = await manuscriptPdf(13);
      files.onDownload = async () => {
        files.onDownload = null;
        // While the first copy is being made, a new edition arrives and is queued.
        files.objects.set('test-root/v2.pdf', corrected);
        await bookModel.updateOne(
          { _id: book._id },
          {
            'manuscript.key': 'test-root/v2.pdf',
            'manuscript.checksum': sha(corrected),
            'manuscript.pages': 13,
          },
        );
        await library.readLink(userId, bookId);
      };
      await copies.processNext();
      const copy = (await entitlementOf(entitlement._id)).copy!;
      expect(copy.status).toBe('queued');
      expect(copy.key).toBeNull();
      expect(files.deleted).toHaveLength(1); // the overtaken build was thrown away

      await copies.processNext();
      expect((await entitlementOf(entitlement._id)).copy).toMatchObject({
        status: 'ready',
        sourceChecksum: sha(corrected),
      });
    });

    it('retries a storage failure, then gives up and alerts the owner once', async () => {
      const { userId, bookId, entitlement } = await ownedBook();
      await library.list(userId);
      files.downloadError = new Error('ECONNRESET');
      for (let i = 0; i < MAX_COPY_ATTEMPTS; i += 1) await copies.processNext();
      expect((await entitlementOf(entitlement._id)).copy).toMatchObject({
        status: 'failed',
        attempts: MAX_COPY_ATTEMPTS,
      });
      expect(mail.sent.map((m) => m.template)).toEqual(['ops.copy-failed']);
      expect(mail.sent[0].to).toBe('owner@books.example.com');
      // The buyer gets a clear message instead of an endless "preparing".
      await expect(library.readLink(userId, bookId)).rejects.toThrow(
        /couldn’t prepare your copy/,
      );
    });

    it('fails at once, without retrying, on a book file that cannot be read', async () => {
      const { userId, book, entitlement } = await ownedBook();
      files.objects.set(
        book.manuscript!.key,
        new TextEncoder().encode('%PDF-1.7 damaged'),
      );
      await library.list(userId);
      await copies.processNext();
      expect((await entitlementOf(entitlement._id)).copy).toMatchObject({
        status: 'failed',
        attempts: 1,
        error: expect.stringMatching(/could not be read as a PDF/),
      });
    });

    it('starts copies for new purchases before the buyer opens them (stamped books only)', async () => {
      const stamped = await ownedBook();
      const plain = await ownedBook({ stamp: false });
      expect(await copies.queueNew()).toBe(1);
      expect((await entitlementOf(stamped.entitlement._id)).copy?.status).toBe(
        'queued',
      );
      expect((await entitlementOf(plain.entitlement._id)).copy).toBeNull();
      expect(await copies.queueNew()).toBe(0);
    });
  });

  describe('access', () => {
    it('only the owner can read, and a refunded (revoked) book is gone from the library', async () => {
      const { userId, bookId, entitlement } = await ownedBook();
      const stranger = (
        await userModel.create({ email: 's@example.com', name: 'S' })
      )._id.toString();
      await expect(library.readLink(stranger, bookId)).rejects.toThrow(
        /isn’t in your library/,
      );
      await entitlementModel.updateOne(
        { _id: entitlement._id },
        { revokedAt: new Date() },
      );
      await expect(library.readLink(userId, bookId)).rejects.toThrow(
        /isn’t in your library/,
      );
      expect(await library.list(userId)).toEqual([]);
      expect(await library.owned(userId)).toEqual([]);
    });

    it('keeps an archived book in the library', async () => {
      const { userId, bookId, book } = await ownedBook({ stamp: false });
      await bookModel.updateOne({ _id: book._id }, { status: 'archived' });
      expect((await library.list(userId)).map((i) => i.bookId)).toEqual([
        bookId,
      ]);
      expect(await library.owned(userId)).toEqual([
        { bookId, slug: book.slug },
      ]);
    });

    it('maps the printed contents to PDF pages for the full reader', async () => {
      const { userId, bookId } = await ownedBook({ stamp: false });
      const item = await library.item(userId, bookId);
      expect(item.outline).toEqual([
        { title: 'Introduction', level: 1, page: 3 },
        { title: 'History', level: 2, page: 4 },
        { title: 'Moulds', level: 1, page: 8 },
        { title: 'Index', level: 1, page: null },
      ]);
    });
  });

  describe('downloads', () => {
    it('gives 5-minute download links, at most 10 per hour, and counts them', async () => {
      const { userId, bookId, book, entitlement } = await ownedBook({
        stamp: false,
      });
      const start = new Date('2026-10-02T10:00:00Z');
      for (let i = 0; i < DOWNLOADS_PER_HOUR; i += 1) {
        const link = await library.downloadLink(
          userId,
          bookId,
          new Date(start.getTime() + i * 60_000),
        );
        expect(link).toMatchObject({
          status: 'ready',
          url: `https://r2.test/${book.manuscript!.key}?X-Amz-Expires=300`,
        });
      }
      const refused = await library
        .downloadLink(userId, bookId, new Date(start.getTime() + 20 * 60_000))
        .catch((e: { getStatus(): number; getResponse(): unknown }) => e);
      expect((refused as { getStatus(): number }).getStatus()).toBe(429);
      expect(
        (refused as { getResponse(): { message: string } }).getResponse()
          .message,
      ).toMatch(/again in 40 minutes/);

      const after = await entitlementOf(entitlement._id);
      expect(after.downloadCount).toBe(DOWNLOADS_PER_HOUR);
      expect(await downloadModel.countDocuments()).toBe(DOWNLOADS_PER_HOUR);
      // An hour after the first one, downloading works again.
      await expect(
        library.downloadLink(
          userId,
          bookId,
          new Date(start.getTime() + 61 * 60_000),
        ),
      ).resolves.toMatchObject({ status: 'ready' });
    });

    it('alerts the owner once a day when one buyer downloads a book unusually often', async () => {
      const { userId, bookId, user, book, entitlement } = await ownedBook({
        stamp: false,
      });
      const now = new Date('2026-10-02T20:00:00Z');
      // Earlier today (outside the hourly window): one short of the alert.
      await downloadModel.insertMany(
        Array.from({ length: ABUSE_THRESHOLD - 1 }, (_, i) => ({
          userId: user._id,
          bookId: book._id,
          entitlementId: entitlement._id,
          at: new Date(now.getTime() - (2 + i * 0.1) * 3600_000),
        })),
      );
      await library.downloadLink(userId, bookId, now);
      await library.downloadLink(
        userId,
        bookId,
        new Date(now.getTime() + 60_000),
      );
      const alerts = mail.sent.filter(
        (m) => m.template === 'ops.download-abuse',
      );
      expect(alerts).toHaveLength(1);
      expect(alerts[0].data).toMatchObject({
        title: book.title,
        downloadsLast24h: ABUSE_THRESHOLD,
      });
    });
  });

  describe('reading progress', () => {
    it('saves the page, keeps the furthest page reached, and never goes past the end', async () => {
      const { userId, bookId } = await ownedBook({ stamp: false });
      await library.saveProgress(userId, bookId, 7);
      await library.saveProgress(userId, bookId, 3);
      let [item] = await library.list(userId);
      expect(item.progress).toMatchObject({ page: 3, maxPage: 7 });
      await library.saveProgress(userId, bookId, 999);
      [item] = await library.list(userId);
      expect(item.progress).toMatchObject({ page: 12, maxPage: 12 });
    });
  });
});
