import { isCurrency, type Currency } from "@/lib/money";

export const CURRENCY_COOKIE = "bs_currency";

/** Euro-area countries (ISO 3166-1 alpha-2). */
const EURO = new Set(["AT", "BE", "HR", "CY", "EE", "FI", "FR", "DE", "GR", "IE", "IT", "LV", "LT", "LU", "MT", "NL", "PT", "SK", "SI", "ES"]);

/** Nigeria → NGN, UK → GBP, euro area → EUR, everyone else → USD (PRODUCT_RULES §5). */
export function currencyForCountry(country: string | null | undefined): Currency {
  const code = country?.trim().toUpperCase();
  if (code === "NG") return "NGN";
  if (code === "GB" || code === "UK") return "GBP";
  if (code && EURO.has(code)) return "EUR";
  return "USD";
}

/** The country in an Accept-Language header ("en-NG,en;q=0.9" → "NG"), when there's no geo header. */
export function countryFromLanguage(acceptLanguage: string | null | undefined): string | null {
  const match = acceptLanguage?.match(/^[a-z]{2,3}-([A-Z]{2})\b/i);
  return match ? match[1].toUpperCase() : null;
}

/**
 * Chosen currency for a request: the visitor's saved choice (cookie) first, then their country
 * from the host's geo header (Vercel sets x-vercel-ip-country), then their browser language.
 */
export function resolveCurrency(input: { cookie?: string | null; country?: string | null; acceptLanguage?: string | null }): Currency {
  if (isCurrency(input.cookie)) return input.cookie;
  return currencyForCountry(input.country ?? countryFromLanguage(input.acceptLanguage));
}
