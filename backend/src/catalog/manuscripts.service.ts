import { createHash } from 'node:crypto';
import {
  BadRequestException,
  Injectable,
  NotFoundException,
  PayloadTooLargeException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import type { Model } from 'mongoose';
import type { AccessTokenPayload } from '../auth/interfaces/auth.types.js';
import { toObjectId } from '../common/utils/object-id.js';
import { loadPdf, PreviewBuildError } from '../preview/preview-builder.js';
import {
  BookFilesService,
  UploadIncompleteError,
} from '../uploads/book-files.service.js';
import { Book } from './schemas/book.schema.js';
import {
  ManuscriptUpload,
  type ManuscriptUploadDocument,
} from './schemas/manuscript-upload.schema.js';

/** How long the staff page picker may read the book file before asking for a new link. */
export const READ_LINK_SECONDS = 30 * 60;

export interface CheckedManuscript {
  key: string;
  bytes: number;
  pages: number;
  /** SHA-256 of the file: the preview rebuilds only when the content really changes. */
  checksum: string;
}

const PDF_MAGIC = '%PDF-';

/**
 * Book PDF uploads, straight from the editor's browser into private R2 storage
 * (ARCHITECTURE §10.0): start → sign parts → PUT each part → complete → attach. Every step checks
 * the upload belongs to the book, and the server reads the finished file itself before using it.
 */
@Injectable()
export class ManuscriptsService {
  constructor(
    private readonly files: BookFilesService,
    @InjectModel(Book.name) private readonly books: Model<Book>,
    @InjectModel(ManuscriptUpload.name)
    private readonly uploads: Model<ManuscriptUpload>,
  ) {}

  async start(bookId: string, bytes: number, actor: AccessTokenPayload) {
    const exists = await this.books
      .exists({ _id: toObjectId(bookId, 'Book') })
      .exec();
    if (!exists) throw new NotFoundException('Book not found');
    const maxBytes = this.files.maxManuscriptBytes;
    if (bytes > maxBytes) {
      throw new PayloadTooLargeException(
        `That file is ${toMb(bytes)} MB; the limit is ${toMb(maxBytes)} MB.`,
      );
    }
    const started = await this.files.startManuscriptUpload(bookId, bytes);
    await this.uploads.create({
      bookId: toObjectId(bookId, 'Book'),
      key: started.key,
      uploadId: started.uploadId,
      bytes,
      partCount: started.partCount,
      status: 'uploading',
      startedBy: actor.sub,
    });
    return { ...started, maxBytes };
  }

  async signParts(
    bookId: string,
    key: string,
    uploadId: string,
    partNumbers: number[],
  ) {
    const upload = await this.find(bookId, key, uploadId);
    if (upload.status !== 'uploading') {
      throw new BadRequestException('This upload is already finished.');
    }
    const wanted = [...new Set(partNumbers)];
    if (wanted.some((n) => n < 1 || n > upload.partCount)) {
      throw new BadRequestException(
        `Parts are numbered 1 to ${upload.partCount}.`,
      );
    }
    return {
      parts: await this.files.signParts(key, uploadId, wanted),
    };
  }

  /** Joins the parts; safe to repeat (a retried request after a dropped response). */
  async complete(bookId: string, key: string, uploadId: string) {
    const upload = await this.find(bookId, key, uploadId);
    if (upload.status === 'uploaded') return { key };
    try {
      await this.files.completeUpload(key, uploadId, upload.bytes);
    } catch (error) {
      if (error instanceof UploadIncompleteError) {
        throw new BadRequestException({
          message: `The upload didn’t finish (${error.message}). Please try again.`,
          code: 'upload_incomplete',
        });
      }
      throw error;
    }
    await this.uploads
      .updateOne(
        { _id: upload._id, status: 'uploading' },
        { $set: { status: 'uploaded' } },
      )
      .exec();
    return { key };
  }

  /** The editor cancelled or gave up: nothing of this upload is kept. */
  async abort(bookId: string, key: string, uploadId: string): Promise<void> {
    const upload = await this.find(bookId, key, uploadId);
    await this.files.abortUpload(key, uploadId);
    await this.files.delete(key);
    await this.uploads.deleteOne({ _id: upload._id }).exec();
  }

  /**
   * Reads the finished upload on the server and checks it is a usable PDF within the limit.
   * A file that fails is deleted, so a bad upload never lingers.
   */
  async check(bookId: string, key: string): Promise<CheckedManuscript> {
    const upload = this.files.isManuscriptKey(bookId, key)
      ? await this.uploads
          .findOne({
            bookId: toObjectId(bookId, 'Book'),
            key,
            status: 'uploaded',
          })
          .exec()
      : null;
    if (!upload) {
      throw new BadRequestException(
        'That file was not uploaded for this book. Please upload it again.',
      );
    }
    const bytes = await this.files.size(key);
    if (bytes === null) {
      await this.uploads.deleteOne({ _id: upload._id }).exec();
      throw new BadRequestException(
        'The uploaded file could not be found. Please upload it again.',
      );
    }
    if (bytes > this.files.maxManuscriptBytes) {
      await this.discard(key);
      throw new BadRequestException(
        `That file is ${toMb(bytes)} MB; the limit is ${toMb(this.files.maxManuscriptBytes)} MB.`,
      );
    }
    const content = await this.files.download(key);
    const read = await readPdf(content);
    if (typeof read === 'string') {
      await this.discard(key);
      throw new BadRequestException(read);
    }
    return {
      key,
      bytes,
      pages: read.pages,
      checksum: createHash('sha256').update(content).digest('hex'),
    };
  }

  /**
   * A short-lived link to the current book file, for the staff preview page picker (rendered in
   * the editor's browser). Never given to visitors or buyers.
   */
  async readLink(
    bookId: string,
    now = Date.now(),
  ): Promise<{ url: string; expiresAt: string }> {
    const book = await this.books
      .findById(toObjectId(bookId, 'Book'), { manuscript: 1 })
      .lean()
      .exec();
    if (!book) throw new NotFoundException('Book not found');
    if (!book.manuscript) {
      throw new NotFoundException('This book has no PDF yet');
    }
    return {
      url: await this.files.signedReadUrl(
        book.manuscript.key,
        READ_LINK_SECONDS,
      ),
      expiresAt: new Date(now + READ_LINK_SECONDS * 1000).toISOString(),
    };
  }

  /** The upload became the book's file: stop tracking it. */
  async attached(key: string): Promise<void> {
    await this.uploads.deleteOne({ key }).exec();
  }

  /** Deletes an upload that won't be used (refused, or identical to the current file). */
  async discard(key: string): Promise<void> {
    await this.files.delete(key);
    await this.uploads.deleteOne({ key }).exec();
  }

  private async find(
    bookId: string,
    key: string,
    uploadId: string,
  ): Promise<ManuscriptUploadDocument> {
    const upload = this.files.isManuscriptKey(bookId, key)
      ? await this.uploads
          .findOne({ bookId: toObjectId(bookId, 'Book'), key, uploadId })
          .exec()
      : null;
    if (!upload) {
      throw new NotFoundException(
        'This upload has expired or belongs to another book. Please upload the file again.',
      );
    }
    return upload;
  }
}

/** The page count, or why the file can't be used. */
async function readPdf(
  content: Uint8Array,
): Promise<{ pages: number } | string> {
  const head = Buffer.from(content.subarray(0, 1024)).toString('latin1');
  if (!head.includes(PDF_MAGIC)) return 'Upload a PDF file.';
  try {
    return { pages: (await loadPdf(content)).pages };
  } catch (error) {
    if (error instanceof PreviewBuildError) return error.message;
    throw error;
  }
}

const toMb = (bytes: number) => Math.ceil(bytes / 1_048_576);
