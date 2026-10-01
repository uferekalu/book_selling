"use client";

import { useRef, type ClipboardEvent, type KeyboardEvent } from "react";
import { cn } from "@/lib/cn";

export interface OtpInputProps {
  value: string;
  onChange: (value: string) => void;
  /** Called once all digits are filled (e.g. to submit automatically). */
  onComplete?: (value: string) => void;
  length?: number;
  /** Accessible name for the group, e.g. "Authentication code". */
  label: string;
  invalid?: boolean;
  disabled?: boolean;
  autoFocus?: boolean;
  describedBy?: string;
}

/**
 * One box per digit for 6-digit codes. Typing advances, Backspace goes back, arrows move, and
 * pasting a whole code fills every box. The first box carries `autocomplete="one-time-code"` so
 * phones and password managers can autofill it.
 */
export function OtpInput({
  value,
  onChange,
  onComplete,
  length = 6,
  label,
  invalid,
  disabled,
  autoFocus,
  describedBy,
}: OtpInputProps) {
  const refs = useRef<Array<HTMLInputElement | null>>([]);
  const digits = Array.from({ length }, (_, i) => value[i] ?? "");

  const commit = (next: string) => {
    const clean = next.replace(/\D/g, "").slice(0, length);
    onChange(clean);
    if (clean.length === length) onComplete?.(clean);
    return clean;
  };

  const focus = (index: number) => refs.current[Math.max(0, Math.min(length - 1, index))]?.focus();

  const onInput = (index: number, raw: string) => {
    const typed = raw.replace(/\D/g, "");
    if (!typed) return;
    // Autofill or a fast typist can deliver several digits into one box.
    const next = (value.slice(0, index) + typed).slice(0, length);
    const committed = commit(next);
    focus(committed.length);
  };

  const onKeyDown = (index: number, event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Backspace") {
      event.preventDefault();
      if (digits[index]) commit(value.slice(0, index) + value.slice(index + 1));
      else if (index > 0) {
        commit(value.slice(0, index - 1) + value.slice(index));
        focus(index - 1);
      }
    } else if (event.key === "ArrowLeft") {
      event.preventDefault();
      focus(index - 1);
    } else if (event.key === "ArrowRight") {
      event.preventDefault();
      focus(index + 1);
    }
  };

  const onPaste = (event: ClipboardEvent<HTMLInputElement>) => {
    event.preventDefault();
    const committed = commit(event.clipboardData.getData("text"));
    focus(committed.length);
  };

  return (
    <div role="group" aria-label={label} aria-describedby={describedBy} className="flex justify-between gap-2 sm:justify-start">
      {digits.map((digit, index) => (
        <input
          key={index}
          ref={(el) => {
            refs.current[index] = el;
          }}
          type="text"
          inputMode="numeric"
          pattern="[0-9]*"
          autoComplete={index === 0 ? "one-time-code" : "off"}
          maxLength={length}
          aria-label={`Digit ${index + 1} of ${length}`}
          aria-invalid={invalid || undefined}
          value={digit}
          disabled={disabled}
          autoFocus={autoFocus && index === 0}
          onChange={(event) => onInput(index, event.target.value)}
          onKeyDown={(event) => onKeyDown(index, event)}
          onPaste={onPaste}
          onFocus={(event) => event.target.select()}
          className={cn(
            "h-13 w-11 min-w-0 flex-1 rounded-lg border border-border-input bg-surface text-center font-mono text-xl font-semibold text-text shadow-xs sm:w-12 sm:flex-none",
            "transition-[border-color,box-shadow] duration-(--duration-fast)",
            "focus-visible:border-primary focus-visible:ring-4 focus-visible:ring-primary/15 focus-visible:outline-none",
            "aria-invalid:border-danger disabled:opacity-50",
          )}
        />
      ))}
    </div>
  );
}
