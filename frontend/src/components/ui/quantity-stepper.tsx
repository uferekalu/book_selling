"use client";

import { Minus, Plus } from "lucide-react";
import { useId } from "react";
import { cn } from "@/lib/cn";
import { Icon } from "./icon";

export interface QuantityStepperProps {
  value: number;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
  /** Names what is being counted, e.g. "Quantity of Heat Treatment of Steels". */
  label: string;
  size?: "sm" | "md";
  disabled?: boolean;
  className?: string;
}

/** − / value / + control for cart quantities. Arrow keys, Home and End work on the value field. */
export function QuantityStepper({
  value,
  onChange,
  min = 1,
  max = 99,
  label,
  size = "md",
  disabled,
  className,
}: QuantityStepperProps) {
  const id = useId();
  const clamp = (n: number) => Math.min(max, Math.max(min, n));
  const set = (n: number) => {
    const next = clamp(n);
    if (next !== value) onChange(next);
  };
  const button = cn(
    "grid h-full place-items-center text-text transition-colors duration-(--duration-fast) hover:bg-secondary disabled:cursor-not-allowed disabled:text-text-disabled disabled:hover:bg-transparent",
    size === "md" ? "w-11" : "w-9",
  );

  return (
    <div
      role="group"
      aria-labelledby={`${id}-label`}
      className={cn(
        "inline-flex items-stretch overflow-hidden rounded-full border border-border-input bg-surface",
        size === "md" ? "h-11" : "h-9",
        className,
      )}
    >
      <span id={`${id}-label`} className="sr-only">
        {label}
      </span>
      <button type="button" className={button} aria-label="Decrease" onClick={() => set(value - 1)} disabled={disabled || value <= min}>
        <Icon icon={Minus} size="sm" />
      </button>
      <input
        type="text"
        inputMode="numeric"
        role="spinbutton"
        aria-label={label}
        aria-valuenow={value}
        aria-valuemin={min}
        aria-valuemax={max}
        value={value}
        disabled={disabled}
        onChange={(event) => {
          const parsed = Number.parseInt(event.target.value.replace(/\D/g, ""), 10);
          if (!Number.isNaN(parsed)) set(parsed);
        }}
        onKeyDown={(event) => {
          const keys: Record<string, number> = { ArrowUp: value + 1, ArrowDown: value - 1, Home: min, End: max };
          if (event.key in keys) {
            event.preventDefault();
            set(keys[event.key]);
          }
        }}
        className="w-10 bg-transparent text-center text-base font-semibold text-text tabular-nums focus-visible:outline-none"
      />
      <button type="button" className={button} aria-label="Increase" onClick={() => set(value + 1)} disabled={disabled || value >= max}>
        <Icon icon={Plus} size="sm" />
      </button>
    </div>
  );
}
