"use client";

import type { PDFDocumentProxy } from "pdfjs-dist";

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
 * Downloads pdf.js and its worker into the browser cache without starting anything, so a reader
 * opened next skips those round trips (BS-27: on a slow link they were most of the 13 s to the
 * first page). Skipped when the visitor asked to save data or is on a very slow connection.
 */
export function prefetchPdfJs(): void {
  const connection = (navigator as Navigator & { connection?: { saveData?: boolean; effectiveType?: string } }).connection;
  if (connection?.saveData || connection?.effectiveType === "slow-2g" || connection?.effectiveType === "2g") return;
  void import("pdfjs-dist").catch(() => undefined);
  const worker = new URL("pdfjs-dist/build/pdf.worker.min.mjs", import.meta.url).href;
  if (!document.querySelector(`link[rel="prefetch"][href="${worker}"]`)) {
    const link = document.createElement("link");
    link.rel = "prefetch";
    link.href = worker;
    document.head.appendChild(link);
  }
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
