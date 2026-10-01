"use client";

import { forwardRef, useState, type InputHTMLAttributes } from "react";
import { cn } from "@/lib/cn";
import { MAX_PRICE_MINOR, minorToInput, parseMajorToMinor, type Currency } from "@/lib/money";
import { Input } from "./input";

const SYMBOL: Record<Currency, string> = { NGN: "₦", USD: "$", GBP: "£", EUR: "€" };

export interface MoneyInputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, "value" | "onChange" | "type" | "inputMode"> {
  currency: Currency;
  /** Integer MINOR units, or null when empty. */
  value: number | null;
  /** Called with integer minor units (or null for empty / not yet a valid amount). */
  onChange: (amount: number | null) => void;
  /** Lets the parent show "Enter an amount like 29.99" while the text can't be read. */
  onValidityChange?: (valid: boolean) => void;
}

/**
 * A price field: the editor types major units ("25,000" or "29.99"); the component reports exact
 * integer minor units, parsed as a string so no floating-point rounding can creep into a price.
 * The text is kept as typed while focused and tidied ("29.99") on blur.
 */
export const MoneyInput = forwardRef<HTMLInputElement, MoneyInputProps>(function MoneyInput(
  { currency, value, onChange, onValidityChange, onBlur, onFocus, className, placeholder, ...props },
  ref,
) {
  const [draft, setDraft] = useState<string | null>(null);
  const shown = draft ?? (value === null ? "" : minorToInput(value, currency));

  const read = (text: string) => {
    if (text.trim() === "") return { amount: null, valid: true };
    const amount = parseMajorToMinor(text, currency);
    return amount === null || amount > MAX_PRICE_MINOR ? { amount: null, valid: false } : { amount, valid: true };
  };

  return (
    <Input
      ref={ref}
      {...props}
      type="text"
      inputMode="decimal"
      autoComplete="off"
      spellCheck={false}
      placeholder={placeholder ?? "0.00"}
      value={shown}
      leading={<span className="text-sm font-medium" aria-hidden>{SYMBOL[currency]}</span>}
      className={cn("tabular-nums", className)}
      onFocus={(event) => {
        setDraft(shown);
        onFocus?.(event);
      }}
      onChange={(event) => {
        const text = event.target.value;
        setDraft(text);
        const { amount, valid } = read(text);
        onValidityChange?.(valid);
        onChange(amount);
      }}
      onBlur={(event) => {
        const { valid } = read(event.target.value);
        // Keep the editor's text if it can't be read, so they can see and fix it.
        if (valid) setDraft(null);
        onBlur?.(event);
      }}
    />
  );
});
