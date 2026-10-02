"use client";

import type { PDFDocumentProxy, RenderTask } from "pdfjs-dist";
import { RefreshCw } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { Button, Icon, Skeleton } from "@/components/ui";
import { useManuscriptLinkQuery, type AdminBook } from "@/lib/api/catalog-admin-api";
import { errorMessage, errorStatus } from "@/lib/api/errors";
import { cn } from "@/lib/cn";
import { openPdf } from "@/features/reader/pdf";

const THUMBS_PER_PAGE = 24;
/** CSS width of a thumbnail; drawn at up to 2× for sharp text on high-density screens. */
const THUMB_WIDTH = 120;

type Opened = { url: string; doc: PDFDocumentProxy | null; failed: boolean };

/**
 * Page thumbnails to find the right page numbers; free pages are highlighted. Drawn here in the
 * editor's browser from a 30-minute private link to the book file, reading only the pages shown.
 */
export function PageThumbnails({ book, selected }: { book: AdminBook; selected: Array<{ fromPage: number; toPage: number }> }) {
  const manuscript = book.manuscript;
  const pages = manuscript?.pages ?? 0;
  const [visible, setVisible] = useState(THUMBS_PER_PAGE);
  // Keyed on the upload time, so a replaced file gets a new link.
  const link = useManuscriptLinkQuery({ id: book.id, uploadedAt: manuscript?.uploadedAt ?? "" }, { skip: !manuscript });
  const url = link.data?.url;
  const [opened, setOpened] = useState<Opened | null>(null);
  const isFree = (page: number) => selected.some((s) => page >= s.fromPage && page <= s.toPage);
  // Stable, so thumbnails already drawn are not redrawn when this list re-renders.
  const markFailed = useCallback(() => setOpened((o) => (o ? { ...o, doc: null, failed: true } : o)), []);

  useEffect(() => {
    if (!url) return;
    const controller = new AbortController();
    openPdf(url, controller.signal, { lazy: true })
      .then(({ doc }) => setOpened({ url, doc, failed: false }))
      .catch(() => {
        if (!controller.signal.aborted) setOpened({ url, doc: null, failed: true });
      });
    return () => controller.abort();
  }, [url]);

  // Only the document opened from the current link counts (a refreshed link reopens it).
  const current = opened && opened.url === url ? opened : null;
  const doc = current?.doc ?? null;

  if (link.error) {
    return (
      <p className="text-sm text-text-muted">
        {errorStatus(link.error) === 503
          ? "Page images need the book file storage (Cloudflare R2), which isn’t set up on this server yet."
          : `Page images couldn’t be loaded (${errorMessage(link.error)}).`}{" "}
        Use the page numbers shown in your PDF viewer.
      </p>
    );
  }

  return (
    <details className="group rounded-xl border border-border p-4" open>
      <summary className="cursor-pointer text-sm font-medium text-text">Find the pages</summary>
      <div className="mt-4 flex flex-col gap-4">
        {current?.failed ? (
          <div className="flex flex-col items-start gap-2 text-sm text-text-muted">
            <p>The page images couldn’t be loaded. The link may have expired or the connection dropped.</p>
            <Button
              size="sm"
              variant="outline"
              leadingIcon={<Icon icon={RefreshCw} size="sm" />}
              isLoading={link.isFetching}
              onClick={() => void link.refetch()}
            >
              Reload pages
            </Button>
          </div>
        ) : !doc ? (
          <div className="grid grid-cols-3 gap-3 sm:grid-cols-6">
            {Array.from({ length: 6 }, (_, i) => (
              <Skeleton key={i} className="aspect-[3/4] w-full" />
            ))}
          </div>
        ) : (
          <ul className="grid grid-cols-3 gap-3 sm:grid-cols-6">
            {Array.from({ length: Math.min(visible, pages) }, (_, i) => i + 1).map((page) => (
              <li key={page} className="flex flex-col items-center gap-1">
                <div
                  className={cn(
                    "relative flex aspect-[3/4] w-full items-center justify-center overflow-hidden rounded-md border bg-paper-50",
                    isFree(page) ? "border-primary ring-2 ring-primary" : "border-border",
                  )}
                >
                  <PdfThumb doc={doc} page={page} onFail={markFailed} />
                </div>
                <span className={cn("text-xs tabular-nums", isFree(page) ? "font-medium text-primary" : "text-text-subtle")}>
                  {page}
                  {isFree(page) ? " · free" : ""}
                </span>
              </li>
            ))}
          </ul>
        )}
        {doc && visible < pages && (
          <Button variant="ghost" size="sm" className="self-center" onClick={() => setVisible((v) => Math.min(pages, v + THUMBS_PER_PAGE))}>
            Show more pages
          </Button>
        )}
      </div>
    </details>
  );
}

/** One page, drawn when it nears the screen. */
function PdfThumb({ doc, page, onFail }: { doc: PDFDocumentProxy; page: number; onFail: () => void }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [near, setNear] = useState(false);
  const [drawn, setDrawn] = useState(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const observer = new IntersectionObserver(([entry]) => entry.isIntersecting && setNear(true), { rootMargin: "200px 0px" });
    observer.observe(canvas);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!near) return;
    let cancelled = false;
    let task: RenderTask | null = null;
    void (async () => {
      try {
        const pdfPage = await doc.getPage(page);
        const canvas = canvasRef.current;
        if (cancelled || !canvas) return;
        const base = pdfPage.getViewport({ scale: 1 });
        const ratio = Math.min(window.devicePixelRatio || 1, 2);
        const viewport = pdfPage.getViewport({ scale: (THUMB_WIDTH * ratio) / base.width });
        canvas.width = Math.floor(viewport.width);
        canvas.height = Math.floor(viewport.height);
        task = pdfPage.render({ canvas, viewport });
        await task.promise;
        if (!cancelled) setDrawn(true);
      } catch (error) {
        if (!cancelled && (error as { name?: string }).name !== "RenderingCancelledException") onFail();
      }
    })();
    return () => {
      cancelled = true;
      task?.cancel();
    };
  }, [near, doc, page, onFail]);

  return (
    <canvas
      ref={canvasRef}
      role="img"
      aria-label={`Page ${page}`}
      className={cn("max-h-full max-w-full transition-opacity", drawn ? "opacity-100" : "opacity-0")}
    />
  );
}
