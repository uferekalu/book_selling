"use client";

import { ArrowLeft, List, Maximize, Minimize, Settings2, X } from "lucide-react";
import NextLink from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import type { PDFDocumentProxy } from "pdfjs-dist";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Alert, Button, ButtonLink, Drawer, Icon, IconButton, ProgressBar, Skeleton } from "@/components/ui";
import { useOwnedBooksQuery } from "@/lib/api/library-api";
import type { PublicBook } from "@/lib/catalog-types";
import { useAppSelector } from "@/lib/redux/hooks";
import { CheckoutFlow } from "@/features/checkout/checkout-flow";
import { createTracker } from "./analytics";
import { ContinueCard } from "./continue-card";
import { openPdf } from "./pdf";
import { PdfPage } from "./pdf-page";
import { FitTextSwitch, paddingX, ToneButtons, useFitText, useReaderTone, ZoomButtons } from "./reader-controls";
import { ReaderContents } from "./reader-contents";
import {
  nextZoom,
  pageWidth,
  previewPageFromParam,
  progressLabel,
  readSavedPage,
  savePage,
  sectionOf,
  shouldNudge,
  type PreviewData,
} from "./reader-logic";

/**
 * "Read before you buy" (ARCHITECTURE §10.1). Only the server-built preview PDF is loaded, so
 * nothing here can reveal a locked page. Scroll to read; the end of the preview flows into the
 * "Continue reading" card.
 */
export function PreviewReader({ book, preview }: { book: PublicBook; preview: PreviewData }) {
  const params = useSearchParams();
  useOwnerRedirect(book.id, params.get("page"));
  const scrollRef = useRef<HTMLDivElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const endRef = useRef<HTMLElement>(null);
  const tracker = useRef<ReturnType<typeof createTracker> | null>(null);

  const [doc, setDoc] = useState<PDFDocumentProxy | null>(null);
  const [aspects, setAspects] = useState<number[]>([]);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [available, setAvailable] = useState(360);
  const [zoom, setZoom] = useState(1);
  const [tone, chooseTone] = useReaderTone();
  const [current, setCurrent] = useState(1);
  const [contentsOpen, setContentsOpen] = useState(false);
  const [displayOpen, setDisplayOpen] = useState(false);
  const [checkoutOpen, setCheckoutOpen] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  const [nudgeDismissed, setNudgeDismissed] = useState(() => {
    try {
      return window.sessionStorage.getItem(`bs_nudge_${preview.slug}`) === "1";
    } catch {
      return false;
    }
  });
  const restored = useRef(false);

  const width = pageWidth(available, zoom);
  const { crop, fit, setFit, applies } = useFitText(doc, available);

  // ---- load ------------------------------------------------------------------------------------
  useEffect(() => {
    const controller = new AbortController();
    void (async () => {
      try {
        const { doc: pdf } = await openPdf(`/api${preview.fileUrl}`, controller.signal);
        const sizes: number[] = [];
        for (let n = 1; n <= pdf.numPages; n += 1) {
          const viewport = (await pdf.getPage(n)).getViewport({ scale: 1 });
          sizes.push(viewport.height / viewport.width);
        }
        if (controller.signal.aborted) return;
        setAspects(sizes);
        setDoc(pdf);
      } catch {
        if (!controller.signal.aborted) setFailed(true);
      }
    })();
    return () => controller.abort();
  }, [preview.fileUrl, attempt]);

  useEffect(() => {
    const t = createTracker(preview.slug);
    tracker.current = t;
    t.track({ type: "open" });
    return () => t.dispose();
  }, [preview.slug]);

  // ---- layout ----------------------------------------------------------------------------------
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const measure = () => setAvailable(Math.max(240, el.clientWidth - paddingX(el)));
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const jumpTo = useCallback((page: number, behavior: ScrollBehavior = "smooth") => {
    const target = scrollRef.current?.querySelector(`[data-page="${page}"]`);
    target?.scrollIntoView({ behavior, block: "start" });
  }, []);

  const showOptions = useCallback(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, []);

  // Resume: ?page= (a buyer returning from checkout), else where this browser left off.
  useEffect(() => {
    if (!doc || restored.current) return;
    restored.current = true;
    const fromParam = previewPageFromParam(params.get("page"), preview.pageMap);
    const start = fromParam ?? readSavedPage(preview.slug);
    if (start && start > 1 && start <= preview.pageCount) requestAnimationFrame(() => jumpTo(start, "instant"));
  }, [doc, params, preview.pageMap, preview.pageCount, preview.slug, jumpTo]);

  const onVisible = useCallback(
    (page: number) => {
      setCurrent(page);
      savePage(preview.slug, page);
      tracker.current?.track({ type: "page", page });
    },
    [preview.slug],
  );

  // The end of the preview: count it once per visit.
  useEffect(() => {
    const el = endRef.current;
    if (!el || !doc) return;
    let seen = false;
    const observer = new IntersectionObserver(([entry]) => {
      if (!entry.isIntersecting) return;
      setCurrent(preview.pageCount);
      if (!seen) {
        seen = true;
        tracker.current?.track({ type: "end_reached" });
      }
    }, { threshold: 0.3 });
    observer.observe(el);
    return () => observer.disconnect();
  }, [doc, preview.pageCount]);

  const nudge = !nudgeDismissed && shouldNudge(current, preview.pageCount);
  useEffect(() => {
    if (nudge) tracker.current?.track({ type: "nudge_shown" });
  }, [nudge]);

  const dismissNudge = () => {
    setNudgeDismissed(true);
    try {
      window.sessionStorage.setItem(`bs_nudge_${preview.slug}`, "1");
    } catch {
      // ignore
    }
  };

  // ---- controls --------------------------------------------------------------------------------
  const toggleFullscreen = useCallback(() => {
    if (document.fullscreenElement) void document.exitFullscreen();
    else void rootRef.current?.requestFullscreen?.().catch(() => undefined);
  }, []);

  useEffect(() => {
    const sync = () => setFullscreen(Boolean(document.fullscreenElement));
    document.addEventListener("fullscreenchange", sync);
    return () => document.removeEventListener("fullscreenchange", sync);
  }, []);

  // Keyboard: ←/→ and PgUp/PgDn turn pages, Home/End, +/− zoom, F full screen.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      if (target?.closest("input, textarea, select, [role='dialog']")) return;
      const keys: Record<string, () => void> = {
        ArrowRight: () => jumpTo(Math.min(preview.pageCount, current + 1)),
        PageDown: () => jumpTo(Math.min(preview.pageCount, current + 1)),
        ArrowLeft: () => jumpTo(Math.max(1, current - 1)),
        PageUp: () => jumpTo(Math.max(1, current - 1)),
        Home: () => jumpTo(1),
        End: showOptions,
        "+": () => setZoom((z) => nextZoom(z, 1)),
        "=": () => setZoom((z) => nextZoom(z, 1)),
        "-": () => setZoom((z) => nextZoom(z, -1)),
        f: toggleFullscreen,
      };
      const action = keys[event.key];
      if (action) {
        event.preventDefault();
        action();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [current, preview.pageCount, jumpTo, showOptions, toggleFullscreen]);

  const pages = useMemo(() => Array.from({ length: preview.pageCount }, (_, i) => i + 1), [preview.pageCount]);
  const label = progressLabel(current, preview);
  const toneButtons = <ToneButtons tone={tone} onChange={chooseTone} />;
  const zoomButtons = <ZoomButtons zoom={zoom} onChange={setZoom} />;


  return (
    <div ref={rootRef} className="flex h-dvh flex-col bg-surface-sunken">
      {/* ---- toolbar ---- */}
      <header className="z-10 flex flex-col border-b border-border bg-surface/95 backdrop-blur safe-x">
        <div className="flex items-center gap-1 px-2 py-1.5 sm:gap-2 sm:px-4">
          <NextLink
            href={`/books/${book.slug}`}
            className="flex size-11 shrink-0 items-center justify-center rounded-full text-text hover:bg-secondary"
            aria-label={`Back to ${book.title}`}
          >
            <Icon icon={ArrowLeft} size="md" />
          </NextLink>
          <div className="flex min-w-0 flex-1 flex-col">
            <h1 className="truncate font-display text-base leading-tight sm:text-lg">{book.title}</h1>
            <p className="truncate text-xs text-text-muted">Free preview</p>
          </div>
          <IconButton label="Contents" icon={<Icon icon={List} size="md" />} onClick={() => setContentsOpen(true)} />
          <div className="hidden items-center gap-2 md:flex">
            {zoomButtons}
            {toneButtons}
          </div>
          <IconButton label="Display settings" className="md:hidden" icon={<Icon icon={Settings2} size="md" />} onClick={() => setDisplayOpen(true)} />
          <IconButton
            label={fullscreen ? "Exit full screen" : "Full screen"}
            className="hidden sm:inline-flex"
            icon={<Icon icon={fullscreen ? Minimize : Maximize} size="md" />}
            onClick={toggleFullscreen}
          />
          <Button size="sm" variant="accent" className="ml-1 hidden sm:inline-flex" onClick={showOptions}>
            Buy the book
          </Button>
        </div>
        <ProgressBar value={current} max={preview.pageCount} label="Preview progress" valueText={label} className="[&>div]:h-1 [&>div]:rounded-none" />
      </header>

      {/* ---- pages ---- */}
      <div ref={scrollRef} className="relative flex-1 overflow-y-auto overscroll-contain px-1.5 sm:px-4 pt-6 pb-28" tabIndex={-1}>
        {failed ? (
          <div className="mx-auto max-w-md py-16">
            <Alert
              tone="danger"
              title="The preview didn’t load"
              action={
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    setFailed(false);
                    setAttempt((a) => a + 1);
                  }}
                >
                  Try again
                </Button>
              }
            >
              Check your connection and try again.
            </Alert>
          </div>
        ) : !doc ? (
          <div className="mx-auto flex flex-col items-center gap-6" style={{ width }} aria-busy="true" aria-label="Loading the preview">
            <Skeleton className="aspect-[2/3] w-full rounded-sm" />
            <Skeleton className="aspect-[2/3] w-full rounded-sm" />
          </div>
        ) : (
          <div className="mx-auto flex flex-col items-center gap-8">
            {pages.map((n) => (
              <PdfPage
                key={n}
                doc={doc}
                pageNumber={n}
                width={width}
                aspect={aspects[n - 1] ?? 1.5}
                tone={tone}
                caption={`${sectionOf(n, preview) ?? "Preview"} · page ${preview.pageMap[n - 1]} of ${preview.totalPages}`}
                onVisible={onVisible}
                crop={crop}
              />
            ))}
            <ContinueCard
              ref={endRef}
              book={book}
              preview={preview}
              pageWidth={width}
              onCheckout={() => {
                tracker.current?.track({ type: "buy_click" });
                setCheckoutOpen(true);
              }}
            />
          </div>
        )}
      </div>

      {/* ---- footer: where you are, and the one gentle hint ---- */}
      <div className="pointer-events-none fixed inset-x-0 bottom-0 z-10 flex flex-col items-center gap-2 px-4 pb-3 safe-bottom">
        {nudge && (
          <div
            role="status"
            className="pointer-events-auto flex w-full max-w-md animate-rise-in items-center gap-3 rounded-2xl border border-border bg-surface p-3 pl-4 shadow-lg"
          >
            <p className="flex-1 text-sm text-text">
              Enjoying it? The full book has {preview.totalPages} pages.
            </p>
            <Button size="sm" onClick={showOptions}>
              See options
            </Button>
            <IconButton label="Dismiss" size="sm" icon={<Icon icon={X} size="sm" />} onClick={dismissNudge} />
          </div>
        )}
        <p className="pointer-events-auto rounded-full bg-surface/90 px-3 py-1 text-xs text-text-muted shadow-sm tabular-nums backdrop-blur" aria-live="polite">
          {label}
        </p>
      </div>

      <ReaderContents
        open={contentsOpen}
        onClose={() => setContentsOpen(false)}
        preview={preview}
        currentPage={current}
        onJump={(page) => jumpTo(page)}
        onLocked={(entry) => tracker.current?.track({ type: "locked_chapter", ...(entry.page ? { page: entry.page } : {}) })}
        onShowOptions={() => {
          setContentsOpen(false);
          showOptions();
        }}
      />

      {/* Buying without leaving the book (PRODUCT_RULES §4.7); after paying, the buyer returns here. */}
      <Drawer open={checkoutOpen} onClose={() => setCheckoutOpen(false)} title="Checkout" side="right">
        <CheckoutFlow
          returnPath={`/books/${book.slug}/read?page=${preview.continuesAt ?? preview.pageMap[current - 1] ?? 1}`}
          onNavigate={() => setCheckoutOpen(false)}
        />
      </Drawer>

      <Drawer open={displayOpen} onClose={() => setDisplayOpen(false)} title="Display" side="bottom">
        <div className="flex flex-col gap-6">
          <div className="flex flex-col gap-2">
            <p className="text-sm font-medium text-text">Page colour</p>
            {toneButtons}
          </div>
          <div className="flex flex-col gap-2">
            <p className="text-sm font-medium text-text">Text size</p>
            {zoomButtons}
          </div>
          {applies && <FitTextSwitch fit={fit} onChange={setFit} />}
          <ButtonLink href={`/books/${book.slug}`} variant="ghost">
            Back to the book page
          </ButtonLink>
        </div>
      </Drawer>
    </div>
  );
}

/**
 * An owner never sees the paywall: they go straight to the full book, at the same page. This is
 * also how a buyer returns from checkout (`returnTo=/books/<slug>/read?page=<n>`).
 */
function useOwnerRedirect(bookId: string, page: string | null) {
  const router = useRouter();
  const signedIn = useAppSelector((state) => state.session.status === "authenticated");
  const { data: owned } = useOwnedBooksQuery(undefined, { skip: !signedIn });
  const owns = Boolean(owned?.some((b) => b.bookId === bookId));
  useEffect(() => {
    if (owns) router.replace(`/account/library/${bookId}/read${page ? `?page=${encodeURIComponent(page)}` : ""}`);
  }, [owns, bookId, page, router]);
}
