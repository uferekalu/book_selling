"use client";

import type { PDFDocumentProxy, RenderTask } from "pdfjs-dist";
import { useEffect, useRef, useState, type CSSProperties } from "react";
import { cn } from "@/lib/cn";
import { loadPdfJs } from "./pdf";
import { NO_CROP, type Crop } from "./reader-logic";

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
  onAspect,
  crop = NO_CROP,
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
  /** Reports the page's real height / width once loaded (pages of one book can differ). */
  onAspect?: (pageNumber: number, aspect: number) => void;
  /**
   * Side margins to trim (phones, BS-32): the page is drawn wider so its text column fills
   * `width`, and the margins fall outside the frame. The text layer moves with it.
   */
  crop?: Crop;
}) {
  const frameRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const textRef = useRef<HTMLDivElement>(null);
  const [near, setNear] = useState(false);
  const [rendered, setRendered] = useState(false);
  // The whole page's drawn width: wider than the frame when the side margins are trimmed.
  const drawn = Math.round(width / (1 - crop.left - crop.right));

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
      onAspect?.(pageNumber, base.height / base.width);
      const viewport = page.getViewport({ scale: drawn / base.width });
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
  }, [near, doc, pageNumber, drawn, onAspect]);

  const style = { width, height: Math.round(drawn * aspect) } as CSSProperties;
  const sheet = { width: drawn, height: Math.round(drawn * aspect), left: -Math.round(drawn * crop.left) } as CSSProperties;
  return (
    <figure className="flex flex-col items-center gap-2" data-page={pageNumber}>
      <div
        ref={frameRef}
        className={cn("reader-page relative overflow-hidden rounded-sm bg-paper-50 shadow-book", !rendered && "animate-pulse")}
        style={style}
      >
        <div className="absolute top-0" style={sheet}>
          <canvas
            ref={canvasRef}
            className="absolute inset-0 size-full"
            style={{ filter: TONE_FILTER[tone] }}
            aria-hidden="true"
          />
          <div ref={textRef} className="textLayer" />
        </div>
      </div>
      <figcaption className="text-xs text-text-subtle tabular-nums">{caption}</figcaption>
    </figure>
  );
}
