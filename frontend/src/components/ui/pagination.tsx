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

/** Prev / "Page x of y" / Next on phones; the full numbered window from `sm` up. */
export function Pagination({ page, totalPages, onPageChange, className }: PaginationProps) {
  if (totalPages <= 1) return null;
  const item =
    "inline-grid h-11 min-w-11 place-items-center rounded-full px-3 text-sm font-medium transition-colors duration-(--duration-fast)";
  const go = (target: number) => onPageChange(Math.min(totalPages, Math.max(1, target)));

  return (
    <nav aria-label="Pagination" className={cn("flex items-center justify-between gap-2 sm:justify-center", className)}>
      <button
        type="button"
        onClick={() => go(page - 1)}
        disabled={page <= 1}
        className={cn(item, "gap-1 text-text hover:bg-secondary disabled:pointer-events-none disabled:opacity-40")}
      >
        <Icon icon={ChevronLeft} size="sm" />
        <span>Previous</span>
      </button>

      <p className="text-sm text-text-muted sm:hidden" aria-live="polite">
        Page <span className="font-semibold text-text">{page}</span> of {totalPages}
      </p>

      <ol className="hidden items-center gap-1 sm:flex">
        {pageWindow(page, totalPages).map((entry, index) =>
          entry === null ? (
            <li key={`gap-${index}`} aria-hidden="true" className="px-1 text-text-subtle">
              …
            </li>
          ) : (
            <li key={entry}>
              <button
                type="button"
                onClick={() => go(entry)}
                aria-current={entry === page ? "page" : undefined}
                aria-label={`Page ${entry}`}
                className={cn(item, entry === page ? "bg-primary text-on-primary" : "text-text hover:bg-secondary")}
              >
                {entry}
              </button>
            </li>
          ),
        )}
      </ol>

      <button
        type="button"
        onClick={() => go(page + 1)}
        disabled={page >= totalPages}
        className={cn(item, "gap-1 text-text hover:bg-secondary disabled:pointer-events-none disabled:opacity-40")}
      >
        <span>Next</span>
        <Icon icon={ChevronRight} size="sm" />
      </button>
    </nav>
  );
}
