"use client";

import { useId, type ReactNode } from "react";
import { cn } from "@/lib/cn";

export interface SwitchProps {
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  label: ReactNode;
  description?: ReactNode;
  disabled?: boolean;
  className?: string;
}

/** On/off setting that takes effect immediately (WAI-ARIA switch). Space and Enter toggle it. */
export function Switch({ checked, onCheckedChange, label, description, disabled, className }: SwitchProps) {
  const id = useId();
  const descriptionId = description ? `${id}-description` : undefined;
  return (
    <div className={cn("flex min-h-11 items-center justify-between gap-4", className)}>
      <span className="flex flex-col gap-0.5">
        <label htmlFor={id} className="cursor-pointer text-sm font-medium text-text">
          {label}
        </label>
        {description && (
          <span id={descriptionId} className="text-xs text-text-muted">
            {description}
          </span>
        )}
      </span>
      <button
        id={id}
        type="button"
        role="switch"
        aria-checked={checked}
        aria-describedby={descriptionId}
        disabled={disabled}
        onClick={() => onCheckedChange(!checked)}
        className={cn(
          "relative inline-flex h-7 w-12 shrink-0 cursor-pointer items-center rounded-full border border-transparent",
          "transition-colors duration-(--duration-base) ease-out-soft disabled:cursor-not-allowed disabled:opacity-50",
          checked ? "bg-primary" : "bg-secondary-active",
        )}
      >
        {/* Thumb stays white-on-colour in both themes: theme-invariant by design. */}
        <span
          aria-hidden="true"
          className={cn(
            "inline-block size-5.5 rounded-full bg-paper-0 shadow-md transition-transform duration-(--duration-base) ease-spring",
            checked ? "translate-x-5.5" : "translate-x-0.5",
          )}
        />
      </button>
    </div>
  );
}
