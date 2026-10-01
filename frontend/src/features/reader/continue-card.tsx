"use client";

import { Lock, ShieldCheck } from "lucide-react";
import { forwardRef } from "react";
import { BookCover, Icon } from "@/components/ui";
import { FormatPicker } from "@/features/catalog/format-picker";
import type { PublicBook } from "@/lib/catalog-types";
import type { PreviewData } from "./reader-logic";

/**
 * The paywall moment (PRODUCT_RULES §4.6): after the last free page, two unreadable hints of the
 * next pages fade into an inline card with the price and buy options. No pop-ups.
 */
export const ContinueCard = forwardRef<
  HTMLElement,
  { book: PublicBook; preview: PreviewData; pageWidth: number; onCheckout: () => void }
>(function ContinueCard(
  { book, preview, pageWidth, onCheckout },
  ref,
) {
  const author = book.authors.map((a) => a.name).join(", ");
  return (
    <section aria-labelledby="continue-heading" className="flex w-full flex-col items-center">
      {/* Locked hints: tiny blurred images of the next pages, or blank paper with faint lines. */}
      <div className="relative w-full" style={{ maxWidth: pageWidth }} aria-hidden="true">
        <div className="flex flex-col gap-6 opacity-70 [mask-image:linear-gradient(to_bottom,black,transparent)]">
          {[0, 1].map((i) => (
            <div key={i} className="relative aspect-[2/3] w-full overflow-hidden rounded-sm bg-paper-50 shadow-book">
              {preview.teasers[i] ? (
                // eslint-disable-next-line @next/next/no-img-element -- a 48px blurred hint, intentionally unoptimised
                <img src={preview.teasers[i]} alt="" className="size-full scale-110 object-cover blur-md" />
              ) : (
                <div className="flex flex-col gap-3 p-[12%] blur-[3px]">
                  {Array.from({ length: 14 }, (_, line) => (
                    <div key={line} className="h-2 rounded-full bg-paper-200" style={{ width: `${70 + ((line * 37) % 30)}%` }} />
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
        <span className="absolute inset-x-0 top-1/4 flex justify-center">
          <span className="flex items-center gap-2 rounded-full bg-surface/90 px-4 py-2 text-sm font-medium text-text shadow-md">
            <Icon icon={Lock} size="sm" /> The rest is in the full book
          </span>
        </span>
      </div>

      <div
        ref={ref as React.Ref<HTMLDivElement>}
        className="relative -mt-40 w-full max-w-xl scroll-mt-6 rounded-3xl border border-border bg-surface p-5 shadow-xl sm:-mt-56 sm:p-8"
      >
        <div className="flex gap-4 sm:gap-6">
          <BookCover
            title={book.title}
            author={author}
            src={book.cover?.src}
            blurDataUrl={book.cover?.blurDataUrl}
            dominantColor={book.cover?.dominantColor}
            size="sm"
            className="hidden min-[400px]:block"
          />
          <div className="flex min-w-0 flex-col gap-2">
            <p className="text-sm font-medium text-on-accent-subtle">You&rsquo;ve reached the end of the free preview</p>
            <h2 id="continue-heading" className="text-3xl font-medium">
              Continue reading
            </h2>
            <p className="text-sm text-text-muted">
              {preview.continuesAt
                ? `The full book carries on from page ${preview.continuesAt} and has ${preview.totalPages} pages.`
                : `The full book has ${preview.totalPages} pages.`}{" "}
              With the ebook you get instant access and continue right where you stopped.
            </p>
          </div>
        </div>
        <div className="mt-6">
          <FormatPicker
            bookId={book.id}
            slug={book.slug}
            formats={book.formatDetails}
            hasPreview
            showPreviewButton={false}
            onCheckout={onCheckout}
          />
        </div>
        <p className="mt-4 flex items-center gap-2 text-xs text-text-subtle">
          <Icon icon={ShieldCheck} size="sm" /> Card details are entered with the payment provider and never touch this site.
        </p>
      </div>
    </section>
  );
});
