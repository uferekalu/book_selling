"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import { Children, useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { cn } from "@/lib/cn";
import { Icon } from "./icon";

export interface CarouselProps {
  /** Names the carousel for screen readers, e.g. "Recently viewed books". */
  label: string;
  children: ReactNode;
  /** Width of each slide, e.g. "w-32 sm:w-40". */
  itemClassName?: string;
  className?: string;
}

/**
 * A sideways row of slides (BS-35). Swipe or scroll on any device; on wider screens round arrow
 * buttons page through it. Slides snap into place, the first and last line up with the page
 * edges (nothing is cut off at the end), and the edges fade only where more slides are hidden.
 */
export function Carousel({ label, children, itemClassName, className }: CarouselProps) {
  const track = useRef<HTMLUListElement>(null);
  const [edges, setEdges] = useState({ start: true, end: true });

  const measure = useCallback(() => {
    const el = track.current;
    if (!el) return;
    setEdges({ start: el.scrollLeft <= 4, end: el.scrollLeft + el.clientWidth >= el.scrollWidth - 4 });
  }, []);

  useEffect(() => {
    const el = track.current;
    if (!el) return;
    measure();
    el.addEventListener("scroll", measure, { passive: true });
    // Older browsers have no ResizeObserver: window resizes are enough there.
    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(measure);
    observer?.observe(el);
    if (!observer) window.addEventListener("resize", measure);
    return () => {
      el.removeEventListener("scroll", measure);
      observer?.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, [measure]);

  const page = (direction: 1 | -1) => {
    const el = track.current;
    if (!el) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    el.scrollBy({ left: direction * el.clientWidth * 0.85, behavior: reduce ? "auto" : "smooth" });
  };

  const fade =
    edges.start && edges.end
      ? undefined
      : `linear-gradient(to right, ${edges.start ? "black" : "transparent"}, black 3rem, black calc(100% - 3rem), ${edges.end ? "black" : "transparent"})`;

  return (
    <div role="region" aria-roledescription="carousel" aria-label={label} className={cn("relative", className)}>
      <ul
        ref={track}
        className="scrollbar-none -mx-4 flex snap-x snap-mandatory scroll-px-4 gap-4 overflow-x-auto overscroll-x-contain px-4 pt-1 pb-3 sm:-mx-6 sm:scroll-px-6 sm:gap-6 sm:px-6"
        style={fade ? { maskImage: fade, WebkitMaskImage: fade } : undefined}
      >
        {Children.toArray(children).map((child, index) => (
          <li key={index} className={cn("shrink-0 snap-start", itemClassName)}>
            {child}
          </li>
        ))}
        {/* Room after the last slide, so it can scroll fully into view past the fade. */}
        <li aria-hidden="true" className="w-px shrink-0" />
      </ul>
      {!(edges.start && edges.end) && (
        <>
          <ArrowButton side="left" disabled={edges.start} onClick={() => page(-1)} />
          <ArrowButton side="right" disabled={edges.end} onClick={() => page(1)} />
        </>
      )}
    </div>
  );
}

function ArrowButton({ side, disabled, onClick }: { side: "left" | "right"; disabled: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={side === "left" ? "Scroll back" : "Scroll forward"}
      className={cn(
        // Touch screens swipe; the arrows are for mouse and keyboard users on wider screens.
        "absolute top-[38%] z-10 hidden size-11 -translate-y-1/2 place-items-center rounded-full border border-border bg-surface-raised text-text shadow-md transition-[opacity,transform,background-color] duration-(--duration-base) hover:scale-105 hover:bg-secondary disabled:pointer-events-none disabled:opacity-0 sm:grid",
        side === "left" ? "-left-2 lg:-left-5" : "-right-2 lg:-right-5",
      )}
    >
      <Icon icon={side === "left" ? ChevronLeft : ChevronRight} size="md" />
    </button>
  );
}
