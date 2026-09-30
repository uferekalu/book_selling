"use client";

import { forwardRef, type InputHTMLAttributes, type ReactNode, type TextareaHTMLAttributes } from "react";
import { cn } from "@/lib/cn";
import { useFormFieldControl } from "./form-field";

/** Shared look for every text-like control, so inputs, textareas and selects line up exactly. */
export const controlClasses = cn(
  "w-full rounded-lg border border-border-input bg-surface text-base text-text shadow-xs",
  "placeholder:text-text-subtle",
  "transition-[border-color,box-shadow] duration-(--duration-fast)",
  "hover:border-text-muted",
  "focus-visible:border-primary focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-primary/15",
  "disabled:cursor-not-allowed disabled:bg-surface-sunken disabled:text-text-disabled",
  "aria-invalid:border-danger aria-invalid:focus-visible:ring-danger/15",
);

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  /** Icon or text inside the field on the left (search icon, currency symbol). */
  leading?: ReactNode;
  /** Icon, text or a small button inside the field on the right. */
  trailing?: ReactNode;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { className, leading, trailing, type = "text", ...props },
  ref,
) {
  const control = useFormFieldControl(props);
  const input = (
    <input
      ref={ref}
      type={type}
      {...props}
      {...control}
      className={cn(controlClasses, "h-11 px-3.5", leading && "pl-10", trailing && "pr-11", !leading && !trailing && className)}
    />
  );
  if (!leading && !trailing) return input;
  return (
    <div className={cn("relative", className)}>
      {leading && (
        <span className="pointer-events-none absolute inset-y-0 left-0 flex w-10 items-center justify-center text-text-subtle">
          {leading}
        </span>
      )}
      {input}
      {trailing && <span className="absolute inset-y-0 right-0 flex items-center pr-1.5 text-text-subtle">{trailing}</span>}
    </div>
  );
});

export interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  /** Shows "used / max" under the field when `maxLength` is set. */
  showCount?: boolean;
}

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(function Textarea(
  { className, rows = 4, showCount, maxLength, value, ...props },
  ref,
) {
  const control = useFormFieldControl(props);
  const length = typeof value === "string" ? value.length : undefined;
  return (
    <div className="flex flex-col gap-1">
      <textarea
        ref={ref}
        rows={rows}
        maxLength={maxLength}
        value={value}
        {...props}
        {...control}
        className={cn(controlClasses, "min-h-24 resize-y px-3.5 py-2.5 leading-relaxed", className)}
      />
      {showCount && maxLength && length !== undefined && (
        <p className="self-end text-xs text-text-subtle" aria-live="polite">
          {length} / {maxLength}
        </p>
      )}
    </div>
  );
});
