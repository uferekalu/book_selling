"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { Select } from "@/components/ui";
import { setCurrency, useCurrency } from "@/lib/client-currency";
import { CURRENCIES, type Currency } from "@/lib/money";
import { cn } from "@/lib/cn";

const SYMBOL: Record<Currency, string> = { NGN: "₦", USD: "$", GBP: "£", EUR: "€" };

/**
 * Prices are shown in one currency at a time (PRODUCT_RULES §5). The choice lives in a cookie the
 * server reads, so switching just refreshes the server-rendered prices; there is no exchange-rate
 * maths anywhere: each currency has its own set price.
 */
export function CurrencySwitcher({ className, id }: { className?: string; id?: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  // The cookie is set by proxy.ts on the first request. Read on the client only (empty while
  // server-rendering), so hydration never mismatches.
  const currency = useCurrency() ?? "";

  return (
    <Select
      id={id}
      aria-label="Currency"
      value={currency}
      disabled={pending || !currency}
      className={cn("w-28", className)}
      options={CURRENCIES.map((code) => ({ value: code, label: `${SYMBOL[code]} ${code}` }))}
      onChange={(event) => {
        const next = event.target.value as Currency;
        setCurrency(next);
        startTransition(() => router.refresh());
      }}
    />
  );
}
