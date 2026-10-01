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

/** Opens a PDF; aborting the signal destroys the loading task and the document with it. */
export async function openPdf(url: string, signal: AbortSignal): Promise<{ pdfjs: PdfJs; doc: PDFDocumentProxy }> {
  const pdfjs = await loadPdfJs();
  const task = pdfjs.getDocument({
    url,
    // Same-origin through the /api proxy; no cookies are needed for a public preview.
    withCredentials: false,
    enableXfa: false,
  });
  signal.addEventListener("abort", () => void task.destroy(), { once: true });
  const doc = await task.promise;
  return { pdfjs, doc };
}
