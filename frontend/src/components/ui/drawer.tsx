"use client";

import { X } from "lucide-react";
import { useId, useRef, type ReactNode, type RefObject } from "react";
import { cn } from "@/lib/cn";
import { Icon } from "./icon";
import { IconButton } from "./icon-button";
import { Portal } from "./portal";
import { useDialog } from "./use-dialog";

const placements = {
  right: "inset-y-0 right-0 h-dvh w-full max-w-md animate-slide-in-right sm:rounded-l-2xl",
  left: "inset-y-0 left-0 h-dvh w-[88vw] max-w-sm animate-slide-in-left rounded-r-2xl",
  bottom: "inset-x-0 bottom-0 max-h-[92dvh] w-full animate-sheet-up rounded-t-2xl",
} as const;

export interface DrawerProps {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  /** Hide the visible title (still announced), e.g. a nav drawer with its own branding. */
  hideTitle?: boolean;
  side?: keyof typeof placements;
  children: ReactNode;
  footer?: ReactNode;
  initialFocusRef?: RefObject<HTMLElement | null>;
  className?: string;
}

/**
 * Edge panel: cart (right, full-width on phones), mobile navigation (left), filters (bottom).
 * Never place a portal-based control (DropdownMenu, Tooltip) inside: use inline controls
 * (frontend/CLAUDE.md).
 */
export function Drawer({
  open,
  onClose,
  title,
  hideTitle,
  side = "right",
  children,
  footer,
  initialFocusRef,
  className,
}: DrawerProps) {
  const titleId = useId();
  const panelRef = useRef<HTMLDivElement>(null);
  useDialog({ open, onClose, panelRef, initialFocusRef });

  if (!open) return null;

  return (
    <Portal>
      <div className="fixed inset-0 z-(--z-drawer)">
        <div aria-hidden="true" className="absolute inset-0 animate-fade-in bg-overlay" onClick={onClose} />
        <div
          ref={panelRef}
          role="dialog"
          aria-modal="true"
          aria-labelledby={titleId}
          tabIndex={-1}
          className={cn(
            "absolute flex flex-col overflow-hidden bg-surface-raised shadow-xl outline-none",
            placements[side],
            className,
          )}
        >
          <header className="flex shrink-0 items-center justify-between gap-4 border-b border-border px-5 py-3 pt-[max(0.75rem,env(safe-area-inset-top))]">
            <h2 id={titleId} className={cn("text-xl font-medium text-text", hideTitle && "sr-only")}>
              {title}
            </h2>
            <IconButton label="Close" onClick={onClose} icon={<Icon icon={X} />} className="-mr-2 ml-auto" />
          </header>
          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 py-4">{children}</div>
          {footer && <footer className="safe-bottom shrink-0 border-t border-border px-5 pt-4">{footer}</footer>}
        </div>
      </div>
    </Portal>
  );
}
