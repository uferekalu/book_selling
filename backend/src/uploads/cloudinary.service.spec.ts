import { ConfigService } from '@nestjs/config';
import { v2 as cloudinary } from 'cloudinary';
import { CloudinaryService, UPLOAD_KINDS } from './cloudinary.service.js';

const config = (overrides: Record<string, unknown> = {}) =>
  new ConfigService({
    CLOUDINARY_CLOUD_NAME: 'books-cloud',
    CLOUDINARY_API_KEY: '1234567890',
    CLOUDINARY_API_SECRET: 'top-secret-value',
    CLOUDINARY_FOLDER: 'book-selling/test',
    IMAGE_MAX_MB: 15,
    ...overrides,
  });

const BOOK = '64b000000000000000000abc';

describe('CloudinaryService', () => {
  afterEach(() => vi.restoreAllMocks());

  it('is disabled (503) without credentials', () => {
    const media = new CloudinaryService(new ConfigService({}));
    expect(media.configured).toBe(false);
    expect(() => media.signUpload('cover', BOOK)).toThrow(/not configured/);
  });

  it('signs a cover upload pinned to the book folder, public delivery and image formats', () => {
    const media = new CloudinaryService(config());
    const ticket = media.signUpload('cover', BOOK, 1_790_000_000_000);
    expect(ticket.uploadUrl).toBe(
      'https://api.cloudinary.com/v1_1/books-cloud/image/upload',
    );
    expect(ticket.fields).toMatchObject({
      folder: `book-selling/test/books/${BOOK}/images`,
      type: 'upload',
      allowed_formats: 'jpg,png,webp',
      tags: 'pending',
      timestamp: '1790000000',
      api_key: '1234567890',
    });
    expect(ticket.maxBytes).toBe(15 * 1024 * 1024);
    // The signature matches Cloudinary's algorithm over every signed field.
    const { signature, api_key: _key, ...signed } = ticket.fields;
    expect(signature).toBe(
      cloudinary.utils.api_sign_request(signed, 'top-secret-value'),
    );
    // The secret itself never leaves the server.
    expect(JSON.stringify(ticket)).not.toContain('top-secret-value');
  });

  it('rejects an asset from another folder without asking Cloudinary', async () => {
    const media = new CloudinaryService(config());
    const lookup = vi.spyOn(cloudinary.api, 'resource');
    await expect(
      media.verify('cover', BOOK, 'book-selling/test/books/other/images/x'),
    ).rejects.toThrow(/not uploaded for this item/);
    expect(lookup).not.toHaveBeenCalled();
  });

  it('verifies with the Admin API and deletes an asset that breaks the rules', async () => {
    const media = new CloudinaryService(config());
    vi.spyOn(cloudinary.api, 'resource').mockResolvedValue({
      version: 3,
      format: 'jpg',
      bytes: 900_000,
      width: 600,
      height: 900,
      etag: 'e',
      colors: [['#6F4527', 40]],
    });
    const destroy = vi
      .spyOn(cloudinary.uploader, 'destroy')
      .mockResolvedValue({ result: 'ok' });
    const publicId = `book-selling/test/books/${BOOK}/images/small`;
    await expect(media.verify('cover', BOOK, publicId)).rejects.toThrow(
      /600×900px.*at least 1200px wide/,
    );
    expect(destroy).toHaveBeenCalledWith(
      publicId,
      expect.objectContaining({ type: 'upload', invalidate: true }),
    );
  });

  it('returns verified metadata including the dominant colour', async () => {
    const media = new CloudinaryService(config());
    vi.spyOn(cloudinary.api, 'resource').mockResolvedValue({
      version: 9,
      format: 'jpg',
      bytes: 2_000_000,
      width: 1600,
      height: 2400,
      colors: [['#F2E8DC', 60]],
    });
    const asset = await media.verify(
      'cover',
      BOOK,
      `book-selling/test/books/${BOOK}/images/cover`,
    );
    expect(asset).toMatchObject({
      version: 9,
      format: 'jpg',
      width: 1600,
      dominantColor: '#f2e8dc',
    });
  });

  it('only takes images: book PDFs go to private R2 storage instead', () => {
    expect(UPLOAD_KINDS).toEqual(['cover', 'gallery', 'author-photo']);
  });

  it('rejects files over the limit and the wrong format', () => {
    const rules = { formats: ['jpg', 'png'], folder: () => '' };
    const base = {
      publicId: 'x',
      version: 1,
      width: 2000,
      height: 3000,
      dominantColor: null,
    };
    expect(
      CloudinaryService.problemWith(
        { ...base, format: 'jpg', bytes: 12 * 1_048_576 },
        rules,
        10 * 1_048_576,
      ),
    ).toMatch(/12\.0 MB; the limit is 10 MB/);
    expect(
      CloudinaryService.problemWith(
        { ...base, format: 'pdf', bytes: 10 },
        rules,
        10 * 1_048_576,
      ),
    ).toMatch(/Upload a JPG, PNG/);
  });

  it('builds delivery URLs with the crop first, so later resizing applies to the cropped cover', () => {
    const media = new CloudinaryService(config());
    expect(
      media.imageUrl('book-selling/test/books/x/images/c', 5, {
        x: 10,
        y: 20,
        width: 1200,
        height: 1800,
      }),
    ).toBe(
      'https://res.cloudinary.com/books-cloud/image/upload/c_crop,x_10,y_20,w_1200,h_1800/v5/book-selling/test/books/x/images/c',
    );
    expect(media.imageUrl('p', 1)).toBe(
      'https://res.cloudinary.com/books-cloud/image/upload/v1/p',
    );
  });
});
