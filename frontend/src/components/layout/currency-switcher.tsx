"use client";

import { useRouter } from "next/navigation";
import { useState, useSyncExternalStore, useTransition } from "react";
import { Select } from "@/components/ui";
import { CURRENCY_COOKIE } from "@/lib/currency-detect";
import { CURRENCIES, isCurrency, type Currency } from "@/lib/money";
import { cn } from "@/lib/cn";

const noopSubscribe = () => () => {};

const SYMBOL: Record<Currency, string> = { NGN: "₦", USD: "$", GBP: "£", EUR: "€" };

function readCookie(): Currency | null {
  const match = document.cookie.match(new RegExp(`(?:^|;\\s*)${CURRENCY_COOKIE}=([A-Z]{3})`));
  return match && isCurrency(match[1]) ? match[1] : null;
}

/**
 * Prices are shown in one currency at a time (PRODUCT_RULES §5). The choice lives in a cookie the
 * server reads, so switching just refreshes the server-rendered prices; there is no exchange-rate
 * maths anywhere: each currency has its own set price.
 */
export function CurrencySwitcher({ className, id }: { className?: string; id?: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  // The cookie is set by proxy.ts on the first request. Read on the client only ("" while
  // server-rendering), so hydration never mismatches.
  const saved = useSyncExternalStore(noopSubscribe, () => readCookie() ?? "USD", () => "" as const);
  const [chosen, setChosen] = useState<Currency | null>(null);
  const currency = chosen ?? saved;

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
        setChosen(next);
        document.cookie = `${CURRENCY_COOKIE}=${next}; path=/; max-age=31536000; samesite=lax`;
        startTransition(() => router.refresh());
      }}
    />
  );
}
