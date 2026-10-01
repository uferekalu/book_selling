import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

/**
 * Catalogue pages are cached by the storefront (fast, cheap). After an admin edit, this tells the
 * storefront to refresh them at once instead of waiting for the cache to expire. Fire-and-forget:
 * a failure only delays the update until the cache's own expiry (5 minutes), so it never blocks or
 * fails the admin's save.
 */
@Injectable()
export class StorefrontRevalidator {
  private readonly logger = new Logger(StorefrontRevalidator.name);
  private readonly endpoint: string;
  private readonly secret: string | undefined;

  constructor(config: ConfigService) {
    this.endpoint = `${config.getOrThrow<string>('FRONTEND_URL').replace(/\/+$/, '')}/internal/revalidate`;
    this.secret = config.get<string>('FRONTEND_REVALIDATE_SECRET') || undefined;
  }

  notify(tags: string[]): void {
    if (!this.secret || tags.length === 0) return;
    void fetch(this.endpoint, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-revalidate-secret': this.secret,
      },
      body: JSON.stringify({ tags: [...new Set(tags)] }),
      signal: AbortSignal.timeout(5000),
    })
      .then((response) => {
        if (!response.ok)
          this.logger.warn(
            `Storefront revalidation returned ${response.status}`,
          );
      })
      .catch((error: unknown) =>
        this.logger.warn(
          `Storefront revalidation failed: ${(error as Error).message}`,
        ),
      );
  }
}

/** Cache tags shared with the storefront's fetches (frontend/src/lib/catalog.ts). */
export const CATALOG_TAGS = {
  all: 'catalog',
  book: (slug: string) => `book:${slug}`,
  author: (slug: string) => `author:${slug}`,
} as const;
