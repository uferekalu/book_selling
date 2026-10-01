"use client";

import NextLink from "next/link";
import { useEffect, useSyncExternalStore } from "react";
import { BookCover, Section } from "@/components/ui";
import { getViewedServerSnapshot, getViewedSnapshot, recordViewed, subscribeViewed, type ViewedBook } from "@/lib/recently-viewed";

/** Adds the current book to this browser's history. Renders nothing. */
export function RecordView({ book }: { book: ViewedBook }) {
  const { slug, title, author, coverSrc, coverBlurDataUrl, coverDominantColor } = book;
  useEffect(() => {
    recordViewed({ slug, title, author, coverSrc, coverBlurDataUrl, coverDominantColor });
  }, [slug, title, author, coverSrc, coverBlurDataUrl, coverDominantColor]);
  return null;
}

/** A sideways-scrolling row of covers; hidden until there is something to show. */
export function RecentlyViewed({ exclude }: { exclude?: string }) {
  const all = useSyncExternalStore(subscribeViewed, getViewedSnapshot, getViewedServerSnapshot);
  const books = all.filter((b) => b.slug !== exclude).slice(0, 10);
  if (books.length === 0) return null;

  return (
    <Section eyebrow="Pick up where you left off" title="Recently viewed" className="border-t border-border">
      <ul className="scrollbar-none -mx-4 flex snap-x gap-4 overflow-x-auto px-4 pb-2 sm:-mx-6 sm:gap-6 sm:px-6">
        {books.map((book) => (
          <li key={book.slug} className="w-28 shrink-0 snap-start sm:w-36">
            <NextLink href={`/books/${book.slug}`} aria-label={book.title} className="group flex flex-col gap-2 rounded-sm">
              <BookCover
                title={book.title}
                author={book.author}
                src={book.coverSrc}
                blurDataUrl={book.coverBlurDataUrl}
                dominantColor={book.coverDominantColor}
                size="fluid"
              />
              <span className="line-clamp-2 font-display text-sm leading-snug text-text group-hover:text-primary">{book.title}</span>
            </NextLink>
          </li>
        ))}
      </ul>
    </Section>
  );
}
