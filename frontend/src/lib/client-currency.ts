"use client";

import { useSyncExternalStore } from "react";
import { CURRENCY_COOKIE } from "./currency-detect";
import { isCurrency, type Currency } from "./money";

/**
 * The visitor's currency in the browser. The cookie (set by proxy.ts) is the source of truth for
 * server-rendered prices; this store lets client parts (the cart, checkout) follow a switch at once.
 */
const EVENT = "bs:currency";

function read(): Currency {
  const match = document.cookie.match(new RegExp(`(?:^|;\\s*)${CURRENCY_COOKIE}=([A-Z]{3})`));
  return match && isCurrency(match[1]) ? match[1] : "USD";
}

function subscribe(onChange: () => void) {
  window.addEventListener(EVENT, onChange);
  return () => window.removeEventListener(EVENT, onChange);
}

export function setCurrency(next: Currency): void {
  document.cookie = `${CURRENCY_COOKIE}=${next}; path=/; max-age=31536000; samesite=lax`;
  window.dispatchEvent(new Event(EVENT));
}

/** The current currency; `null` while server-rendering (no cookie access), so render a placeholder. */
export function useCurrency(): Currency | null {
  return useSyncExternalStore(subscribe, read, () => null);
}
