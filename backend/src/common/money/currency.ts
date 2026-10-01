/**
 * Money primitives shared by every module (docs/ARCHITECTURE.md §8.1). Amounts are always
 * integers in minor units (kobo, cents, pence); never floats, never major units in the database.
 * Arithmetic for checkout arrives in BS-7.
 */
export const CURRENCIES = ['NGN', 'USD', 'GBP', 'EUR'] as const;
export type Currency = (typeof CURRENCIES)[number];

export interface Money {
  amount: number;
  currency: Currency;
}

export function isCurrency(value: unknown): value is Currency {
  return (
    typeof value === 'string' &&
    (CURRENCIES as readonly string[]).includes(value)
  );
}

/** Largest price accepted for one book format, in minor units (₦10,000,000 / $100,000). */
export const MAX_PRICE_MINOR = 1_000_000_000;

export function isValidMinorAmount(amount: unknown): amount is number {
  return (
    typeof amount === 'number' &&
    Number.isSafeInteger(amount) &&
    amount > 0 &&
    amount <= MAX_PRICE_MINOR
  );
}
