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
 * Opens a PDF; aborting the signal destroys the loading task and the document with it. `lazy` reads
 * only the byte ranges of the pages drawn (a large file seen a few pages at a time).
 */
export async function openPdf(
  url: string,
  signal: AbortSignal,
  { lazy = false }: { lazy?: boolean } = {},
): Promise<{ pdfjs: PdfJs; doc: PDFDocumentProxy }> {
  const pdfjs = await loadPdfJs();
  const task = pdfjs.getDocument({
    url,
    // No cookies: the preview is public, and staff links to the book file are signed.
    withCredentials: false,
    enableXfa: false,
    ...(lazy ? { disableAutoFetch: true, disableStream: true } : {}),
  });
  signal.addEventListener("abort", () => void task.destroy(), { once: true });
  const doc = await task.promise;
  return { pdfjs, doc };
}
