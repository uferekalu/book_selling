import { ConfigModule } from '@nestjs/config';
import { MongooseModule, getModelToken } from '@nestjs/mongoose';
import { Test, type TestingModule } from '@nestjs/testing';
import type { MongoMemoryReplSet } from 'mongodb-memory-server';
import type { Model } from 'mongoose';
import { PDFDocument } from 'pdf-lib';
import { startMongo } from '../../test/mongo.js';
import { AuditModule } from '../audit/audit.module.js';
import type { AccessTokenPayload } from '../auth/interfaces/auth.types.js';
import { BooksService } from '../catalog/books.service.js';
import { CatalogModule } from '../catalog/catalog.module.js';
import { Book } from '../catalog/schemas/book.schema.js';
import { StorefrontRevalidator } from '../catalog/storefront-revalidator.js';
import {
  CloudinaryService,
  type UploadKind,
} from '../uploads/cloudinary.service.js';
import { PreviewEvent, PreviewEventsService } from './preview-events.js';
import { PreviewStorage } from './preview-storage.js';
import { MAX_BUILD_ATTEMPTS, PreviewService } from './preview.service.js';

const admin: AccessTokenPayload = {
  sub: '64b000000000000000000001',
  email: 'a@x.com',
  role: 'admin',
  mfa: true,
  sid: 's',
  typ: 'access',
};

/** Page k is 400+k points wide, so a served page's width proves which page it is. */
async function manuscriptPdf(pages: number): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  for (let k = 1; k <= pages; k += 1) doc.addPage([400 + k, 600]);
  return doc.save();
}

class FakeCloudinary {
  configured = true;
  cloudName = 'demo';
  pages = 40;
  etag = 'etag-1';
  file: Uint8Array | null = null;
  downloadError: Error | null = null;
  onDownload: (() => Promise<void>) | null = null;
  downloads = 0;
  teasers: number[] = [];
  verify(kind: UploadKind, ownerId: string, publicId: string) {
    return Promise.resolve({
      publicId,
      version: 3,
      format: kind === 'manuscript' ? 'pdf' : 'jpg',
      bytes: 5000,
      width: 1600,
      height: 2400,
      pages: kind === 'manuscript' ? this.pages : 1,
      etag: this.etag,
      dominantColor: null,
    });
  }
  async downloadManuscript() {
    this.downloads += 1;
    if (this.onDownload) await this.onDownload();
    if (this.downloadError) throw this.downloadError;
    return this.file ?? manuscriptPdf(this.pages);
  }
  createTeaser(_id: string, _v: number, page: number) {
    this.teasers.push(page);
    return Promise.resolve(
      `https://res.cloudinary.com/demo/teaser-${page}.jpg`,
    );
  }
  manuscriptPageUrl(_id: string, _v: number, page: number) {
    return `https://signed.example/page-${page}`;
  }
  markAttached() {
    return Promise.resolve();
  }
  destroy() {
    return Promise.resolve();
  }
  destroyPreviewTeasers() {
    return Promise.resolve();
  }
  blurDataUrl() {
    return Promise.resolve(null);
  }
  imageUrl(publicId: string, version: number) {
    return `https://res.cloudinary.com/demo/image/upload/v${version}/${publicId}`;
  }
}

describe('Preview (build, serve, rebuild)', () => {
  let mongod: MongoMemoryReplSet;
  let moduleRef: TestingModule;
  let previews: PreviewService;
  let books: BooksService;
  let storage: PreviewStorage;
  let bookModel: Model<Book>;
  let media: FakeCloudinary;
  const notified: string[][] = [];

  beforeAll(async () => {
    mongod = await startMongo();
    media = new FakeCloudinary();
    moduleRef = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({
          isGlobal: true,
          ignoreEnvFile: true,
          load: [() => ({ PREVIEW_MAX_PERCENT: 15 })],
        }),
        MongooseModule.forRoot(mongod.getUri()),
        AuditModule,
        CatalogModule,
      ],
    })
      .overrideProvider(CloudinaryService)
      .useValue(media)
      .overrideProvider(StorefrontRevalidator)
      .useValue({ notify: (tags: string[]) => notified.push(tags) })
      .compile();
    previews = moduleRef.get(PreviewService);
    books = moduleRef.get(BooksService);
    storage = moduleRef.get(PreviewStorage);
    bookModel = moduleRef.get(getModelToken(Book.name));
  }, 90_000);

  afterAll(async () => {
    await moduleRef?.close();
    await mongod?.stop();
  });

  beforeEach(async () => {
    await bookModel.deleteMany({});
    Object.assign(media, {
      pages: 40,
      etag: 'etag-1',
      file: null,
      downloadError: null,
      onDownload: null,
      downloads: 0,
      teasers: [],
    });
    notified.length = 0;
  });

  /** A book with a 40-page manuscript, optionally published (bypassing the other checks). */
  async function bookWithManuscript(published = true) {
    const book = await books.create('Principles of Foundry Technology', admin);
    const id = book._id.toString();
    await books.update(
      id,
      {
        tableOfContents: [
          {
            title: 'Introduction',
            page: 1,
            children: [{ title: 'History of casting', page: 3 }],
          },
          { title: 'Moulding sands', page: 20 },
          { title: 'Appendix' },
        ],
      },
      admin,
    );
    await books.attachManuscript(
      id,
      { publicId: `books/${id}/manuscript/file` },
      admin,
    );
    if (published)
      await bookModel.updateOne({ _id: book._id }, { status: 'published' });
    return id;
  }

  const servedWidths = async (fileUrl: string) => {
    const file = await previews.openFile(fileUrl.split('/').pop()!);
    const chunks: Buffer[] = [];
    for await (const chunk of file.stream) chunks.push(chunk as Buffer);
    const doc = await PDFDocument.load(Buffer.concat(chunks));
    return doc.getPages().map((p) => Math.round(p.getWidth()) - 400);
  };

  it('needs the book PDF first and enforces the 15% cap with clear problems', async () => {
    const draft = await books.create('No File Yet', admin);
    await expect(
      previews.setSections(
        draft._id.toString(),
        { sections: [{ label: 'Intro', fromPage: 1, toPage: 2 }] },
        admin,
      ),
    ).rejects.toThrow(/Upload the book PDF first/);

    const id = await bookWithManuscript();
    await expect(
      previews.setSections(
        id,
        { sections: [{ label: 'Intro', fromPage: 1, toPage: 7 }] },
        admin,
      ),
    ).rejects.toMatchObject({
      response: { problems: [expect.stringMatching(/at most 6/)] },
    });
  });

  it('builds a preview with ONLY the chosen pages and serves it for a published book', async () => {
    const id = await bookWithManuscript();
    const queued = await previews.setSections(
      id,
      {
        sections: [
          { label: 'Introduction', fromPage: 3, toPage: 6 },
          { label: 'Abstract', fromPage: 1, toPage: 2 },
        ],
        pageOffset: 0,
      },
      admin,
    );
    expect(queued.preview.status).toBe('queued');

    expect(await previews.processNext()).toBe(true);
    expect(await previews.processNext()).toBe(false);

    const book = await bookModel.findById(id).lean();
    expect(book!.preview).toMatchObject({
      enabled: true,
      status: 'ready',
      pageMap: [1, 2, 3, 4, 5, 6],
      sourceChecksum: 'etag-1',
      error: null,
    });
    expect(media.teasers).toEqual([7, 8]);
    expect(notified.at(-1)).toContain('book:principles-of-foundry-technology');

    const pub = await previews.publicPreview(
      'principles-of-foundry-technology',
    );
    expect(pub).toMatchObject({
      pageCount: 6,
      totalPages: 40,
      continuesAt: 7,
      sections: [
        { label: 'Abstract', previewPage: 1 },
        { label: 'Introduction', previewPage: 3 },
      ],
      teasers: [
        'https://res.cloudinary.com/demo/teaser-7.jpg',
        'https://res.cloudinary.com/demo/teaser-8.jpg',
      ],
    });
    // Contents: chapters inside the preview link to their preview page; the rest are locked.
    expect(pub.outline).toEqual([
      { title: 'Introduction', level: 1, page: 1, previewPage: 1 },
      { title: 'History of casting', level: 2, page: 3, previewPage: 3 },
      { title: 'Moulding sands', level: 1, page: 20, previewPage: null },
      { title: 'Appendix', level: 1, page: null, previewPage: null },
    ]);
    // End to end: the served bytes contain exactly pages 1–6 of the manuscript.
    expect(await servedWidths(pub.fileUrl)).toEqual([1, 2, 3, 4, 5, 6]);
    expect(JSON.stringify(pub)).not.toContain('manuscript/file');
  });

  it('maps printed contents pages through the front-matter offset', async () => {
    const id = await bookWithManuscript();
    await previews.setSections(
      id,
      {
        sections: [{ label: 'Introduction', fromPage: 3, toPage: 6 }],
        pageOffset: 2,
      },
      admin,
    );
    await previews.processNext();
    const pub = await previews.publicPreview(
      'principles-of-foundry-technology',
    );
    // Printed page 1 is PDF page 3, the first preview page.
    expect(pub.outline[0]).toMatchObject({ page: 3, previewPage: 1 });
  });

  it('never serves a draft’s preview or an old file id', async () => {
    const id = await bookWithManuscript(false);
    await previews.setSections(
      id,
      { sections: [{ label: 'Intro', fromPage: 1, toPage: 2 }] },
      admin,
    );
    await previews.processNext();
    const fileId = (await bookModel
      .findById(id)
      .lean())!.preview.fileId!.toString();
    await expect(
      previews.publicPreview('principles-of-foundry-technology'),
    ).rejects.toThrow();
    await expect(previews.openFile(fileId)).rejects.toThrow();

    await bookModel.updateOne({ _id: id }, { status: 'published' });
    await previews.rebuild(id, admin);
    await previews.processNext();
    // The old file is deleted and no longer served; the new one is.
    await expect(previews.openFile(fileId)).rejects.toThrow();
    expect(
      await storage.size(
        (await bookModel.findById(id).lean())!.preview.fileId!,
      ),
    ).toBeGreaterThan(0);
    await expect(previews.openFile('not-an-id')).rejects.toThrow();
  });

  it('discards a build overtaken by a newer request', async () => {
    const id = await bookWithManuscript();
    await previews.setSections(
      id,
      { sections: [{ label: 'Intro', fromPage: 1, toPage: 2 }] },
      admin,
    );
    // While building, the editor changes the sections (a newer request).
    media.onDownload = async () => {
      media.onDownload = null;
      await previews.setSections(
        id,
        { sections: [{ label: 'Intro', fromPage: 1, toPage: 4 }] },
        admin,
      );
    };
    await previews.processNext();
    let book = (await bookModel.findById(id).lean())!;
    expect(book.preview.status).toBe('queued');
    expect(book.preview.fileId).toBeNull();

    await previews.processNext();
    book = (await bookModel.findById(id).lean())!;
    expect(book.preview.pageMap).toEqual([1, 2, 3, 4]);
  });

  it('fails clearly on an encrypted or unreadable PDF, without retrying', async () => {
    const id = await bookWithManuscript();
    media.file = new TextEncoder().encode('%PDF-1.7 not really');
    await previews.setSections(
      id,
      { sections: [{ label: 'Intro', fromPage: 1, toPage: 2 }] },
      admin,
    );
    await previews.processNext();
    const book = (await bookModel.findById(id).lean())!;
    expect(book.preview).toMatchObject({ status: 'failed', enabled: false });
    expect(book.preview.error).toMatch(/could not be read as a PDF/);
    expect(await previews.processNext()).toBe(false);
  });

  it('retries a network failure, then gives up after the maximum attempts', async () => {
    const id = await bookWithManuscript();
    media.downloadError = new Error('ECONNRESET');
    await previews.setSections(
      id,
      { sections: [{ label: 'Intro', fromPage: 1, toPage: 2 }] },
      admin,
    );
    for (let i = 0; i < MAX_BUILD_ATTEMPTS; i += 1)
      await previews.processNext();
    const book = (await bookModel.findById(id).lean())!;
    expect(media.downloads).toBe(MAX_BUILD_ATTEMPTS);
    expect(book.preview).toMatchObject({
      status: 'failed',
      attempts: MAX_BUILD_ATTEMPTS,
    });
    expect(book.preview.error).toMatch(/Rebuild/);
  });

  it('rebuilds after the manuscript is replaced, serving the old preview meanwhile', async () => {
    const id = await bookWithManuscript();
    await previews.setSections(
      id,
      { sections: [{ label: 'Intro', fromPage: 1, toPage: 2 }] },
      admin,
    );
    await previews.processNext();
    const oldFile = (await bookModel
      .findById(id)
      .lean())!.preview.fileId!.toString();

    media.etag = 'etag-2';
    await books.attachManuscript(
      id,
      { publicId: `books/${id}/manuscript/v2` },
      admin,
    );
    let book = (await bookModel.findById(id).lean())!;
    expect(book.preview).toMatchObject({ status: 'queued', enabled: true });
    await expect(previews.openFile(oldFile)).resolves.toBeTruthy();

    await previews.processNext();
    book = (await bookModel.findById(id).lean())!;
    expect(book.preview).toMatchObject({
      status: 'ready',
      sourceChecksum: 'etag-2',
    });
    await expect(previews.openFile(oldFile)).rejects.toThrow();
  });

  it('records anonymous reading events for published books only', async () => {
    await bookWithManuscript();
    const events = moduleRef.get(PreviewEventsService);
    const model = moduleRef.get<Model<PreviewEvent>>(
      getModelToken(PreviewEvent.name),
    );
    await model.deleteMany({});
    await events.record({
      slug: 'principles-of-foundry-technology',
      sessionId: 'abcdefgh1234',
      events: [{ type: 'open' }, { type: 'page', page: 3 }],
    });
    await events.record({
      slug: 'no-such-book',
      sessionId: 'abcdefgh1234',
      events: [{ type: 'open' }],
    });
    const stored = await model.find().lean();
    expect(stored.map((e) => [e.type, e.page])).toEqual([
      ['open', null],
      ['page', 3],
    ]);
  });
});
