"use client";

import { useId, type ReactNode } from "react";
import { cn } from "@/lib/cn";

export interface RadioOption<T extends string> {
  value: T;
  label: ReactNode;
  description?: ReactNode;
  /** Right-aligned extra, e.g. a price or delivery estimate. */
  aside?: ReactNode;
  disabled?: boolean;
}

export interface RadioGroupProps<T extends string> {
  legend: ReactNode;
  options: RadioOption<T>[];
  value: T | undefined;
  onChange: (value: T) => void;
  name?: string;
  /** `cards` renders each option as a large selectable card (format/shipping/payment pickers). */
  variant?: "list" | "cards";
  hideLegend?: boolean;
  error?: ReactNode;
  className?: string;
}

/**
 * Native radios inside a fieldset: arrow-key navigation, single tab stop and screen-reader
 * semantics come from the browser, not from hand-written key handlers.
 */
export function RadioGroup<T extends string>({
  legend,
  options,
  value,
  onChange,
  name,
  variant = "list",
  hideLegend = false,
  error,
  className,
}: RadioGroupProps<T>) {
  const generatedName = useId();
  const groupName = name ?? generatedName;
  const errorId = error ? `${groupName}-error` : undefined;

  return (
    <fieldset className={cn("flex flex-col gap-2", className)} aria-describedby={errorId}>
      <legend className={cn("mb-1 text-sm font-medium text-text", hideLegend && "sr-only")}>{legend}</legend>
      <div className={cn("flex flex-col", variant === "cards" ? "gap-3" : "gap-0")}>
        {options.map((option) => {
          const checked = option.value === value;
          return (
            <label
              key={option.value}
              className={cn(
                "group flex cursor-pointer items-start gap-3",
                variant === "list" && "min-h-11 py-2",
                variant === "cards" &&
                  "rounded-xl border border-border-strong bg-surface p-4 transition-[border-color,box-shadow,background-color] duration-(--duration-base) hover:border-primary",
                variant === "cards" && checked && "border-primary bg-primary-subtle shadow-sm ring-1 ring-primary",
                option.disabled && "cursor-not-allowed opacity-60",
              )}
            >
              <input
                type="radio"
                name={groupName}
                value={option.value}
                checked={checked}
                disabled={option.disabled}
                onChange={() => onChange(option.value)}
                className={cn(
                  "mt-0.5 grid size-5 shrink-0 cursor-pointer appearance-none place-items-center rounded-full border border-border-input bg-surface",
                  "transition-colors duration-(--duration-fast) group-hover:border-primary checked:border-primary",
                  "before:size-2.5 before:scale-0 before:rounded-full before:bg-primary before:transition-transform before:duration-(--duration-fast) before:content-[''] checked:before:scale-100",
                )}
              />
              {/* The aside (price) wraps under the label on narrow phones instead of squeezing it. */}
              <span className="flex min-w-0 flex-1 flex-wrap items-start justify-between gap-x-3 gap-y-1">
                <span className="flex min-w-0 flex-[1_1_10rem] flex-col gap-0.5">
                  <span className="text-sm font-medium text-text">{option.label}</span>
                  {option.description && <span className="text-xs text-text-muted">{option.description}</span>}
                </span>
                {option.aside && <span className="text-sm font-semibold text-text">{option.aside}</span>}
              </span>
            </label>
          );
        })}
      </div>
      {error && (
        <p id={errorId} role="alert" className="text-xs font-medium text-danger">
          {error}
        </p>
      )}
    </fieldset>
  );
}
