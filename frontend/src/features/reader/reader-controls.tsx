"use client";

import { Coffee, Moon, Sun, ZoomIn, ZoomOut } from "lucide-react";
import { useState } from "react";
import { Icon, IconButton } from "@/components/ui";
import { cn } from "@/lib/cn";
import type { PaperTone } from "./pdf-page";
import { nextZoom } from "./reader-logic";

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
