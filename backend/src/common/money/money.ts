import { CURRENCIES, type Currency, type Money } from './currency.js';

/**
 * The only code that does arithmetic on money (ARCHITECTURE §8.1). Integer minor units only;
 * mixing currencies throws; every result is checked to be a safe integer.
 */

/** ISO 4217 minor-unit exponent. All four enabled currencies use 2. */
export const EXPONENT: Record<Currency, number> = {
  NGN: 2,
  USD: 2,
  GBP: 2,
  EUR: 2,
};

export class MoneyError extends Error {}

function checked(amount: number, currency: Currency): Money {
  if (!Number.isSafeInteger(amount)) {
    throw new MoneyError(
      `Money must be a safe integer of minor units, got ${amount}`,
    );
  }
  if (!(CURRENCIES as readonly string[]).includes(currency)) {
    throw new MoneyError(`Unknown currency ${String(currency)}`);
  }
  return { amount, currency };
}

export const money = (amount: number, currency: Currency): Money =>
  checked(amount, currency);

export const zero = (currency: Currency): Money => checked(0, currency);

function same(a: Money, b: Money): void {
  if (a.currency !== b.currency) {
    throw new MoneyError(`Cannot combine ${a.currency} with ${b.currency}`);
  }
}

export function add(a: Money, b: Money): Money {
  same(a, b);
  return checked(a.amount + b.amount, a.currency);
}

export function subtract(a: Money, b: Money): Money {
  same(a, b);
  return checked(a.amount - b.amount, a.currency);
}

export function multiply(a: Money, quantity: number): Money {
  if (!Number.isSafeInteger(quantity) || quantity < 0) {
    throw new MoneyError(
      `Quantity must be a non-negative integer, got ${quantity}`,
    );
  }
  return checked(a.amount * quantity, a.currency);
}

export function sum(items: Money[], currency: Currency): Money {
  return items.reduce((total, item) => add(total, item), zero(currency));
}

export function min(a: Money, b: Money): Money {
  same(a, b);
  return a.amount <= b.amount ? a : b;
}

export function max(a: Money, b: Money): Money {
  same(a, b);
  return a.amount >= b.amount ? a : b;
}

/**
 * `percent`% of an amount, rounded half-up to the minor unit, exactly once (apply it to the
 * eligible total, never per line). Integer maths only: 2999 at 15% = 449.85 → 450.
 */
export function percentOf(a: Money, percent: number): Money {
  if (!Number.isInteger(percent) || percent < 0 || percent > 100) {
    throw new MoneyError(`Percent must be an integer 0–100, got ${percent}`);
  }
  if (a.amount < 0)
    throw new MoneyError('Cannot take a percentage of a negative amount');
  return checked(Math.floor((a.amount * percent + 50) / 100), a.currency);
}

/** Minor units as the decimal string payment providers expect in major units: 2999 → "29.99". */
export function toMajorString({ amount, currency }: Money): string {
  const exponent = EXPONENT[currency];
  const negative = amount < 0;
  const digits = String(Math.abs(amount)).padStart(exponent + 1, '0');
  const text = exponent
    ? `${digits.slice(0, -exponent)}.${digits.slice(-exponent)}`
    : digits;
  return negative ? `-${text}` : text;
}

export function equals(a: Money, b: Money): boolean {
  return a.currency === b.currency && a.amount === b.amount;
}

const LOCALE: Record<Currency, string> = {
  NGN: 'en-NG',
  USD: 'en-US',
  GBP: 'en-GB',
  EUR: 'en-IE',
};

/**
 * Display only (emails, admin notes): "₦25,000.00", "$29.99". Never feed the result back into
 * a calculation.
 */
export function formatMoney(value: Money): string {
  const digits = EXPONENT[value.currency];
  return new Intl.NumberFormat(LOCALE[value.currency], {
    style: 'currency',
    currency: value.currency,
    currencyDisplay: 'narrowSymbol',
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(Number(toMajorString(value)));
}

/**
 * A provider's major-unit amount (Flutterwave reports `29.99` or `"25000.00"`) as exact minor
 * units, by string manipulation, never `* 100`. Throws on anything that isn't a plain decimal
 * with at most the currency's decimals (after normalising float noise like 29.990000000000002).
 */
export function fromMajor(value: number | string, currency: Currency): Money {
  const exponent = EXPONENT[currency];
  const text =
    typeof value === 'number'
      ? Number.isFinite(value)
        ? value.toFixed(exponent)
        : ''
      : value.trim();
  const match = /^(-?)(\d+)(?:\.(\d+))?$/.exec(text);
  if (!match) throw new MoneyError(`Not a decimal amount: ${String(value)}`);
  const [, sign, whole, fraction = ''] = match;
  if (fraction.length > exponent && /[1-9]/.test(fraction.slice(exponent))) {
    throw new MoneyError(`Too many decimals for ${currency}: ${String(value)}`);
  }
  const digits = whole + fraction.slice(0, exponent).padEnd(exponent, '0');
  const amount = Number(digits);
  return checked(sign ? -amount : amount, currency);
}
