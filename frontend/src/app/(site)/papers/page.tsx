import { SearchX } from "lucide-react";
import type { Metadata } from "next";
import { Suspense } from "react";
import { Breadcrumbs, ButtonLink, Container, EmptyState } from "@/components/ui";
import { BookFilters, CatalogPagination, SearchBox, SortSelect } from "@/features/catalog/book-filters";
import { PaperList } from "@/features/catalog/paper-card";
import { listBooks, listCategories, orFallback } from "@/lib/catalog";
import { BOOK_SORTS, type BookSort } from "@/lib/catalog-types";
import { requestCurrency } from "@/lib/request-currency";

export const metadata: Metadata = {
  title: "Conference and workshop papers",
  description:
    "Conference and workshop papers on foundry, iron and steel making, safety, and technical education in Nigeria. Read the first pages free.",
};

const one = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value);

/** Every published paper (BS-34), searchable and filtered by research area. */
export default async function PapersPage({ searchParams }: PageProps<"/papers">) {
  const params = await searchParams;
  const currency = await requestCurrency();
  const q = one(params.q)?.slice(0, 100) || undefined;
  const category = one(params.category) || undefined;
  const sortParam = one(params.sort);
  const sort = (BOOK_SORTS as readonly string[]).includes(sortParam ?? "") ? (sortParam as BookSort) : undefined;
  const page = Math.max(1, Math.min(500, Number.parseInt(one(params.page) ?? "1", 10) || 1));

  const [result, categories] = await Promise.all([
    orFallback(listBooks({ kind: "paper", currency, q, category, sort, page, pageSize: 24 }), null),
    orFallback(listCategories(), []),
  ]);
  const areaName = categories.find((c) => c.slug === category)?.name;
  const heading = q ? `Results for “${q}”` : (areaName ?? "Conference and workshop papers");

  return (
    <Container className="flex flex-col gap-8 py-8 sm:py-12">
      <div className="flex flex-col gap-4">
        <Breadcrumbs
          items={[{ label: "Home", href: "/" }, { label: "Papers", href: areaName || q ? "/papers" : undefined }, ...(areaName ? [{ label: areaName }] : [])]}
        />
        <h1 className="text-4xl font-medium text-balance sm:text-5xl">{heading}</h1>
        {!q && !areaName && (
          <p className="max-w-3xl text-lg text-text-muted">
            Papers presented at conferences and workshops. Read the first pages of each free, then buy the full paper as a PDF.
          </p>
        )}
        {result && (
          <p className="text-text-muted" aria-live="polite">
            {result.total === 1 ? "1 paper" : `${result.total} papers`}
          </p>
        )}
      </div>

      <Suspense>
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end">
          <div className="flex-1">
            <SearchBox kind="paper" />
          </div>
          <SortSelect kind="paper" />
        </div>
      </Suspense>

      <div className="grid gap-8 lg:grid-cols-[14rem_1fr] lg:gap-12">
        <Suspense>
          <BookFilters categories={categories} kind="paper" />
        </Suspense>
        <div className="flex min-w-0 flex-col gap-10">
          {!result && (
            <EmptyState
              icon={SearchX}
              title="The papers are unavailable right now"
              description="Please try again in a moment."
              action={<ButtonLink href="/papers">Try again</ButtonLink>}
            />
          )}
          {result && result.items.length === 0 && (
            <EmptyState
              icon={SearchX}
              title="No papers found"
              description={q ? `Nothing matches “${q}”. Try a shorter search, or check the spelling.` : "Try another research area."}
              action={<ButtonLink href="/papers">Show all papers</ButtonLink>}
            />
          )}
          {result && result.items.length > 0 && (
            <>
              <PaperList papers={result.items} headingLevel={2} />
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
