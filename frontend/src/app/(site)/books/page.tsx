import { SearchX } from "lucide-react";
import type { Metadata } from "next";
import { Suspense } from "react";
import { Breadcrumbs, ButtonLink, Container, EmptyState } from "@/components/ui";
import { BookFilters, CatalogPagination, SearchBox, SortSelect } from "@/features/catalog/book-filters";
import { BookGrid } from "@/features/catalog/catalog-book-card";
import { listBooks, listCategories, orFallback } from "@/lib/catalog";
import { BOOK_SORTS, type BookSort, type FormatType } from "@/lib/catalog-types";
import { requestCurrency } from "@/lib/request-currency";

export const metadata: Metadata = {
  title: "All books",
  description: "Foundry technology, metal casting and heat treatment books in print and as instant ebooks.",
};

const one = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value);

export default async function BooksPage({ searchParams }: PageProps<"/books">) {
  const params = await searchParams;
  const currency = await requestCurrency();
  const q = one(params.q)?.slice(0, 100) || undefined;
  const category = one(params.category) || undefined;
  const formatParam = one(params.format);
  const format: FormatType | undefined = formatParam === "ebook" || formatParam === "print" ? formatParam : undefined;
  const sortParam = one(params.sort);
  const sort = (BOOK_SORTS as readonly string[]).includes(sortParam ?? "") ? (sortParam as BookSort) : undefined;
  const page = Math.max(1, Math.min(500, Number.parseInt(one(params.page) ?? "1", 10) || 1));

  const [result, categories] = await Promise.all([
    orFallback(listBooks({ currency, q, category, format, sort, page, pageSize: 20 }), null),
    orFallback(listCategories(), []),
  ]);
  const categoryName = categories.find((c) => c.slug === category)?.name;
  const heading = q ? `Results for “${q}”` : (categoryName ?? "All books");

  return (
    <Container className="flex flex-col gap-8 py-8 sm:py-12">
      <div className="flex flex-col gap-4">
        <Breadcrumbs items={[{ label: "Home", href: "/" }, { label: "Books", href: categoryName || q ? "/books" : undefined }, ...(categoryName ? [{ label: categoryName }] : [])]} />
        <h1 className="text-5xl font-medium">{heading}</h1>
        {result && (
          <p className="text-text-muted" aria-live="polite">
            {result.total === 1 ? "1 book" : `${result.total} books`}
          </p>
        )}
      </div>

      <Suspense>
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end">
          <div className="flex-1">
            <SearchBox />
          </div>
          <SortSelect />
        </div>
      </Suspense>

      <div className="grid gap-8 lg:grid-cols-[14rem_1fr] lg:gap-12">
        <Suspense>
          <BookFilters categories={categories} />
        </Suspense>
        <div className="flex min-w-0 flex-col gap-10">
          {!result && (
            <EmptyState
              icon={SearchX}
              title="The catalogue is unavailable right now"
              description="Please try again in a moment."
              action={<ButtonLink href="/books">Try again</ButtonLink>}
            />
          )}
          {result && result.items.length === 0 && (
            <EmptyState
              icon={SearchX}
              title="No books match"
              description={q ? "Try a shorter search, or check the spelling." : "Try another subject or format."}
              action={<ButtonLink href="/books">Show all books</ButtonLink>}
            />
          )}
          {result && result.items.length > 0 && (
            <>
              <BookGrid books={result.items} priorityCount={5} />
              <Suspense>
                <CatalogPagination page={result.page} totalPages={result.totalPages} />
              </Suspense>
            </>
          )}
        </div>
      </div>
    </Container>
  );
}
