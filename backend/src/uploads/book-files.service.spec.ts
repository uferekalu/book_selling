import { ConfigService } from '@nestjs/config';
import {
  CompleteMultipartUploadCommand,
  ListObjectsV2Command,
  ListPartsCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import {
  BookFilesService,
  PART_BYTES,
  UploadIncompleteError,
} from './book-files.service.js';

const BOOK = '64b000000000000000000abc';
const config = (overrides: Record<string, unknown> = {}) =>
  new ConfigService({
    R2_ACCOUNT_ID: 'acct123',
    R2_ACCESS_KEY_ID: 'AKIDEXAMPLE',
    R2_SECRET_ACCESS_KEY: 'very-secret-r2-key',
    R2_BUCKET: 'book-files',
    R2_FOLDER: 'book-selling/test/',
    MANUSCRIPT_MAX_MB: 200,
    ...overrides,
  });

describe('BookFilesService (Cloudflare R2)', () => {
  afterEach(() => vi.restoreAllMocks());

  it('is disabled (503) without credentials', async () => {
    const files = new BookFilesService(new ConfigService({}));
    expect(files.configured).toBe(false);
    await expect(files.startManuscriptUpload(BOOK, 10)).rejects.toThrow(
      /Cloudflare R2 settings missing/,
    );
    // Best-effort operations quietly do nothing.
    await expect(files.delete('x')).resolves.toBeUndefined();
  });

  it('only accepts keys it would have made for that book', () => {
    const files = new BookFilesService(config());
    const prefix = `book-selling/test/books/${BOOK}/manuscript/`;
    expect(files.manuscriptPrefix(BOOK)).toBe(prefix);
    expect(files.isManuscriptKey(BOOK, `${prefix}${'a1'.repeat(16)}.pdf`)).toBe(
      true,
    );
    for (const bad of [
      `${prefix}../other/${'a1'.repeat(16)}.pdf`,
      `${prefix}${'a1'.repeat(16)}.exe`,
      `${prefix}${'A1'.repeat(16)}.pdf`,
      `${prefix}sub/${'a1'.repeat(16)}.pdf`,
      `book-selling/test/books/64b000000000000000000def/manuscript/${'a1'.repeat(16)}.pdf`,
    ]) {
      expect(files.isManuscriptKey(BOOK, bad)).toBe(false);
    }
  });

  it('counts parts and checks R2 holds every one at the exact size', () => {
    const bytes = PART_BYTES * 2 + 123;
    expect(BookFilesService.partCount(bytes)).toBe(3);
    expect(BookFilesService.partCount(PART_BYTES)).toBe(1);
    const whole = [
      { partNumber: 1, etag: 'a', size: PART_BYTES },
      { partNumber: 2, etag: 'b', size: PART_BYTES },
      { partNumber: 3, etag: 'c', size: 123 },
    ];
    expect(BookFilesService.partsProblem(whole, bytes)).toBeNull();
    expect(BookFilesService.partsProblem(whole.slice(0, 2), bytes)).toBe(
      '2 of 3 pieces arrived',
    );
    expect(
      BookFilesService.partsProblem(
        [whole[0], { ...whole[1], size: PART_BYTES - 1 }, whole[2]],
        bytes,
      ),
    ).toBe('piece 2 is incomplete');
    expect(
      BookFilesService.partsProblem(
        [whole[0], whole[2], { ...whole[1], partNumber: 4 }],
        bytes,
      ),
    ).toBe('piece 2 is incomplete');
  });

  it('signs part uploads for the browser without leaking the secret or demanding checksums', async () => {
    const files = new BookFilesService(config());
    const key = `${files.manuscriptPrefix(BOOK)}${'b2'.repeat(16)}.pdf`;
    const [signed] = await files.signParts(key, 'upload-1', [3]);
    const url = new URL(signed.url);
    expect(url.host).toBe('acct123.r2.cloudflarestorage.com');
    expect(decodeURIComponent(url.pathname)).toBe(`/book-files/${key}`);
    expect(url.searchParams.get('partNumber')).toBe('3');
    expect(url.searchParams.get('uploadId')).toBe('upload-1');
    expect(url.searchParams.get('X-Amz-Expires')).toBe('3600');
    expect(signed.url).not.toContain('very-secret-r2-key');
    // A browser PUT can't add checksum headers, so the URL must not require them.
    expect(signed.url.toLowerCase()).not.toContain('checksum');
  });

  it('joins exactly the parts R2 reports (following pagination) and refuses an incomplete set', async () => {
    const files = new BookFilesService(config());
    const bytes = PART_BYTES + 10;
    const sent: unknown[] = [];
    const send = vi
      .spyOn(S3Client.prototype, 'send')
      .mockImplementation((command: unknown) => {
        sent.push(command);
        if (command instanceof ListPartsCommand) {
          return Promise.resolve(
            command.input.PartNumberMarker
              ? {
                  Parts: [{ PartNumber: 2, ETag: '"e2"', Size: 10 }],
                  IsTruncated: false,
                }
              : {
                  Parts: [{ PartNumber: 1, ETag: '"e1"', Size: PART_BYTES }],
                  IsTruncated: true,
                  NextPartNumberMarker: '1',
                },
          );
        }
        return Promise.resolve({});
      });

    await files.completeUpload('k', 'u', bytes);
    const complete = sent.find(
      (c) => c instanceof CompleteMultipartUploadCommand,
    ) as CompleteMultipartUploadCommand;
    expect(complete.input.MultipartUpload?.Parts).toEqual([
      { PartNumber: 1, ETag: '"e1"' },
      { PartNumber: 2, ETag: '"e2"' },
    ]);

    sent.length = 0;
    send.mockClear();
    await expect(files.completeUpload('k', 'u', bytes + 1)).rejects.toThrow(
      UploadIncompleteError,
    );
    expect(sent.some((c) => c instanceof CompleteMultipartUploadCommand)).toBe(
      false,
    );
  });

  it('reports a missing file as null, and other failures as errors', async () => {
    const files = new BookFilesService(config());
    const send = vi.spyOn(S3Client.prototype, 'send');
    send.mockRejectedValueOnce(
      Object.assign(new Error('NotFound'), {
        $metadata: { httpStatusCode: 404 },
      }),
    );
    expect(await files.size('missing')).toBeNull();
    send.mockRejectedValueOnce(
      Object.assign(new Error('Forbidden'), {
        $metadata: { httpStatusCode: 403 },
      }),
    );
    await expect(files.size('forbidden')).rejects.toThrow('Forbidden');
    send.mockResolvedValueOnce({ ContentLength: 1234 } as never);
    expect(await files.size('present')).toBe(1234);
  });

  it("adds up everything stored in this environment's folder, across pages", async () => {
    const files = new BookFilesService(config({ R2_STORAGE_LIMIT_MB: 2048 }));
    expect(files.storageLimitBytes).toBe(2048 * 1024 * 1024);
    expect(new BookFilesService(config()).storageLimitBytes).toBeNull();
    const prefixes: unknown[] = [];
    vi.spyOn(S3Client.prototype, 'send').mockImplementation(
      (command: unknown) => {
        if (!(command instanceof ListObjectsV2Command))
          throw new Error('unexpected');
        prefixes.push(command.input.Prefix);
        return Promise.resolve(
          command.input.ContinuationToken
            ? { Contents: [{ Size: 5 }], IsTruncated: false }
            : {
                Contents: [{ Size: 100 }, { Size: 20 }],
                IsTruncated: true,
                NextContinuationToken: 'next',
              },
        );
      },
    );
    expect(await files.storedBytes()).toBe(125);
    expect(prefixes).toEqual(['book-selling/test/', 'book-selling/test/']);
  });

  it('deletes strictly for the cleanup job, best-effort otherwise', async () => {
    const files = new BookFilesService(config());
    vi.spyOn(S3Client.prototype, 'send').mockRejectedValue(
      new Error('R2 is down'),
    );
    await expect(files.delete('k')).resolves.toBeUndefined();
    await expect(files.delete('k', { strict: true })).rejects.toThrow(
      'R2 is down',
    );
    await expect(files.abortUpload('k', 'u')).resolves.toBeUndefined();
    await expect(files.abortUpload('k', 'u', { strict: true })).rejects.toThrow(
      'R2 is down',
    );
  });
});
