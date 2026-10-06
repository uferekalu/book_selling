"use client";

import { Coffee, Moon, Sun, ZoomIn, ZoomOut } from "lucide-react";
import type { PDFDocumentProxy } from "pdfjs-dist";
import { useEffect, useState } from "react";
import { Icon, IconButton, Switch } from "@/components/ui";
import { cn } from "@/lib/cn";
import type { PaperTone } from "./pdf-page";
import { measureCrop } from "./pdf";
import { NO_CROP, nextZoom, type Crop } from "./reader-logic";

const TONE_KEY = "bs_reader_tone";
const TONES: Array<{ value: PaperTone; label: string; icon: typeof Sun }> = [
  { value: "paper", label: "Paper", icon: Sun },
  { value: "sepia", label: "Sepia", icon: Coffee },
  { value: "night", label: "Night", icon: Moon },
];

function initialTone(): PaperTone {
  try {
    const stored = window.localStorage.getItem(TONE_KEY);
    if (stored === "paper" || stored === "sepia" || stored === "night") return stored;
  } catch {
    // fall through
  }
  const theme = document.documentElement.getAttribute("data-theme");
  const dark = theme === "dark" || (theme === null && window.matchMedia("(prefers-color-scheme: dark)").matches);
  return dark ? "night" : "paper";
}

/** The page colour, remembered across books and visits (Night by default in dark mode). */
export function useReaderTone(): [PaperTone, (tone: PaperTone) => void] {
  const [tone, setTone] = useState<PaperTone>(initialTone);
  const choose = (value: PaperTone) => {
    setTone(value);
    try {
      window.localStorage.setItem(TONE_KEY, value);
    } catch {
      // ignore
    }
  };
  return [tone, choose];
}

export function ToneButtons({ tone, onChange }: { tone: PaperTone; onChange: (tone: PaperTone) => void }) {
  return (
    <div role="radiogroup" aria-label="Page colour" className="flex gap-1">
      {TONES.map((t) => (
        <button
          key={t.value}
          type="button"
          role="radio"
          aria-checked={tone === t.value}
          onClick={() => onChange(t.value)}
          className={cn(
            "flex min-h-11 items-center gap-2 rounded-full px-3 text-sm font-medium transition-colors",
            tone === t.value ? "bg-primary text-on-primary" : "text-text hover:bg-secondary",
          )}
        >
          <Icon icon={t.icon} size="sm" />
          <span className="sm:sr-only lg:not-sr-only">{t.label}</span>
        </button>
      ))}
    </div>
  );
}

export function ZoomButtons({ zoom, onChange }: { zoom: number; onChange: (zoom: number) => void }) {
  return (
    <div className="flex items-center gap-1">
      <IconButton label="Zoom out" icon={<Icon icon={ZoomOut} size="sm" />} onClick={() => onChange(nextZoom(zoom, -1))} disabled={zoom <= 0.75} />
      <button
        type="button"
        onClick={() => onChange(1)}
        className="min-h-11 min-w-14 rounded-full px-2 text-sm font-medium text-text tabular-nums hover:bg-secondary"
        aria-label={`Zoom ${Math.round(zoom * 100)}%, reset to fit width`}
      >
        {Math.round(zoom * 100)}%
      </button>
      <IconButton label="Zoom in" icon={<Icon icon={ZoomIn} size="sm" />} onClick={() => onChange(nextZoom(zoom, 1))} disabled={zoom >= 2} />
    </div>
  );
}

const FIT_KEY = "bs_reader_fit";
/** Below this width the page's margins are trimmed so the text is readable (BS-32). */
export const FIT_TEXT_BELOW = 640;

/**
 * "Fit text to the screen" on phones: the book's side margins are measured once and trimmed, so
 * the text column fills the screen instead of a whole page shrunk to fit. On by default; the
 * choice is remembered. Wider screens show whole pages.
 */
export function useFitText(doc: PDFDocumentProxy | null, available: number) {
  const [fit, setFitState] = useState<boolean>(() => {
    try {
      return window.localStorage.getItem(FIT_KEY) !== "0";
    } catch {
      return true;
    }
  });
  const [measured, setMeasured] = useState<{ doc: PDFDocumentProxy; crop: Crop } | null>(null);
  const applies = available < FIT_TEXT_BELOW;
  useEffect(() => {
    if (!doc || !fit || !applies || measured?.doc === doc) return;
    let cancelled = false;
    void measureCrop(doc).then((crop) => {
      if (!cancelled) setMeasured({ doc, crop });
    });
    return () => {
      cancelled = true;
    };
  }, [doc, fit, applies, measured]);
  const setFit = (value: boolean) => {
    setFitState(value);
    try {
      window.localStorage.setItem(FIT_KEY, value ? "1" : "0");
    } catch {
      // ignore
    }
  };
  const crop = fit && applies && measured?.doc === doc ? measured.crop : NO_CROP;
  return { crop, fit, setFit, applies };
}

export function FitTextSwitch({ fit, onChange }: { fit: boolean; onChange: (fit: boolean) => void }) {
  return (
    <Switch
      checked={fit}
      onCheckedChange={onChange}
      label="Fit text to the screen"
      description="Trims the page margins so the words are larger on a phone. Turn off to see whole pages."
    />
  );
}

/** Horizontal padding of the reading area, so pages use the width that is really there. */
export function paddingX(el: HTMLElement): number {
  const style = window.getComputedStyle(el);
  return (Number.parseFloat(style.paddingLeft) || 0) + (Number.parseFloat(style.paddingRight) || 0);
}
