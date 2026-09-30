"use client";

import { Check, Minus } from "lucide-react";
import { forwardRef, useEffect, useImperativeHandle, useRef, type InputHTMLAttributes, type ReactNode } from "react";
import { cn } from "@/lib/cn";
import { Icon } from "./icon";

export interface CheckboxProps extends Omit<InputHTMLAttributes<HTMLInputElement>, "type"> {
  label: ReactNode;
  description?: ReactNode;
  indeterminate?: boolean;
}

/** Native checkbox (full keyboard and AT support) with a custom box; the whole row is the tap target. */
export const Checkbox = forwardRef<HTMLInputElement, CheckboxProps>(function Checkbox(
  { label, description, indeterminate = false, className, disabled, ...props },
  ref,
) {
  const inputRef = useRef<HTMLInputElement>(null);
  useImperativeHandle(ref, () => inputRef.current as HTMLInputElement);

  useEffect(() => {
    if (inputRef.current) inputRef.current.indeterminate = indeterminate;
  }, [indeterminate]);

  return (
    <label
      className={cn(
        "group flex min-h-11 cursor-pointer items-start gap-3 py-2",
        disabled && "cursor-not-allowed opacity-60",
        className,
      )}
    >
      <span className="relative mt-0.5 grid size-5 shrink-0 place-items-center">
        <input
          ref={inputRef}
          type="checkbox"
          disabled={disabled}
          className={cn(
            "peer size-5 cursor-pointer appearance-none rounded-sm border border-border-input bg-surface",
            "transition-colors duration-(--duration-fast) checked:border-primary checked:bg-primary",
            "indeterminate:border-primary indeterminate:bg-primary",
            "group-hover:border-primary disabled:cursor-not-allowed",
          )}
          {...props}
        />
        <Icon
          icon={indeterminate ? Minus : Check}
          size="xs"
          strokeWidth={3}
          className="pointer-events-none absolute text-on-primary opacity-0 peer-checked:opacity-100 peer-indeterminate:opacity-100"
        />
      </span>
      <span className="flex flex-col gap-0.5">
        <span className="text-sm text-text">{label}</span>
        {description && <span className="text-xs text-text-muted">{description}</span>}
      </span>
    </label>
  );
});
