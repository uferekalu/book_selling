import type { BookKind } from "./catalog-types";

/**
 * Where a title lives (BS-34): textbooks under /books, conference and workshop papers under /papers.
 * A paper opened at /books/<slug> redirects, so an older link still lands on the right page.
 */
export function titlePath(kind: BookKind | undefined, slug: string): string {
  return `${kind === "paper" ? "/papers" : "/books"}/${slug}`;
}

/** The free preview reader for a title. */
export function readPath(kind: BookKind | undefined, slug: string): string {
  return `${titlePath(kind, slug)}/read`;
}
