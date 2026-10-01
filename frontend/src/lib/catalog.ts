import "server-only";
import { notFound } from "next/navigation";
import { getBackendUrl } from "@/lib/backend-url";
import type { Currency } from "@/lib/money";
import type { BookFilters, BookPage, PublicAuthor, PublicBook, PublicCategory } from "./catalog-types";

/**
 * Server-side catalogue reads. Responses are cached and tagged, and the API refreshes the tags
 * after every admin edit (POST /internal/revalidate), with a 5-minute expiry as a safety net.
 * Tag names match backend/src/catalog/storefront-revalidator.ts.
 */
export const CATALOG_TAG = "catalog";
export const bookTag = (slug: string) => `book:${slug}`;
export const authorTag = (slug: string) => `author:${slug}`;
const REVALIDATE_SECONDS = 300;

export class CatalogUnavailableError extends Error {}

async function get<T>(path: string, tags: string[]): Promise<T | null> {
  let response: Response;
  try {
    response = await fetch(`${getBackendUrl()}${path}`, {
      cache: "force-cache",
      next: { revalidate: REVALIDATE_SECONDS, tags: [CATALOG_TAG, ...tags] },
      headers: { accept: "application/json" },
    });
  } catch (error) {
    throw new CatalogUnavailableError(`Catalogue request failed: ${(error as Error).message}`);
  }
  if (response.status === 404) return null;
  if (!response.ok) throw new CatalogUnavailableError(`Catalogue request ${path} returned ${response.status}`);
  return (await response.json()) as T;
}

function query(params: Record<string, string | number | boolean | undefined>): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== "") search.set(key, String(value));
  }
  const text = search.toString();
  return text ? `?${text}` : "";
}

export async function listBooks(filters: BookFilters): Promise<BookPage> {
  const page = await get<BookPage>(`/catalog/books${query({ ...filters })}`, []);
  return page ?? { items: [], total: 0, page: 1, pageSize: filters.pageSize ?? 20, totalPages: 0 };
}

/** The book, or a redirect target when it was renamed; 404s go to the not-found page. */
export async function getBook(slug: string, currency: Currency): Promise<{ book: PublicBook } | { redirectTo: string }> {
  const result = await get<{ book: PublicBook } | { redirectTo: string }>(
    `/catalog/books/${encodeURIComponent(slug)}${query({ currency })}`,
    [bookTag(slug)],
  );
  if (!result) notFound();
  return result;
}

export async function relatedBooks(slug: string, currency: Currency) {
  return (await get<BookPage["items"]>(`/catalog/books/${encodeURIComponent(slug)}/related${query({ currency })}`, [bookTag(slug)])) ?? [];
}

export async function listCategories(): Promise<PublicCategory[]> {
  return (await get<PublicCategory[]>("/catalog/categories", [])) ?? [];
}

export async function listAuthors(): Promise<PublicAuthor[]> {
  return (await get<PublicAuthor[]>("/catalog/authors", [])) ?? [];
}

export async function getAuthor(slug: string): Promise<PublicAuthor> {
  const author = await get<PublicAuthor>(`/catalog/authors/${encodeURIComponent(slug)}`, [authorTag(slug)]);
  if (!author) notFound();
  return author;
}

export async function sitemapBooks(): Promise<Array<{ slug: string; updatedAt: string }>> {
  return (await get<Array<{ slug: string; updatedAt: string }>>("/catalog/sitemap", [])) ?? [];
}

/** Runs a catalogue read and returns `fallback` if the API is unreachable, so a page still renders. */
export async function orFallback<T>(read: Promise<T>, fallback: T): Promise<T> {
  try {
    return await read;
  } catch (error) {
    if (error instanceof CatalogUnavailableError) {
      console.error(error.message);
      return fallback;
    }
    throw error;
  }
}
