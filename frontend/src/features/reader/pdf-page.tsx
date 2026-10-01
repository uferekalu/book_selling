"use client";

import type { PDFDocumentProxy, RenderTask } from "pdfjs-dist";
import { useEffect, useRef, useState, type CSSProperties } from "react";
import { cn } from "@/lib/cn";
import { loadPdfJs } from "./pdf";

export type PaperTone = "paper" | "sepia" | "night";

const TONE_FILTER: Record<PaperTone, string | undefined> = {
  paper: undefined,
  sepia: "sepia(0.35) saturate(1.1) brightness(0.97)",
  // Inverts the page for night reading; hue-rotate keeps colours in figures recognisable.
  night: "invert(0.88) hue-rotate(180deg) contrast(0.95)",
};

/**
 * One page: a placeholder of the right size until it nears the viewport, then a crisp canvas
 * (device-pixel-ratio aware) with a selectable, screen-reader-accessible text layer on top.
 */
export function PdfPage({
  doc,
  pageNumber,
  width,
  aspect,
  tone,
  caption,
  onVisible,
}: {
  doc: PDFDocumentProxy;
  pageNumber: number;
  /** Rendered width in CSS pixels. */
  width: number;
  /** height / width of this page. */
  aspect: number;
  tone: PaperTone;
  caption: string;
  onVisible: (pageNumber: number) => void;
}) {
  const frameRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const textRef = useRef<HTMLDivElement>(null);
  const [near, setNear] = useState(false);
  const [rendered, setRendered] = useState(false);

  // Render pages within ~1.5 screens; report the page that fills the middle of the screen.
  useEffect(() => {
    const frame = frameRef.current;
    if (!frame) return;
    const nearObserver = new IntersectionObserver(([entry]) => setNear(entry.isIntersecting), { rootMargin: "150% 0px" });
    const middleObserver = new IntersectionObserver(([entry]) => entry.isIntersecting && onVisible(pageNumber), {
      rootMargin: "-45% 0px -45% 0px",
    });
    nearObserver.observe(frame);
    middleObserver.observe(frame);
    return () => {
      nearObserver.disconnect();
      middleObserver.disconnect();
    };
  }, [pageNumber, onVisible]);

  useEffect(() => {
    if (!near) return;
    let cancelled = false;
    let task: RenderTask | null = null;
    let textLayer: { cancel: () => void } | null = null;
    void (async () => {
      const pdfjs = await loadPdfJs();
      const page = await doc.getPage(pageNumber);
      if (cancelled) return;
      const base = page.getViewport({ scale: 1 });
      const viewport = page.getViewport({ scale: width / base.width });
      const ratio = Math.min(window.devicePixelRatio || 1, 3);
      const canvas = canvasRef.current;
      const text = textRef.current;
      if (!canvas || !text) return;
      canvas.width = Math.floor(viewport.width * ratio);
      canvas.height = Math.floor(viewport.height * ratio);
      task = page.render({
        canvas,
        viewport,
        transform: ratio !== 1 ? [ratio, 0, 0, ratio, 0, 0] : undefined,
      });
      try {
        await task.promise;
      } catch {
        return; // cancelled by a newer render
      }
      if (cancelled) return;
      text.replaceChildren();
      frameRef.current?.style.setProperty("--scale-factor", String(viewport.scale));
      const layer = new pdfjs.TextLayer({ textContentSource: page.streamTextContent(), container: text, viewport });
      textLayer = layer;
      await layer.render().catch(() => undefined);
      if (!cancelled) setRendered(true);
    })();
    return () => {
      cancelled = true;
      task?.cancel();
      textLayer?.cancel();
    };
  }, [near, doc, pageNumber, width]);

  const style = { width, height: Math.round(width * aspect) } as CSSProperties;
  return (
    <figure className="flex flex-col items-center gap-2" data-page={pageNumber}>
      <div
        ref={frameRef}
        className={cn("reader-page relative overflow-hidden rounded-sm bg-paper-50 shadow-book", !rendered && "animate-pulse")}
        style={style}
      >
        <canvas
          ref={canvasRef}
          className="absolute inset-0 size-full"
          style={{ filter: TONE_FILTER[tone] }}
          aria-hidden="true"
        />
        <div ref={textRef} className="textLayer" />
      </div>
      <figcaption className="text-xs text-text-subtle tabular-nums">{caption}</figcaption>
    </figure>
  );
}
