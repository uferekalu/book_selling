"use client";

import { useEffect, useRef, type RefObject } from "react";

const FOCUSABLE =
  'a[href], area[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), iframe, [contenteditable="true"], [tabindex]:not([tabindex="-1"])';

export function getFocusable(container: HTMLElement): HTMLElement[] {
  return Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
    (el) =>
      !el.hasAttribute("disabled") && el.getAttribute("aria-hidden") !== "true",
  );
}

// Body scroll lock shared by every open dialog, so closing a nested one doesn't unlock the page.
let lockCount = 0;
let savedOverflow = "";
let savedPaddingRight = "";

function lockScroll() {
  if (lockCount === 0) {
    const scrollbar = window.innerWidth - document.documentElement.clientWidth;
    savedOverflow = document.body.style.overflow;
    savedPaddingRight = document.body.style.paddingRight;
    document.body.style.overflow = "hidden";
    // Keep layout from jumping when the desktop scrollbar disappears.
    if (scrollbar > 0) document.body.style.paddingRight = `${scrollbar}px`;
  }
  lockCount += 1;
}

/**
 * Makes everything outside the dialog `inert` (no focus, no clicks, hidden from assistive tech).
 * `aria-modal` alone isn't honoured by every screen reader. Each dialog records exactly which
 * elements it made inert, so closing a nested dialog leaves its parent's inert set intact.
 */
function inertOutside(panel: HTMLElement): () => void {
  const root = Array.from(document.body.children).find((child) =>
    child.contains(panel),
  );
  const changed: Element[] = [];
  for (const child of Array.from(document.body.children)) {
    // Toasts stay live: a confirmation raised from inside a dialog must still be announced.
    if (
      child === root ||
      child.hasAttribute("inert") ||
      child.tagName === "SCRIPT" ||
      // Next.js announces page changes here; navigating from inside a drawer must still be announced.
      child.tagName === "NEXT-ROUTE-ANNOUNCER" ||
      child.matches("[data-toast-region]") ||
      child.querySelector("[data-toast-region]") !== null
    ) {
      continue;
    }
    child.setAttribute("inert", "");
    changed.push(child);
  }
  return () => changed.forEach((element) => element.removeAttribute("inert"));
}

function unlockScroll() {
  lockCount = Math.max(0, lockCount - 1);
  if (lockCount === 0) {
    document.body.style.overflow = savedOverflow;
    document.body.style.paddingRight = savedPaddingRight;
  }
}

/**
 * Modal-dialog behaviour for Modal and Drawer (WAI-ARIA dialog pattern): moves focus inside on
 * open (to `initialFocus`, else the first focusable element, else the panel), traps Tab/Shift+Tab,
 * closes on Escape, locks page scroll, and returns focus to the trigger on close.
 */
export function useDialog({
  open,
  onClose,
  panelRef,
  initialFocusRef,
}: {
  open: boolean;
  onClose: () => void;
  panelRef: RefObject<HTMLElement | null>;
  initialFocusRef?: RefObject<HTMLElement | null>;
}) {
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    if (!open) return;
    const previouslyFocused = document.activeElement as HTMLElement | null;
    const panel = panelRef.current;
    if (!panel) return;

    const target = initialFocusRef?.current ?? getFocusable(panel)[0] ?? panel;
    target.focus({ preventScroll: true });

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        // Only the top-most dialog reacts; nested dialogs stop propagation themselves.
        event.stopPropagation();
        onCloseRef.current();
        return;
      }
      if (event.key !== "Tab") return;
      const items = getFocusable(panel);
      if (items.length === 0) {
        event.preventDefault();
        panel.focus();
        return;
      }
      const first = items[0];
      const last = items[items.length - 1];
      const active = document.activeElement;
      if (event.shiftKey && (active === first || active === panel)) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && active === last) {
        event.preventDefault();
        first.focus();
      }
    };

    panel.addEventListener("keydown", onKeyDown);
    lockScroll();
    const restoreInert = inertOutside(panel);
    return () => {
      panel.removeEventListener("keydown", onKeyDown);
      restoreInert();
      unlockScroll();
      previouslyFocused?.focus?.({ preventScroll: true });
    };
  }, [open, panelRef, initialFocusRef]);
}
