/**
 * Money on the frontend is exactly what the API sends: an integer amount in MINOR units (kobo,
 * cents, pence) plus a currency code (docs/ARCHITECTURE.md §8.1). This module only formats it
 * for display; the client never computes a price that gets charged.
 */

export const CURRENCIES = ["NGN", "USD", "GBP", "EUR"] as const;
export type Currency = (typeof CURRENCIES)[number];

export interface Money {
  amount: number;
  currency: Currency;
}

/** Minor units per major unit (ISO 4217 exponent). All four enabled currencies use 2. */
const EXPONENT: Record<Currency, number> = { NGN: 2, USD: 2, GBP: 2, EUR: 2 };

/** The locale each currency reads most naturally in (₦25,000 / $30 / £24 / €28). */
const DEFAULT_LOCALE: Record<Currency, string> = {
  NGN: "en-NG",
  USD: "en-US",
  GBP: "en-GB",
  EUR: "en-IE",
};

export function isCurrency(value: unknown): value is Currency {
  return typeof value === "string" && (CURRENCIES as readonly string[]).includes(value);
}

export function toMajorUnits({ amount, currency }: Money): number {
  if (!Number.isInteger(amount)) {
    throw new Error(`Money amount must be an integer in minor units, got ${amount}`);
  }
  return amount / 10 ** EXPONENT[currency];
}

export interface FormatMoneyOptions {
  locale?: string;
  /** Drop ".00" for whole amounts (catalogue prices); keep it for receipts and totals. */
  trimWholeAmounts?: boolean;
}

export function formatMoney(money: Money, options: FormatMoneyOptions = {}): string {
  const major = toMajorUnits(money);
  const isWhole = money.amount % 10 ** EXPONENT[money.currency] === 0;
  const digits = options.trimWholeAmounts && isWhole ? 0 : EXPONENT[money.currency];
  return new Intl.NumberFormat(options.locale ?? DEFAULT_LOCALE[money.currency], {
    style: "currency",
    currency: money.currency,
    currencyDisplay: "narrowSymbol",
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(major);
}

export const CURRENCY_LABEL: Record<Currency, string> = {
  NGN: "Nigerian naira",
  USD: "US dollar",
  GBP: "British pound",
  EUR: "Euro",
};
