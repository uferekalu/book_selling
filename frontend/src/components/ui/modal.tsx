"use client";

import { X } from "lucide-react";
import { useId, useRef, type ReactNode, type RefObject } from "react";
import { cn } from "@/lib/cn";
import { Icon } from "./icon";
import { IconButton } from "./icon-button";
import { Portal } from "./portal";
import { useDialog } from "./use-dialog";

const widths = { sm: "sm:max-w-sm", md: "sm:max-w-lg", lg: "sm:max-w-2xl", xl: "sm:max-w-4xl" } as const;

export interface ModalProps {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  description?: ReactNode;
  children?: ReactNode;
  /** Action buttons. Stacked full-width on phones, right-aligned from `sm`. */
  footer?: ReactNode;
  size?: keyof typeof widths;
  /** Element to focus on open instead of the first focusable one. */
  initialFocusRef?: RefObject<HTMLElement | null>;
  /** Prevent closing via backdrop tap (e.g. while a payment request is in flight). */
  dismissible?: boolean;
}

/**
 * Dialog that is a bottom sheet on phones (thumb-reachable, safe-area aware) and a centred card
 * from the `sm` breakpoint up.
 */
export function Modal({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  size = "md",
  initialFocusRef,
  dismissible = true,
}: ModalProps) {
  const titleId = useId();
  const descriptionId = useId();
  const panelRef = useRef<HTMLDivElement>(null);
  const close = () => {
    if (dismissible) onClose();
  };
  useDialog({ open, onClose: close, panelRef, initialFocusRef });

  if (!open) return null;

  return (
    <Portal>
      <div className="fixed inset-0 z-(--z-modal) flex items-end justify-center sm:items-center sm:p-6">
        {/* Backdrop is a sibling painted first (behind the panel); no z-index of its own on purpose. */}
        <div aria-hidden="true" className="absolute inset-0 animate-fade-in bg-overlay" onClick={close} />
        <div
          ref={panelRef}
          role="dialog"
          aria-modal="true"
          aria-labelledby={titleId}
          aria-describedby={description ? descriptionId : undefined}
          tabIndex={-1}
          className={cn(
            "relative flex max-h-[92dvh] w-full flex-col overflow-hidden bg-surface-raised shadow-xl outline-none",
            "animate-sheet-up rounded-t-2xl sm:animate-scale-in sm:rounded-2xl",
            widths[size],
          )}
        >
          <div aria-hidden="true" className="mx-auto mt-2.5 h-1.5 w-10 shrink-0 rounded-full bg-border-strong sm:hidden" />
          <header className="flex items-start justify-between gap-4 px-5 pt-4 pb-2 sm:px-7 sm:pt-6">
            <div className="flex min-w-0 flex-col gap-1">
              <h2 id={titleId} className="text-2xl font-medium text-text">
                {title}
              </h2>
              {description && (
                <p id={descriptionId} className="text-sm text-text-muted">
                  {description}
                </p>
              )}
            </div>
            <IconButton label="Close" onClick={onClose} icon={<Icon icon={X} />} className="-mt-1 -mr-2" />
          </header>
          {children && <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 py-3 sm:px-7">{children}</div>}
          {footer && (
            <footer className="safe-bottom flex flex-col-reverse gap-2 border-t border-border px-5 pt-4 sm:flex-row sm:justify-end sm:px-7 sm:pb-6">
              {footer}
            </footer>
          )}
          {!footer && <div className="safe-bottom" />}
        </div>
      </div>
    </Portal>
  );
}
