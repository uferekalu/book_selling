import { randomBytes } from 'node:crypto';
import { ConfigService } from '@nestjs/config';
import { PDFDocument } from 'pdf-lib';
import type { ManuscriptsService } from '../src/catalog/manuscripts.service.js';
import {
  BookFilesService,
  PART_BYTES,
  UploadIncompleteError,
  type StartedUpload,
  type UploadedPart,
} from '../src/uploads/book-files.service.js';

/** A real PDF; page k is 400+k points wide, so a page's width proves which page it is. */
export async function manuscriptPdf(pages: number): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  for (let k = 1; k <= pages; k += 1) doc.addPage([400 + k, 600]);
  return doc.save();
}

/**
 * R2 in memory: the real key rules and part checks, with objects and multipart uploads in maps.
 * Tests "PUT" parts with `putPart` (the browser's job) and can break things on purpose.
 */
export class FakeBookFiles extends BookFilesService {
  override readonly configured = true;
  readonly objects = new Map<string, Uint8Array>();
  readonly multipart = new Map<
    string,
    { key: string; parts: Map<number, Uint8Array> }
  >();
  deleted: string[] = [];
  aborted: string[] = [];
  downloads = 0;
  downloadError: Error | null = null;
  onDownload: (() => Promise<void>) | null = null;

  constructor(maxMb = 200) {
    super(
      new ConfigService({ R2_FOLDER: 'test-root', MANUSCRIPT_MAX_MB: maxMb }),
    );
  }

  override startManuscriptUpload(
    bookId: string,
    bytes: number,
  ): Promise<StartedUpload> {
    const key = `${this.manuscriptPrefix(bookId)}${randomBytes(16).toString('hex')}.pdf`;
    const uploadId = `up-${randomBytes(6).toString('hex')}`;
    this.multipart.set(uploadId, { key, parts: new Map() });
    return Promise.resolve({
      key,
      uploadId,
      partBytes: PART_BYTES,
      partCount: BookFilesService.partCount(bytes),
    });
  }

  override signParts(key: string, uploadId: string, partNumbers: number[]) {
    return Promise.resolve(
      partNumbers.map((partNumber) => ({
        partNumber,
        url: `https://r2.test/${key}?uploadId=${uploadId}&partNumber=${partNumber}&X-Amz-Signature=x`,
      })),
    );
  }

  putPart(uploadId: string, partNumber: number, bytes: Uint8Array): void {
    const upload = this.multipart.get(uploadId);
    if (!upload) throw new Error('NoSuchUpload');
    upload.parts.set(partNumber, bytes);
  }

  override listParts(_key: string, uploadId: string): Promise<UploadedPart[]> {
    const upload = this.multipart.get(uploadId);
    if (!upload) return Promise.reject(new Error('NoSuchUpload'));
    return Promise.resolve(
      [...upload.parts.entries()]
        .sort(([a], [b]) => a - b)
        .map(([partNumber, bytes]) => ({
          partNumber,
          etag: `"etag-${partNumber}"`,
          size: bytes.length,
        })),
    );
  }

  override async completeUpload(
    key: string,
    uploadId: string,
    expectedBytes: number,
  ): Promise<void> {
    const parts = await this.listParts(key, uploadId);
    const problem = BookFilesService.partsProblem(parts, expectedBytes);
    if (problem) throw new UploadIncompleteError(problem);
    const upload = this.multipart.get(uploadId)!;
    this.objects.set(
      key,
      Buffer.concat(parts.map((p) => upload.parts.get(p.partNumber)!)),
    );
    this.multipart.delete(uploadId);
  }

  override abortUpload(_key: string, uploadId: string): Promise<void> {
    this.aborted.push(uploadId);
    this.multipart.delete(uploadId);
    return Promise.resolve();
  }

  override size(key: string): Promise<number | null> {
    return Promise.resolve(this.objects.get(key)?.length ?? null);
  }

  override async download(key: string): Promise<Uint8Array> {
    this.downloads += 1;
    if (this.onDownload) await this.onDownload();
    if (this.downloadError) throw this.downloadError;
    const bytes = this.objects.get(key);
    if (!bytes) throw new Error(`NoSuchKey ${key}`);
    // A copy, like a real download: callers may hand it to pdf.js, which detaches it.
    return new Uint8Array(bytes);
  }

  override signedReadUrl(key: string, seconds: number): Promise<string> {
    return Promise.resolve(`https://r2.test/${key}?X-Amz-Expires=${seconds}`);
  }

  override delete(key: string): Promise<void> {
    this.deleted.push(key);
    this.objects.delete(key);
    return Promise.resolve();
  }

  /** What the editor's browser does: start, PUT every part, complete. Returns the key. */
  async upload(
    manuscripts: ManuscriptsService,
    bookId: string,
    file: Uint8Array,
    actor: Parameters<ManuscriptsService['start']>[2],
  ): Promise<string> {
    const started = await manuscripts.start(bookId, file.length, actor);
    for (let part = 1; part <= started.partCount; part += 1) {
      const from = (part - 1) * started.partBytes;
      this.putPart(
        started.uploadId,
        part,
        file.subarray(from, from + started.partBytes),
      );
    }
    await manuscripts.complete(bookId, started.key, started.uploadId);
    return started.key;
  }
}
