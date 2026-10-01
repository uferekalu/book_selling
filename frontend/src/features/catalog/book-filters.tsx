"use client";

import { Search, SlidersHorizontal } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useState, useTransition, type FormEvent } from "react";
import { Badge, Button, Drawer, FormField, Icon, Input, Pagination, RadioGroup, Select } from "@/components/ui";
import type { BookSort, PublicCategory } from "@/lib/catalog-types";

const SORT_OPTIONS: Array<{ value: BookSort; label: string }> = [
  { value: "relevance", label: "Most relevant" },
  { value: "newest", label: "Newest" },
  { value: "price_asc", label: "Price: low to high" },
  { value: "price_desc", label: "Price: high to low" },
  { value: "rating", label: "Highest rated" },
  { value: "title", label: "Title A–Z" },
];

/** URL search params are the single source of truth for listing state (shareable, back-button safe). */
function useListingParams() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [pending, startTransition] = useTransition();

  const update = (changes: Record<string, string | null>, { resetPage = true } = {}) => {
    const next = new URLSearchParams(params.toString());
    for (const [key, value] of Object.entries(changes)) {
      if (value === null || value === "") next.delete(key);
      else next.set(key, value);
    }
    if (resetPage) next.delete("page");
    const query = next.toString();
    startTransition(() => router.push(query ? `${pathname}?${query}` : pathname, { scroll: false }));
  };
  return { params, update, pending };
}

export function SearchBox() {
  const { params, update } = useListingParams();
  const [value, setValue] = useState(params.get("q") ?? "");
  const submit = (event: FormEvent) => {
    event.preventDefault();
    update({ q: value.trim() || null, sort: null });
  };
  return (
    <form role="search" onSubmit={submit} className="w-full">
      <FormField label="Search books" hideLabel>
        <Input
          id="search"
          type="search"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="Search by title, topic or ISBN…"
          enterKeyHint="search"
          leading={<Icon icon={Search} size="sm" />}
        />
      </FormField>
    </form>
  );
}

export function SortSelect() {
  const { params, update } = useListingParams();
  const hasQuery = Boolean(params.get("q"));
  const value = params.get("sort") ?? (hasQuery ? "relevance" : "newest");
  return (
    <FormField label="Sort by" className="w-full sm:w-56">
      <Select
        value={value}
        options={SORT_OPTIONS.filter((o) => o.value !== "relevance" || hasQuery)}
        onChange={(e) => update({ sort: e.target.value })}
      />
    </FormField>
  );
}

function FilterControls({ categories, onChange }: { categories: PublicCategory[]; onChange?: () => void }) {
  const { params, update } = useListingParams();
  return (
    <div className="flex flex-col gap-8">
      <RadioGroup
        legend="Subject"
        value={params.get("category") ?? ""}
        onChange={(value) => {
          update({ category: value || null });
          onChange?.();
        }}
        options={[
          { value: "", label: "All subjects" },
          ...categories.map((c) => ({ value: c.slug, label: c.name, aside: <span className="text-xs font-normal text-text-subtle">{c.bookCount}</span> })),
        ]}
      />
      <RadioGroup
        legend="Format"
        value={params.get("format") ?? ""}
        onChange={(value) => {
          update({ format: value || null });
          onChange?.();
        }}
        options={[
          { value: "", label: "Any format" },
          { value: "ebook", label: "Ebook", description: "Instant access, read anywhere" },
          { value: "print", label: "Print", description: "Shipped to your door" },
        ]}
      />
    </div>
  );
}

/** Sidebar on desktop; a "Filters" button opening a bottom sheet on phones and tablets. */
export function BookFilters({ categories }: { categories: PublicCategory[] }) {
  const [open, setOpen] = useState(false);
  const { params, update } = useListingParams();
  const active = ["category", "format"].filter((key) => params.get(key)).length;

  return (
    <>
      <aside className="hidden lg:block" aria-label="Filters">
        <FilterControls categories={categories} />
      </aside>
      <div className="flex items-center gap-3 lg:hidden">
        <Button variant="outline" leadingIcon={<Icon icon={SlidersHorizontal} size="sm" />} onClick={() => setOpen(true)}>
          Filters
          {active > 0 && (
            <Badge tone="solid" size="sm">
              {active}
            </Badge>
          )}
        </Button>
        {active > 0 && (
          <Button variant="ghost" size="sm" onClick={() => update({ category: null, format: null })}>
            Clear
          </Button>
        )}
      </div>
      <Drawer
        open={open}
        onClose={() => setOpen(false)}
        side="bottom"
        title="Filters"
        footer={
          <Button fullWidth size="lg" onClick={() => setOpen(false)}>
            Show results
          </Button>
        }
      >
        <FilterControls categories={categories} />
      </Drawer>
    </>
  );
}

export function CatalogPagination({ page, totalPages }: { page: number; totalPages: number }) {
  const { update } = useListingParams();
  return (
    <Pagination
      page={page}
      totalPages={totalPages}
      onPageChange={(next) => {
        update({ page: next > 1 ? String(next) : null }, { resetPage: false });
        window.scrollTo({ top: 0, behavior: "smooth" });
      }}
    />
  );
}
