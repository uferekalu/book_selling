import "server-only";
import { cookies, headers } from "next/headers";
import type { Currency } from "@/lib/money";
import { CURRENCY_COOKIE, resolveCurrency } from "./currency-detect";

/** The visitor's currency in a server component (same rules as `proxy.ts`). */
export async function requestCurrency(): Promise<Currency> {
  const [cookieStore, headerStore] = await Promise.all([cookies(), headers()]);
  return resolveCurrency({
    cookie: cookieStore.get(CURRENCY_COOKIE)?.value,
    country: headerStore.get("x-vercel-ip-country"),
    acceptLanguage: headerStore.get("accept-language"),
  });
}
