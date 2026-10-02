import { randomBytes } from 'node:crypto';
import {
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  AbortMultipartUploadCommand,
  CompleteMultipartUploadCommand,
  CreateMultipartUploadCommand,
  DeleteObjectCommand,
  PutObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  ListObjectsV2Command,
  ListPartsCommand,
  S3Client,
  UploadPartCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

/** Every part but the last has exactly this size (S3/R2 rule: at least 5 MiB). */
export const PART_BYTES = 8 * 1024 * 1024;
/** Signed part URLs stay valid this long; the browser asks for fresh ones as it goes. */
export const PART_URL_SECONDS = 60 * 60;
const MAX_PARTS = 10_000;

export interface StartedUpload {
  key: string;
  uploadId: string;
  partBytes: number;
  partCount: number;
}

export interface UploadedPart {
  partNumber: number;
  etag: string;
  size: number;
}

export class UploadIncompleteError extends Error {}

/**
 * The private book files (manuscript PDFs) in Cloudflare R2 (docs/ARCHITECTURE.md §10.0). Nothing
 * here is public: the bucket has no public access, the browser uploads with short-lived signed
 * part URLs, and files are read by the server or through short-lived signed links.
 *
 * R2 speaks the S3 API, so `R2_ENDPOINT` can point at any S3-compatible store (e.g. MinIO locally).
 */
@Injectable()
export class BookFilesService {
  private readonly logger = new Logger(BookFilesService.name);
  readonly configured: boolean;
  readonly maxManuscriptBytes: number;
  /** Optional cap on everything this environment stores (`R2_STORAGE_LIMIT_MB`); null = none. */
  readonly storageLimitBytes: number | null;
  private readonly root: string;
  private readonly bucket: string;
  private readonly client: S3Client | null;

  constructor(config: ConfigService) {
    const accountId = config.get<string>('R2_ACCOUNT_ID');
    const endpoint =
      config.get<string>('R2_ENDPOINT') ||
      (accountId ? `https://${accountId}.r2.cloudflarestorage.com` : '');
    const accessKeyId = config.get<string>('R2_ACCESS_KEY_ID');
    const secretAccessKey = config.get<string>('R2_SECRET_ACCESS_KEY');
    this.bucket = config.get<string>('R2_BUCKET') ?? '';
    this.root = (
      config.get<string>('R2_FOLDER') ?? 'book-selling/development'
    ).replace(/\/+$/, '');
    this.maxManuscriptBytes =
      (config.get<number>('MANUSCRIPT_MAX_MB') ?? 200) * 1024 * 1024;
    const limitMb = config.get<number>('R2_STORAGE_LIMIT_MB');
    this.storageLimitBytes = limitMb ? limitMb * 1024 * 1024 : null;
    this.configured = Boolean(
      endpoint && accessKeyId && secretAccessKey && this.bucket,
    );
    this.client = this.configured
      ? new S3Client({
          region: 'auto',
          endpoint,
          forcePathStyle: true,
          credentials: {
            accessKeyId: accessKeyId!,
            secretAccessKey: secretAccessKey!,
          },
          // Without this the SDK adds checksum parameters to signed part URLs that a browser
          // upload can't satisfy (Cloudflare's recommended settings for R2).
          requestChecksumCalculation: 'WHEN_REQUIRED',
          responseChecksumValidation: 'WHEN_REQUIRED',
          requestHandler: {
            connectionTimeout: 10_000,
            requestTimeout: 300_000,
          },
        })
      : null;
  }

  /** Where a book's manuscript uploads live; a key outside it is never accepted for that book. */
  manuscriptPrefix(bookId: string): string {
    return `${this.root}/books/${bookId}/manuscript/`;
  }

  isManuscriptKey(bookId: string, key: string): boolean {
    const prefix = this.manuscriptPrefix(bookId);
    return (
      key.startsWith(prefix) &&
      /^[a-f0-9]{32}\.pdf$/.test(key.slice(prefix.length))
    );
  }

  static partCount(bytes: number): number {
    return Math.max(1, Math.ceil(bytes / PART_BYTES));
  }

  /** Opens a multipart upload under a fresh, unguessable key for this book. */
  async startManuscriptUpload(
    bookId: string,
    bytes: number,
  ): Promise<StartedUpload> {
    const client = this.require();
    const partCount = BookFilesService.partCount(bytes);
    if (partCount > MAX_PARTS) throw new Error('File too large for upload');
    const key = `${this.manuscriptPrefix(bookId)}${randomBytes(16).toString('hex')}.pdf`;
    const result = await client.send(
      new CreateMultipartUploadCommand({
        Bucket: this.bucket,
        Key: key,
        ContentType: 'application/pdf',
      }),
    );
    if (!result.UploadId) throw new Error('R2 did not start the upload');
    return { key, uploadId: result.UploadId, partBytes: PART_BYTES, partCount };
  }

  async signParts(
    key: string,
    uploadId: string,
    partNumbers: number[],
  ): Promise<Array<{ partNumber: number; url: string }>> {
    const client = this.require();
    return Promise.all(
      partNumbers.map(async (partNumber) => ({
        partNumber,
        url: await getSignedUrl(
          client,
          new UploadPartCommand({
            Bucket: this.bucket,
            Key: key,
            UploadId: uploadId,
            PartNumber: partNumber,
          }),
          { expiresIn: PART_URL_SECONDS },
        ),
      })),
    );
  }

  /** The parts R2 actually holds (never what the browser says it sent). */
  async listParts(key: string, uploadId: string): Promise<UploadedPart[]> {
    const client = this.require();
    const parts: UploadedPart[] = [];
    let marker: string | undefined;
    for (;;) {
      const page = await client.send(
        new ListPartsCommand({
          Bucket: this.bucket,
          Key: key,
          UploadId: uploadId,
          PartNumberMarker: marker,
        }),
      );
      for (const part of page.Parts ?? []) {
        parts.push({
          partNumber: Number(part.PartNumber),
          etag: String(part.ETag),
          size: Number(part.Size ?? 0),
        });
      }
      if (!page.IsTruncated || !page.NextPartNumberMarker) break;
      marker = String(page.NextPartNumberMarker);
    }
    return parts.sort((a, b) => a.partNumber - b.partNumber);
  }

  /**
   * Joins the parts into the final file, after checking every part is there with the exact sizes
   * the declared file size implies. Throws `UploadIncompleteError` (and leaves the upload open, so
   * the browser can resend a part) when they don't add up.
   */
  async completeUpload(
    key: string,
    uploadId: string,
    expectedBytes: number,
  ): Promise<void> {
    const client = this.require();
    const parts = await this.listParts(key, uploadId);
    const problem = BookFilesService.partsProblem(parts, expectedBytes);
    if (problem) throw new UploadIncompleteError(problem);
    await client.send(
      new CompleteMultipartUploadCommand({
        Bucket: this.bucket,
        Key: key,
        UploadId: uploadId,
        MultipartUpload: {
          Parts: parts.map((p) => ({ PartNumber: p.partNumber, ETag: p.etag })),
        },
      }),
    );
  }

  static partsProblem(
    parts: UploadedPart[],
    expectedBytes: number,
  ): string | null {
    const count = BookFilesService.partCount(expectedBytes);
    if (parts.length !== count) {
      return `${parts.length} of ${count} pieces arrived`;
    }
    for (const [index, part] of parts.entries()) {
      const isLast = index === count - 1;
      const size = isLast
        ? expectedBytes - PART_BYTES * (count - 1)
        : PART_BYTES;
      if (part.partNumber !== index + 1 || part.size !== size) {
        return `piece ${index + 1} is incomplete`;
      }
    }
    return null;
  }

  /**
   * An already finished or aborted upload is not an error. Other failures are logged, or thrown
   * with `strict` (the cleanup job keeps its record and tries again next hour).
   */
  async abortUpload(
    key: string,
    uploadId: string,
    { strict = false } = {},
  ): Promise<void> {
    if (!this.client) return;
    try {
      await this.client.send(
        new AbortMultipartUploadCommand({
          Bucket: this.bucket,
          Key: key,
          UploadId: uploadId,
        }),
      );
    } catch (error) {
      const name = (error as { name?: string }).name;
      if (name !== 'NoSuchUpload') {
        if (strict) throw error;
        this.logger.warn(
          `Could not abort upload ${key}: ${(error as Error).message}`,
        );
      }
    }
  }

  /**
   * Total size of the finished files in this environment's folder, read from R2 itself (so files
   * the database no longer knows about still count). One list request per 1,000 files.
   */
  async storedBytes(): Promise<number> {
    const client = this.require();
    let total = 0;
    let token: string | undefined;
    do {
      const page = await client.send(
        new ListObjectsV2Command({
          Bucket: this.bucket,
          Prefix: `${this.root}/`,
          ContinuationToken: token,
        }),
      );
      for (const object of page.Contents ?? [])
        total += Number(object.Size ?? 0);
      token = page.IsTruncated ? page.NextContinuationToken : undefined;
    } while (token);
    return total;
  }

  /** Size of a stored file, or null when it doesn't exist. */
  async size(key: string): Promise<number | null> {
    const client = this.require();
    try {
      const head = await client.send(
        new HeadObjectCommand({ Bucket: this.bucket, Key: key }),
      );
      return Number(head.ContentLength ?? 0);
    } catch (error) {
      const status = (error as { $metadata?: { httpStatusCode?: number } })
        .$metadata?.httpStatusCode;
      if (status === 404) return null;
      throw error;
    }
  }

  /** Reads a whole file on the server (preview building, checking an upload). */
  async download(key: string): Promise<Uint8Array> {
    const client = this.require();
    const result = await client.send(
      new GetObjectCommand({ Bucket: this.bucket, Key: key }),
    );
    if (!result.Body) throw new Error(`R2 returned no content for ${key}`);
    return result.Body.transformToByteArray();
  }

  /**
   * A short-lived link to read a private file. Only ever given to staff (the preview page picker)
   * and to the buyer it was made for (their library). With `downloadAs`, the browser saves the
   * file under that name instead of opening it.
   */
  async signedReadUrl(
    key: string,
    expiresInSeconds: number,
    { downloadAs }: { downloadAs?: string } = {},
  ): Promise<string> {
    const client = this.require();
    return getSignedUrl(
      client,
      new GetObjectCommand({
        Bucket: this.bucket,
        Key: key,
        ResponseContentType: 'application/pdf',
        ...(downloadAs
          ? {
              ResponseContentDisposition: `attachment; filename="${downloadAs.replace(/[^\w.-]/g, '-')}"`,
            }
          : {}),
      }),
      { expiresIn: expiresInSeconds },
    );
  }

  /** Where a buyer's personal copy is stored; a fresh random name per build. */
  copyKey(bookId: string, entitlementId: string): string {
    return `${this.root}/books/${bookId}/copies/${entitlementId}-${randomBytes(8).toString('hex')}.pdf`;
  }

  /** Stores a file the server made (a buyer's copy). */
  async put(key: string, bytes: Uint8Array): Promise<void> {
    const client = this.require();
    await client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: bytes,
        ContentType: 'application/pdf',
      }),
    );
  }

  /** Deleting a file that is already gone succeeds. Failures are logged, or thrown with `strict`. */
  async delete(key: string, { strict = false } = {}): Promise<void> {
    if (!this.client) return;
    try {
      await this.client.send(
        new DeleteObjectCommand({ Bucket: this.bucket, Key: key }),
      );
    } catch (error) {
      if (strict) throw error;
      this.logger.warn(`Could not delete ${key}: ${(error as Error).message}`);
    }
  }

  private require(): S3Client {
    if (!this.client) {
      throw new ServiceUnavailableException(
        'Book file storage is not configured on this server (Cloudflare R2 settings missing).',
      );
    }
    return this.client;
  }
}
