"use client";

import { ArrowLeft, BookOpen, List, Maximize, Minimize, Settings2 } from "lucide-react";
import NextLink from "next/link";
import { useSearchParams } from "next/navigation";
import type { PDFDocumentProxy } from "pdfjs-dist";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Alert, Button, ButtonLink, Drawer, Icon, IconButton, ProgressBar, Skeleton, Spinner } from "@/components/ui";
import { errorMessage } from "@/lib/api/errors";
import { useLibraryBookQuery, useReadLinkMutation, useSaveProgressMutation, type LibraryOutlineEntry } from "@/lib/api/library-api";
import { cn } from "@/lib/cn";
import { openPdf } from "@/features/reader/pdf";
import { PdfPage } from "@/features/reader/pdf-page";
import { ToneButtons, useReaderTone, ZoomButtons } from "@/features/reader/reader-controls";
import { nextZoom, pageWidth } from "@/features/reader/reader-logic";
import { DownloadButton } from "./download-button";
import { fullProgressLabel, linkRefreshDelay, startPage } from "./library-logic";

/** While the personal copy is being made, ask again this often. */
const PREPARING_POLL_MS = 4000;
/** Progress is saved this long after the reader stops on a page. */
const SAVE_DELAY_MS = 1500;

type Loaded = { url: string; doc: PDFDocumentProxy; firstAspect: number };

/**
 * The full book for its owner (ARCHITECTURE §10.2): the same reader as the preview, without the
 * paywall. Pages stream from a private, signed link to the buyer's personal copy (pdf.js reads
 * only the pages near the screen); the link is renewed before it expires and the position syncs
 * to the account, so reading resumes on any device.
 */
export function FullReader({ bookId }: { bookId: string }) {
  const params = useSearchParams();
  const { data: book, error: bookError } = useLibraryBookQuery(bookId);
  const [requestLink] = useReadLinkMutation();
  const [saveProgress] = useSaveProgressMutation();
  const scrollRef = useRef<HTMLDivElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);

  const [link, setLink] = useState<{ url: string; expiresAt: string; updating: boolean } | null>(null);
  const [preparing, setPreparing] = useState(false);
  const [linkError, setLinkError] = useState<string | null>(null);
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [aspects, setAspects] = useState<Record<number, number>>({});
  const [available, setAvailable] = useState(360);
  const [zoom, setZoom] = useState(1);
  const [tone, chooseTone] = useReaderTone();
  const [current, setCurrent] = useState(1);
  const [contentsOpen, setContentsOpen] = useState(false);
  const [displayOpen, setDisplayOpen] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  const restored = useRef(false);
  const width = pageWidth(available, zoom);

  // ---- the private link: fetch, wait while the copy is prepared, renew before it expires --------
  useEffect(() => {
    let cancelled = false;
    let timer: number | undefined;
    const fetchLink = async () => {
      try {
        const result = await requestLink(bookId).unwrap();
        if (cancelled) return;
        if (result.status === "preparing") {
          setPreparing(true);
          timer = window.setTimeout(() => void fetchLink(), PREPARING_POLL_MS);
          return;
        }
        setPreparing(false);
        setLinkError(null);
        setLink({ url: result.url, expiresAt: result.expiresAt, updating: result.updating });
        timer = window.setTimeout(() => void fetchLink(), linkRefreshDelay(result.expiresAt, Date.now()));
      } catch (error) {
        if (!cancelled) setLinkError(errorMessage(error));
      }
    };
    void fetchLink();
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [bookId, requestLink, attempt]);

  // ---- open the book from the current link (a renewed link reopens it in place) ----------------
  useEffect(() => {
    if (!link) return;
    const controller = new AbortController();
    void (async () => {
      try {
        const { doc } = await openPdf(link.url, controller.signal, { lazy: true });
        const first = (await doc.getPage(1)).getViewport({ scale: 1 });
        if (controller.signal.aborted) return;
        setLoaded({ url: link.url, doc, firstAspect: first.height / first.width });
        setLoadFailed(false);
      } catch {
        if (!controller.signal.aborted) setLoadFailed(true);
      }
    })();
    return () => controller.abort();
  }, [link]);

  // ---- layout ------------------------------------------------------------------------------------
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const measure = () => setAvailable(Math.max(240, el.clientWidth - 32));
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const doc = loaded?.doc ?? null;
  const pageCount = doc?.numPages ?? book?.pages ?? 0;
  const jumpTo = useCallback((page: number, behavior: ScrollBehavior = "smooth") => {
    scrollRef.current?.querySelector(`[data-page="${page}"]`)?.scrollIntoView({ behavior, block: "start" });
  }, []);

  // Resume: ?page= (back from checkout or a link), else where the account left off.
  useEffect(() => {
    if (!doc || !book || restored.current) return;
    restored.current = true;
    const start = startPage(params.get("page"), book.progress?.page ?? null, doc.numPages);
    if (start > 1) requestAnimationFrame(() => jumpTo(start, "instant"));
  }, [doc, book, params, jumpTo]);

  // Save the page a moment after the reader settles on it.
  useEffect(() => {
    if (!doc || !restored.current) return;
    const timer = window.setTimeout(() => void saveProgress({ bookId, page: current }).catch(() => undefined), SAVE_DELAY_MS);
    return () => window.clearTimeout(timer);
  }, [current, doc, bookId, saveProgress]);

  const onVisible = useCallback((page: number) => setCurrent(page), []);
  const onAspect = useCallback(
    (page: number, aspect: number) => setAspects((all) => (Math.abs((all[page] ?? 0) - aspect) < 0.001 ? all : { ...all, [page]: aspect })),
    [],
  );

  // ---- controls ----------------------------------------------------------------------------------
  const toggleFullscreen = useCallback(() => {
    if (document.fullscreenElement) void document.exitFullscreen();
    else void rootRef.current?.requestFullscreen?.().catch(() => undefined);
  }, []);
  useEffect(() => {
    const sync = () => setFullscreen(Boolean(document.fullscreenElement));
    document.addEventListener("fullscreenchange", sync);
    return () => document.removeEventListener("fullscreenchange", sync);
  }, []);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      if (target?.closest("input, textarea, select, [role='dialog']")) return;
      const keys: Record<string, () => void> = {
        ArrowRight: () => jumpTo(Math.min(pageCount, current + 1)),
        PageDown: () => jumpTo(Math.min(pageCount, current + 1)),
        ArrowLeft: () => jumpTo(Math.max(1, current - 1)),
        PageUp: () => jumpTo(Math.max(1, current - 1)),
        Home: () => jumpTo(1),
        End: () => jumpTo(pageCount),
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
  }, [current, pageCount, jumpTo, toggleFullscreen]);

  const pages = useMemo(() => Array.from({ length: pageCount }, (_, i) => i + 1), [pageCount]);
  const label = fullProgressLabel(current, pageCount);
  const toneButtons = <ToneButtons tone={tone} onChange={chooseTone} />;
  const zoomButtons = <ZoomButtons zoom={zoom} onChange={setZoom} />;

  // ---- states before the book is open -------------------------------------------------------------
  let body;
  if (bookError) {
    body = (
      <Notice>
        <Alert tone="danger" title="This book isn’t in your library" action={<ButtonLink href="/account/library" size="sm" variant="outline">Your library</ButtonLink>}>
          {errorMessage(bookError)}
        </Alert>
      </Notice>
    );
  } else if (linkError) {
    body = (
      <Notice>
        <Alert
          tone="danger"
          title="The book didn’t open"
          action={
            <Button size="sm" variant="outline" onClick={() => setAttempt((a) => a + 1)}>
              Try again
            </Button>
          }
        >
          {linkError}
        </Alert>
      </Notice>
    );
  } else if (preparing) {
    body = (
      <Notice>
        <div className="flex flex-col items-center gap-4 rounded-2xl border border-border bg-surface p-8 text-center" role="status">
          <Spinner label="Preparing your copy" size="lg" />
          <h2 className="text-2xl font-medium">Preparing your personal copy</h2>
          <p className="max-w-sm text-sm text-text-muted">
            We’re adding your name to every page of your copy. It usually takes under a minute; the book opens by itself when it’s ready.
          </p>
        </div>
      </Notice>
    );
  } else if (loadFailed) {
    body = (
      <Notice>
        <Alert
          tone="danger"
          title="The book didn’t load"
          action={
            <Button size="sm" variant="outline" onClick={() => setAttempt((a) => a + 1)}>
              Try again
            </Button>
          }
        >
          Check your connection and try again.
        </Alert>
      </Notice>
    );
  } else if (!doc) {
    body = (
      <div className="mx-auto flex flex-col items-center gap-6" style={{ width }} aria-busy="true" aria-label="Opening the book">
        <Skeleton className="aspect-[2/3] w-full rounded-sm" />
        <Skeleton className="aspect-[2/3] w-full rounded-sm" />
      </div>
    );
  } else {
    body = (
      <div className="mx-auto flex flex-col items-center gap-8">
        {link?.updating && (
          <Alert tone="info" className="w-full max-w-xl">
            An updated edition is being prepared. You’ll get it automatically the next time you open the book.
          </Alert>
        )}
        {pages.map((n) => (
          <PdfPage
            key={n}
            doc={doc}
            pageNumber={n}
            width={width}
            aspect={aspects[n] ?? loaded!.firstAspect}
            tone={tone}
            caption={`Page ${n} of ${pageCount}`}
            onVisible={onVisible}
            onAspect={onAspect}
          />
        ))}
        <div className="flex flex-col items-center gap-3 py-8 text-center">
          <Icon icon={BookOpen} size="lg" className="text-primary" />
          <p className="font-display text-2xl">The end</p>
          <ButtonLink href="/account/library" variant="outline">
            Back to your library
          </ButtonLink>
        </div>
      </div>
    );
  }

  return (
    <div ref={rootRef} className="flex h-dvh flex-col bg-surface-sunken">
      <header className="z-10 flex flex-col border-b border-border bg-surface/95 backdrop-blur safe-x">
        <div className="flex items-center gap-1 px-2 py-1.5 sm:gap-2 sm:px-4">
          <NextLink
            href="/account/library"
            className="flex size-11 shrink-0 items-center justify-center rounded-full text-text hover:bg-secondary"
            aria-label="Back to your library"
          >
            <Icon icon={ArrowLeft} size="md" />
          </NextLink>
          <div className="flex min-w-0 flex-1 flex-col">
            <h1 className="truncate font-display text-base leading-tight sm:text-lg">{book?.title ?? "Your book"}</h1>
            <p className="truncate text-xs text-text-muted">{book?.authors.join(", ") || "Your library"}</p>
          </div>
          <IconButton label="Contents" icon={<Icon icon={List} size="md" />} onClick={() => setContentsOpen(true)} disabled={!book} />
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
          {book && (
            <DownloadButton bookId={bookId} title={book.title} size="sm" variant="outline" className="ml-1 hidden sm:inline-flex" />
          )}
        </div>
        {doc && <ProgressBar value={current} max={pageCount} label="Reading progress" valueText={label} className="[&>div]:h-1 [&>div]:rounded-none" />}
      </header>

      <div ref={scrollRef} className="relative flex-1 overflow-y-auto overscroll-contain px-4 pt-6 pb-20" tabIndex={-1}>
        {body}
      </div>

      {doc && (
        <div className="pointer-events-none fixed inset-x-0 bottom-0 z-10 flex justify-center px-4 pb-3 safe-bottom">
          <p className="pointer-events-auto rounded-full bg-surface/90 px-3 py-1 text-xs text-text-muted shadow-sm tabular-nums backdrop-blur" aria-live="polite">
            {label}
          </p>
        </div>
      )}

      <Drawer open={contentsOpen} onClose={() => setContentsOpen(false)} title="Contents" side="left">
        <LibraryContents
          entries={book?.outline ?? []}
          currentPage={current}
          onJump={(page) => {
            setContentsOpen(false);
            jumpTo(page);
          }}
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
          {book && <DownloadButton bookId={bookId} title={book.title} variant="outline" />}
          <ButtonLink href="/account/library" variant="ghost">
            Back to your library
          </ButtonLink>
        </div>
      </Drawer>
    </div>
  );
}

function Notice({ children }: { children: React.ReactNode }) {
  return <div className="mx-auto max-w-md py-16">{children}</div>;
}

/** The whole table of contents; every chapter with a page number opens there. */
function LibraryContents({ entries, currentPage, onJump }: { entries: LibraryOutlineEntry[]; currentPage: number; onJump: (page: number) => void }) {
  if (entries.length === 0) {
    return <p className="text-sm text-text-muted">This book has no table of contents yet. Scroll, or use the arrow keys to turn pages.</p>;
  }
  return (
    <ol className="flex flex-col">
      {entries.map((entry, index) => {
        const here =
          entry.page !== null && entry.page <= currentPage && !entries.slice(index + 1).some((e) => e.page !== null && e.page <= currentPage);
        return (
          <li key={`${entry.title}-${index}`}>
            <button
              type="button"
              disabled={entry.page === null}
              onClick={() => entry.page !== null && onJump(entry.page)}
              aria-current={here ? "location" : undefined}
              className={cn(
                "flex min-h-11 w-full items-center gap-3 rounded-lg py-2 pr-2 text-left text-sm transition-colors hover:bg-secondary disabled:cursor-default disabled:hover:bg-transparent",
                entry.level === 2 ? "pl-8" : "pl-2",
                here && "bg-primary-subtle text-on-primary-subtle",
              )}
            >
              <span className="min-w-0 flex-1">{entry.title}</span>
              {entry.page !== null && <span className="text-xs text-text-subtle tabular-nums">{entry.page}</span>}
            </button>
          </li>
        );
      })}
    </ol>
  );
}
