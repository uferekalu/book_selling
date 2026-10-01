"use client";

import { AlertTriangle, CheckCircle2, Info, X, XCircle } from "lucide-react";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { cn } from "@/lib/cn";
import { Icon } from "./icon";
import { IconButton } from "./icon-button";
import { Portal } from "./portal";

type ToastTone = "info" | "success" | "warning" | "danger";

export interface ToastOptions {
  title: string;
  description?: string;
  tone?: ToastTone;
  /** Milliseconds; `null` keeps it until dismissed. Default 5000 (8000 for danger). */
  duration?: number | null;
  action?: { label: string; onClick: () => void };
}

interface ToastItem extends ToastOptions {
  id: number;
}

interface ToastContextValue {
  toast: (options: ToastOptions) => number;
  dismiss: (id: number) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

const MAX_VISIBLE = 3;

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used inside <ToastProvider>");
  return ctx;
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const nextId = useRef(1);

  const dismiss = useCallback((id: number) => {
    setToasts((current) => current.filter((t) => t.id !== id));
  }, []);

  const toast = useCallback((options: ToastOptions) => {
    const id = nextId.current++;
    setToasts((current) => [...current, { ...options, id }].slice(-MAX_VISIBLE));
    return id;
  }, []);

  const value = useMemo(() => ({ toast, dismiss }), [toast, dismiss]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <Portal>
        {/* Bottom-centre above the thumb zone on phones, bottom-right on larger screens. */}
        <div
          data-toast-region
          aria-live="polite"
          aria-relevant="additions"
          className="pointer-events-none fixed inset-x-0 bottom-0 z-(--z-toast) flex flex-col items-center gap-2 p-4 pb-[max(1rem,env(safe-area-inset-bottom))] sm:inset-x-auto sm:right-0 sm:items-end sm:p-6"
        >
          {toasts.map((item) => (
            <ToastCard key={item.id} item={item} onDismiss={dismiss} />
          ))}
        </div>
      </Portal>
    </ToastContext.Provider>
  );
}

const toneIcon = { info: Info, success: CheckCircle2, warning: AlertTriangle, danger: XCircle } as const;
const toneColor = { info: "text-info", success: "text-success", warning: "text-warning", danger: "text-danger" } as const;

function ToastCard({ item, onDismiss: dismissById }: { item: ToastItem; onDismiss: (id: number) => void }) {
  const tone = item.tone ?? "info";
  // Stable per toast, so a new toast arriving doesn't restart the timers of the visible ones.
  const onDismiss = useCallback(() => dismissById(item.id), [dismissById, item.id]);
  const duration = item.duration === undefined ? (tone === "danger" ? 8000 : 5000) : item.duration;
  const [paused, setPaused] = useState(false);

  useEffect(() => {
    if (duration === null || paused) return;
    const timer = window.setTimeout(onDismiss, duration);
    return () => window.clearTimeout(timer);
  }, [duration, paused, onDismiss]);

  return (
    <div
      role={tone === "danger" ? "alert" : "status"}
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={() => setPaused(false)}
      className="pointer-events-auto flex w-full max-w-sm animate-rise-in items-start gap-3 rounded-xl border border-border bg-surface-raised p-4 shadow-lg"
    >
      <Icon icon={toneIcon[tone]} className={cn("mt-0.5", toneColor[tone])} />
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <p className="text-sm font-semibold text-text">{item.title}</p>
        {item.description && <p className="text-sm text-text-muted">{item.description}</p>}
        {item.action && (
          <button
            type="button"
            onClick={() => {
              item.action?.onClick();
              onDismiss();
            }}
            className="mt-1.5 self-start text-sm font-semibold text-primary underline-offset-4 hover:underline"
          >
            {item.action.label}
          </button>
        )}
      </div>
      <IconButton size="sm" label="Dismiss notification" onClick={onDismiss} icon={<Icon icon={X} size="sm" />} className="-mt-1.5 -mr-1.5" />
    </div>
  );
}
