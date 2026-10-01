import {
  BadRequestException,
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { v2 as cloudinary } from 'cloudinary';

export const UPLOAD_KINDS = [
  'cover',
  'gallery',
  'author-photo',
  'manuscript',
] as const;
export type UploadKind = (typeof UPLOAD_KINDS)[number];

interface KindRules {
  resourceType: 'image';
  /** `authenticated` assets are never publicly addressable (the manuscript). */
  deliveryType: 'upload' | 'authenticated';
  formats: string[];
  folder: (ownerId: string) => string;
  maxBytes: (config: { imageMax: number; manuscriptMax: number }) => number;
  minWidth?: number;
  minHeight?: number;
}

const RULES: Record<UploadKind, KindRules> = {
  cover: {
    resourceType: 'image',
    deliveryType: 'upload',
    formats: ['jpg', 'png', 'webp'],
    folder: (id) => `books/${id}/images`,
    maxBytes: (c) => c.imageMax,
    minWidth: 1200,
    minHeight: 1800,
  },
  gallery: {
    resourceType: 'image',
    deliveryType: 'upload',
    formats: ['jpg', 'png', 'webp'],
    folder: (id) => `books/${id}/images`,
    maxBytes: (c) => c.imageMax,
    minWidth: 800,
  },
  'author-photo': {
    resourceType: 'image',
    deliveryType: 'upload',
    formats: ['jpg', 'png', 'webp'],
    folder: (id) => `authors/${id}`,
    maxBytes: (c) => c.imageMax,
    minWidth: 400,
    minHeight: 400,
  },
  // Cloudinary treats a PDF as a multi-page image: it reports the page count and can render
  // pages as thumbnails (the admin preview picker, BS-6).
  manuscript: {
    resourceType: 'image',
    deliveryType: 'authenticated',
    formats: ['pdf'],
    folder: (id) => `books/${id}/manuscript`,
    maxBytes: (c) => c.manuscriptMax,
  },
};

export interface PendingAsset {
  publicId: string;
  deliveryType: 'upload' | 'authenticated';
}

export interface UploadTicket {
  uploadUrl: string;
  /** Form fields to send with the file, exactly as given (they're signed). */
  fields: Record<string, string>;
  maxBytes: number;
  /** Files larger than this are sent in chunks (resumable, survives flaky mobile connections). */
  chunkBytes: number;
  allowedFormats: string[];
}

export interface VerifiedAsset {
  publicId: string;
  version: number;
  format: string;
  bytes: number;
  width: number;
  height: number;
  pages: number;
  etag: string;
  dominantColor: string | null;
}

const CHUNK_BYTES = 6 * 1024 * 1024;

/**
 * The only code that talks to Cloudinary (docs/ARCHITECTURE.md §10.0). The secret never leaves
 * the server: browsers upload straight to Cloudinary with a short-lived signature that pins the
 * folder, delivery type and formats, then the API re-checks the stored asset before using it.
 */
@Injectable()
export class CloudinaryService {
  private readonly logger = new Logger(CloudinaryService.name);
  readonly configured: boolean;
  readonly cloudName: string | undefined;
  private readonly root: string;
  private readonly limits: { imageMax: number; manuscriptMax: number };

  constructor(config: ConfigService) {
    this.cloudName = config.get<string>('CLOUDINARY_CLOUD_NAME');
    const apiKey = config.get<string>('CLOUDINARY_API_KEY');
    const apiSecret = config.get<string>('CLOUDINARY_API_SECRET');
    this.configured = Boolean(this.cloudName && apiKey && apiSecret);
    this.root = (
      config.get<string>('CLOUDINARY_FOLDER') ?? 'book-selling/development'
    ).replace(/\/+$/, '');
    this.limits = {
      imageMax: (config.get<number>('IMAGE_MAX_MB') ?? 15) * 1024 * 1024,
      manuscriptMax:
        (config.get<number>('MANUSCRIPT_MAX_MB') ?? 100) * 1024 * 1024,
    };
    if (this.configured) {
      cloudinary.config({
        cloud_name: this.cloudName,
        api_key: apiKey,
        api_secret: apiSecret,
        secure: true,
      });
    }
  }

  folderFor(kind: UploadKind, ownerId: string): string {
    return `${this.root}/${RULES[kind].folder(ownerId)}`;
  }

  /** A signed, single-purpose upload ticket. Cloudinary accepts it for one hour after `timestamp`. */
  signUpload(
    kind: UploadKind,
    ownerId: string,
    now = Date.now(),
  ): UploadTicket {
    this.assertConfigured();
    const rules = RULES[kind];
    const params: Record<string, string> = {
      timestamp: String(Math.floor(now / 1000)),
      folder: this.folderFor(kind, ownerId),
      type: rules.deliveryType,
      allowed_formats: rules.formats.join(','),
      // Untagged later by `markAttached`; anything still `pending` after a day is cleaned up.
      tags: 'pending',
      unique_filename: 'true',
      overwrite: 'false',
    };
    const signature = cloudinary.utils.api_sign_request(
      params,
      cloudinary.config().api_secret as string,
    );
    return {
      uploadUrl: `https://api.cloudinary.com/v1_1/${this.cloudName}/${rules.resourceType}/upload`,
      fields: {
        ...params,
        api_key: cloudinary.config().api_key as string,
        signature,
      },
      maxBytes: rules.maxBytes(this.limits),
      chunkBytes: CHUNK_BYTES,
      allowedFormats: rules.formats,
    };
  }

  /**
   * Looks the asset up through the Admin API (never trusting what the browser reports) and checks
   * it is where this upload kind belongs, in an allowed format, within size limits and big enough.
   */
  async verify(
    kind: UploadKind,
    ownerId: string,
    publicId: string,
  ): Promise<VerifiedAsset> {
    this.assertConfigured();
    const rules = RULES[kind];
    if (!publicId.startsWith(`${this.folderFor(kind, ownerId)}/`)) {
      throw new BadRequestException(
        'That file was not uploaded for this item. Please upload it again.',
      );
    }
    let resource: Record<string, unknown>;
    try {
      resource = (await cloudinary.api.resource(publicId, {
        resource_type: rules.resourceType,
        type: rules.deliveryType,
        colors: true,
      })) as Record<string, unknown>;
    } catch (error) {
      this.logger.warn(
        `Cloudinary lookup failed for ${publicId}: ${(error as Error).message}`,
      );
      throw new BadRequestException(
        'The uploaded file could not be found. Please upload it again.',
      );
    }
    const asset: VerifiedAsset = {
      publicId,
      version: Number(resource.version),
      format:
        typeof resource.format === 'string'
          ? resource.format.toLowerCase()
          : '',
      bytes: Number(resource.bytes ?? 0),
      width: Number(resource.width ?? 0),
      height: Number(resource.height ?? 0),
      pages: Number(resource.pages ?? 1),
      etag: typeof resource.etag === 'string' ? resource.etag : '',
      dominantColor: CloudinaryService.dominantColor(resource.colors),
    };
    const problem = CloudinaryService.problemWith(
      asset,
      rules,
      rules.maxBytes(this.limits),
    );
    if (problem) {
      await this.destroy(kind, publicId);
      throw new BadRequestException(problem);
    }
    return asset;
  }

  static problemWith(
    asset: VerifiedAsset,
    rules: KindRules,
    maxBytes: number,
  ): string | null {
    const format = asset.format === 'jpeg' ? 'jpg' : asset.format;
    if (!rules.formats.includes(format))
      return `Upload a ${rules.formats.join(', ').toUpperCase()} file.`;
    if (asset.bytes > maxBytes) {
      return `That file is ${(asset.bytes / 1_048_576).toFixed(1)} MB; the limit is ${Math.floor(maxBytes / 1_048_576)} MB.`;
    }
    if (rules.minWidth && asset.width < rules.minWidth) {
      return `The image is ${asset.width}×${asset.height}px; use one at least ${rules.minWidth}px wide${rules.minHeight ? ` and ${rules.minHeight}px tall` : ''} so it stays sharp on high-resolution screens.`;
    }
    if (rules.minHeight && asset.height < rules.minHeight) {
      return `The image is ${asset.width}×${asset.height}px; use one at least ${rules.minHeight}px tall.`;
    }
    if (format === 'pdf' && asset.pages < 1)
      return 'That PDF has no readable pages.';
    return null;
  }

  private static dominantColor(colors: unknown): string | null {
    if (!Array.isArray(colors) || !Array.isArray(colors[0])) return null;
    const hex = String(colors[0][0]);
    return /^#[0-9a-f]{6}$/i.test(hex) ? hex.toLowerCase() : null;
  }

  /** Removes the `pending` tag so the cleanup job keeps this asset. */
  async markAttached(kind: UploadKind, publicId: string): Promise<void> {
    const rules = RULES[kind];
    await cloudinary.uploader.remove_tag('pending', [publicId], {
      resource_type: rules.resourceType,
      type: rules.deliveryType,
    });
  }

  /**
   * Uploads still tagged `pending` (never attached to a book or author) that are older than
   * `olderThan`, within this environment's folder only. At most `maxPages` × 500 per call; the
   * next run picks up the rest.
   */
  async stalePendingAssets(
    olderThan: Date,
    maxPages = 4,
  ): Promise<PendingAsset[]> {
    if (!this.configured) return [];
    const found: PendingAsset[] = [];
    for (const deliveryType of ['upload', 'authenticated'] as const) {
      let cursor: string | undefined;
      for (let page = 0; page < maxPages; page += 1) {
        const result = (await cloudinary.api.resources_by_tag('pending', {
          resource_type: 'image',
          type: deliveryType,
          max_results: 500,
          ...(cursor ? { next_cursor: cursor } : {}),
        })) as {
          resources?: Array<{ public_id: string; created_at: string }>;
          next_cursor?: string;
        };
        for (const resource of result.resources ?? []) {
          if (
            resource.public_id.startsWith(`${this.root}/`) &&
            new Date(resource.created_at) < olderThan
          ) {
            found.push({ publicId: resource.public_id, deliveryType });
          }
        }
        cursor = result.next_cursor;
        if (!cursor) break;
      }
    }
    return found;
  }

  /** Deletes one asset by its delivery type (for the cleanup job, which has no upload kind). */
  async destroyAsset(asset: PendingAsset): Promise<void> {
    if (!this.configured) return;
    await cloudinary.uploader.destroy(asset.publicId, {
      resource_type: 'image',
      type: asset.deliveryType,
      invalidate: true,
    });
  }

  async destroy(kind: UploadKind, publicId: string): Promise<void> {
    if (!this.configured) return;
    const rules = RULES[kind];
    try {
      await cloudinary.uploader.destroy(publicId, {
        resource_type: rules.resourceType,
        type: rules.deliveryType,
        invalidate: true,
      });
    } catch (error) {
      this.logger.warn(
        `Could not delete ${publicId}: ${(error as Error).message}`,
      );
    }
  }

  /** Public delivery URL with an optional crop, before responsive sizing (the frontend adds width). */
  imageUrl(
    publicId: string,
    version: number,
    crop?: { x: number; y: number; width: number; height: number } | null,
  ): string | null {
    if (!this.cloudName) return null;
    const cropSegment = crop
      ? `c_crop,x_${crop.x},y_${crop.y},w_${crop.width},h_${crop.height}/`
      : '';
    return `https://res.cloudinary.com/${this.cloudName}/image/upload/${cropSegment}v${version}/${publicId}`;
  }

  /**
   * A ~24px, heavily blurred copy as a base64 data URI, shown instantly while the real cover
   * loads. Optional: on any failure the card falls back to its dominant colour.
   */
  async blurDataUrl(
    publicId: string,
    version: number,
    crop?: { x: number; y: number; width: number; height: number } | null,
  ): Promise<string | null> {
    const base = this.imageUrl(publicId, version, crop);
    if (!base) return null;
    // Chained after the crop, so the placeholder matches the cropped cover.
    const url = base.replace(
      `/v${version}/`,
      `/w_24,e_blur:400,q_30,f_jpg/v${version}/`,
    );
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(5000) });
      if (!response.ok) return null;
      const bytes = Buffer.from(await response.arrayBuffer());
      return bytes.length < 4096
        ? `data:image/jpeg;base64,${bytes.toString('base64')}`
        : null;
    } catch {
      return null;
    }
  }

  /** Short-lived signed download URL for an authenticated asset (manuscript; BS-6/BS-9). */
  privateDownloadUrl(
    publicId: string,
    format: string,
    expiresInSeconds = 300,
  ): string {
    this.assertConfigured();
    return cloudinary.utils.private_download_url(publicId, format, {
      resource_type: 'image',
      type: 'authenticated',
      expires_at: Math.floor(Date.now() / 1000) + expiresInSeconds,
    });
  }

  private assertConfigured(): void {
    if (!this.configured) {
      throw new ServiceUnavailableException(
        'File uploads are not configured on this server (Cloudinary settings missing).',
      );
    }
  }
}
