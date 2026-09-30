"use client";

import { cloneElement, useCallback, useEffect, useId, useLayoutEffect, useRef, useState, type ReactElement } from "react";
import { Portal } from "./portal";

export interface TooltipProps {
  content: string;
  /** A single focusable element (usually an IconButton). */
  children: ReactElement<{ "aria-describedby"?: string }>;
  side?: "top" | "bottom";
}

const GAP = 8;
const EDGE = 8;

/**
 * Supplementary text on hover and keyboard focus (WAI-ARIA tooltip). Never put essential
 * information only in a tooltip: touch users can't hover. Escape hides it. The position is
 * clamped to the viewport so it never renders off-screen on a phone.
 */
export function Tooltip({ content, children, side = "top" }: TooltipProps) {
  const id = useId();
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState<{ top: number; left: number } | null>(null);
  const anchorRef = useRef<HTMLSpanElement>(null);
  const tipRef = useRef<HTMLDivElement>(null);

  const show = useCallback(() => setOpen(true), []);
  const hide = useCallback(() => {
    setOpen(false);
    setPosition(null);
  }, []);

  useLayoutEffect(() => {
    if (!open || !anchorRef.current || !tipRef.current) return;
    const anchor = anchorRef.current.getBoundingClientRect();
    const tip = tipRef.current.getBoundingClientRect();
    const preferredTop = side === "top" ? anchor.top - tip.height - GAP : anchor.bottom + GAP;
    const top = preferredTop < EDGE ? anchor.bottom + GAP : preferredTop;
    const centred = anchor.left + anchor.width / 2 - tip.width / 2;
    const left = Math.min(Math.max(EDGE, centred), window.innerWidth - tip.width - EDGE);
    setPosition({ top, left });
  }, [open, side]);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => event.key === "Escape" && hide();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, hide]);

  return (
    <>
      <span
        ref={anchorRef}
        className="inline-flex"
        onMouseEnter={show}
        onMouseLeave={hide}
        onFocus={show}
        onBlur={hide}
      >
        {cloneElement(children, { "aria-describedby": open ? id : undefined })}
      </span>
      {open && (
        <Portal>
          <div
            ref={tipRef}
            id={id}
            role="tooltip"
            style={{ top: position?.top ?? -9999, left: position?.left ?? -9999 }}
            className="pointer-events-none fixed z-(--z-tooltip) max-w-64 animate-fade-in rounded-md bg-text px-2.5 py-1.5 text-xs font-medium text-background shadow-md"
          >
            {content}
          </div>
        </Portal>
      )}
    </>
  );
}
