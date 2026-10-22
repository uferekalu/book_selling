import type { MetadataRoute } from "next";
import { listAuthors, listCategories, orFallback, sitemapBooks } from "@/lib/catalog";
import { titlePath } from "@/lib/catalog-links";
import { SITE_URL } from "@/lib/site";

/** Public, indexable pages. Account, checkout and admin pages are deliberately left out. */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const [books, authors, categories] = await Promise.all([
    orFallback(sitemapBooks(), []),
    orFallback(listAuthors(), []),
    orFallback(listCategories(), []),
  ]);
  return [
    { url: `${SITE_URL}/`, changeFrequency: "weekly", priority: 1 },
    { url: `${SITE_URL}/books`, changeFrequency: "daily", priority: 0.9 },
    { url: `${SITE_URL}/papers`, changeFrequency: "weekly", priority: 0.8 },
    { url: `${SITE_URL}/contact`, changeFrequency: "yearly", priority: 0.3 },
    ...books.map((book) => ({
      url: `${SITE_URL}${titlePath(book.kind, book.slug)}`,
      lastModified: new Date(book.updatedAt),
      changeFrequency: "weekly" as const,
      priority: 0.8,
    })),
    ...categories
      .filter((category) => (category.bookCount ?? 0) > 0)
      .map((category) => ({ url: `${SITE_URL}/books?category=${category.slug}`, changeFrequency: "weekly" as const, priority: 0.6 })),
    ...categories
      .filter((category) => (category.paperCount ?? 0) > 0)
      .map((category) => ({ url: `${SITE_URL}/papers?category=${category.slug}`, changeFrequency: "weekly" as const, priority: 0.5 })),
    ...authors.map((author) => ({ url: `${SITE_URL}/authors/${author.slug}`, changeFrequency: "monthly" as const, priority: 0.6 })),
    ...["terms", "privacy"].map((page) => ({
      url: `${SITE_URL}/legal/${page}`,
      changeFrequency: "yearly" as const,
      priority: 0.2,
    })),
  ];
}
