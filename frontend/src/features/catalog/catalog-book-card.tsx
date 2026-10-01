import { BookCard } from "@/components/ui";
import type { BookCardData } from "@/lib/catalog-types";

/** Maps API book data to the kit's BookCard (one place, so every grid looks the same). */
export function CatalogBookCard({ book, priority }: { book: BookCardData; priority?: boolean }) {
  if (!book.fromPrice) return null;
  return (
    <BookCard
      href={`/books/${book.slug}`}
      title={book.title}
      author={book.authors.map((a) => a.name).join(", ")}
      coverSrc={book.cover?.src}
      coverBlurDataUrl={book.cover?.blurDataUrl}
      coverDominantColor={book.cover?.dominantColor}
      price={book.fromPrice}
      compareAt={book.compareAt}
      priceIsFrom={book.priceIsFrom}
      rating={book.rating}
      formats={book.formats}
      highlight={book.featured ? "Featured" : book.isNew ? "New" : undefined}
      priority={priority}
    />
  );
}

/** Responsive grid: 2 columns on a phone, up to 5 on a wide screen. */
export function BookGrid({ books, priorityCount = 0 }: { books: BookCardData[]; priorityCount?: number }) {
  return (
    <ul className="grid grid-cols-2 gap-x-4 gap-y-8 sm:grid-cols-3 sm:gap-x-6 lg:grid-cols-4 xl:grid-cols-5">
      {books.map((book, index) => (
        <li key={book.id}>
          <CatalogBookCard book={book} priority={index < priorityCount} />
        </li>
      ))}
    </ul>
  );
}
