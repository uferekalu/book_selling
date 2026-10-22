"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/cn";
import { Icon } from "./icon";

/** Page numbers to show, with `null` for a gap: 1 … 4 5 6 … 12. */
export function pageWindow(current: number, total: number, siblings = 1): Array<number | null> {
  if (total <= 5 + siblings * 2) return Array.from({ length: total }, (_, i) => i + 1);
  const start = Math.max(2, current - siblings);
  const end = Math.min(total - 1, current + siblings);
  const pages: Array<number | null> = [1];
  if (start > 2) pages.push(null);
  for (let page = start; page <= end; page += 1) pages.push(page);
  if (end < total - 1) pages.push(null);
  pages.push(total);
  return pages;
}

export interface PaginationProps {
  page: number;
  totalPages: number;
  onPageChange: (page: number) => void;
  className?: string;
}

const step =
  "inline-flex size-11 shrink-0 items-center justify-center gap-1.5 rounded-full text-sm font-medium text-text transition-[background-color,color,box-shadow] duration-(--duration-fast) hover:bg-secondary disabled:pointer-events-none disabled:text-text-subtle disabled:opacity-50 sm:w-auto sm:px-4";

/**
 * One rounded control (BS-35): arrows at the ends, the numbered window between them on wider
 * screens, and "2 of 5" with a progress track on phones. The current page is a solid pill; the
 * others are quiet until hovered. Every target is 44px.
 */
export function Pagination({ page, totalPages, onPageChange, className }: PaginationProps) {
  if (totalPages <= 1) return null;
  const go = (target: number) => onPageChange(Math.min(totalPages, Math.max(1, target)));

  return (
    <nav aria-label="Pagination" className={cn("flex justify-center", className)}>
      <div className="flex w-full max-w-md items-center gap-1 rounded-full border border-border bg-surface-raised p-1 shadow-sm sm:w-auto sm:max-w-none">
        <button type="button" onClick={() => go(page - 1)} disabled={page <= 1} className={step} aria-label="Previous page">
          <Icon icon={ChevronLeft} size="sm" />
          <span className="hidden sm:inline">Previous</span>
        </button>

        {/* Phones: where you are, and how far through. */}
        <div className="flex min-w-0 flex-1 flex-col items-center gap-1.5 px-2 sm:hidden" aria-live="polite">
          <p className="text-sm text-text-muted tabular-nums">
            Page <span className="font-semibold text-text">{page}</span> of {totalPages}
          </p>
          <span className="h-1 w-full max-w-32 overflow-hidden rounded-full bg-secondary" aria-hidden="true">
            <span
              className="block h-full rounded-full bg-primary transition-[width] duration-(--duration-base) ease-out-soft"
              style={{ width: `${(page / totalPages) * 100}%` }}
            />
          </span>
        </div>

        <ol className="hidden items-center gap-1 border-x border-border px-1 sm:flex">
          {pageWindow(page, totalPages).map((entry, index) =>
            entry === null ? (
              <li key={`gap-${index}`} aria-hidden="true" className="grid size-11 place-items-center text-text-subtle">
                …
              </li>
            ) : (
              <li key={entry}>
                <button
                  type="button"
                  onClick={() => go(entry)}
                  aria-current={entry === page ? "page" : undefined}
                  aria-label={`Page ${entry}`}
                  className={cn(
                    "grid size-11 place-items-center rounded-full text-sm font-medium tabular-nums transition-[background-color,color,box-shadow,transform] duration-(--duration-fast)",
                    entry === page
                      ? "bg-primary text-on-primary shadow-md"
                      : "text-text-muted hover:bg-secondary hover:text-text active:scale-95",
                  )}
                >
                  {entry}
                </button>
              </li>
            ),
          )}
        </ol>

        <button type="button" onClick={() => go(page + 1)} disabled={page >= totalPages} className={step} aria-label="Next page">
          <span className="hidden sm:inline">Next</span>
          <Icon icon={ChevronRight} size="sm" />
        </button>
      </div>
    </nav>
  );
}
