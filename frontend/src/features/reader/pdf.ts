"use client";

import type { PDFDocumentProxy } from "pdfjs-dist";
import { NO_CROP, bookCrop, samplePages, textBounds, type Crop } from "./reader-logic";

type PdfJs = typeof import("pdfjs-dist");

let loading: Promise<PdfJs> | null = null;

/**
 * pdf.js, loaded only when a reader opens (the book page stays light). Parsing runs in a web
 * worker so scrolling stays smooth on phones.
 */
export function loadPdfJs(): Promise<PdfJs> {
  loading ??= import("pdfjs-dist").then((pdfjs) => {
    if (!pdfjs.GlobalWorkerOptions.workerPort) {
      pdfjs.GlobalWorkerOptions.workerPort = new Worker(new URL("pdfjs-dist/build/pdf.worker.min.mjs", import.meta.url), {
        type: "module",
      });
    }
    return pdfjs;
  });
  return loading;
}

/**
 * Starts pdf.js and its worker ahead of time, so a reader opened next (an in-app navigation keeps
 * them running) only has to fetch the PDF itself. BS-27: on a slow link the engine's downloads
 * were most of the 13–18 s to the first preview page; the bundler wraps the worker in its own
 * chunk, so only creating the worker the real way fetches the right files. Skipped when the
 * visitor asked to save data or is on a very slow connection.
 */
export function prefetchPdfJs(): void {
  const connection = (navigator as Navigator & { connection?: { saveData?: boolean; effectiveType?: string } }).connection;
  if (connection?.saveData || connection?.effectiveType === "slow-2g" || connection?.effectiveType === "2g") return;
  void loadPdfJs().catch(() => {
    loading = null; // a failed warm-up must not stop the reader from trying again
  });
}

/**
 * Opens a PDF; aborting the signal destroys the loading task and the document with it. `lazy` reads
 * only the byte ranges of the pages drawn (a large file seen a few pages at a time). Otherwise the
 * whole file is fetched at the same time as pdf.js loads, not after it (a preview is small).
 */
export async function openPdf(
  url: string,
  signal: AbortSignal,
  { lazy = false }: { lazy?: boolean } = {},
): Promise<{ pdfjs: PdfJs; doc: PDFDocumentProxy }> {
  const bytes = lazy
    ? null
    : fetch(url, { credentials: "omit", signal }).then((response) => {
        if (!response.ok) throw new Error(`The preview could not be loaded (${response.status})`);
        return response.arrayBuffer();
      });
  // Don't leave a rejected promise unobserved if pdf.js fails to load first.
  bytes?.catch(() => undefined);
  const pdfjs = await loadPdfJs();
  const task = pdfjs.getDocument({
    ...(bytes ? { data: new Uint8Array(await bytes) } : { url }),
    // No cookies: the preview is public, and staff links to the book file are signed.
    withCredentials: false,
    enableXfa: false,
    ...(lazy ? { disableAutoFetch: true, disableStream: true } : {}),
  });
  signal.addEventListener("abort", () => void task.destroy(), { once: true });
  const doc = await task.promise;
  return { pdfjs, doc };
}

const crops = new WeakMap<PDFDocumentProxy, Promise<Crop>>();

/**
 * The book's text margins, measured from a few sampled pages (BS-32), so a phone can show the
 * text column at the full screen width. Measured once per opened document; any failure means
 * no trim (the page is shown whole, as before).
 */
export function measureCrop(doc: PDFDocumentProxy): Promise<Crop> {
  let pending = crops.get(doc);
  if (!pending) {
    pending = (async () => {
      const pdfjs = await loadPdfJs();
      const bounds = await Promise.all(
        samplePages(doc.numPages).map(async (n) => {
          const page = await doc.getPage(n);
          const viewport = page.getViewport({ scale: 1 });
          const content = await page.getTextContent();
          const items = content.items.flatMap((item) => {
            if (!("transform" in item) || !item.str.trim()) return [];
            const [, , , , x] = pdfjs.Util.transform(viewport.transform, item.transform);
            return [{ x, width: item.width }];
          });
          return textBounds(items, viewport.width);
        }),
      );
      return bookCrop(bounds);
    })().catch(() => NO_CROP);
    crops.set(doc, pending);
  }
  return pending;
}
