import type { Currency, Money } from '../common/money/currency.js';
import { min, money, percentOf, sum, zero } from '../common/money/money.js';
import type { FormatType } from '../catalog/schemas/book.schema.js';
import type { CouponKind } from './schemas/coupon.schema.js';

/** What the coupon engine needs to know about a coupon (decoupled from Mongoose). */
export interface CouponLike {
  id: string;
  code: string;
  kind: CouponKind;
  percentOff: number | null;
  amountsOff: Array<{ currency: Currency; amount: number }>;
  minSubtotals: Array<{ currency: Currency; amount: number }>;
  appliesTo: { bookIds: string[]; formats: FormatType[] };
  startsAt: Date | null;
  endsAt: Date | null;
  maxRedemptions: number | null;
  perCustomerLimit: number | null;
  redemptionCount: number;
  active: boolean;
}

export interface CouponLine {
  bookId: string;
  format: FormatType;
  lineTotal: number;
}

export type CouponResult =
  | { ok: true; discount: Money; eligibleSubtotal: Money }
  | { ok: false; reason: string };

/**
 * Whether a coupon applies and how much it takes off (PRODUCT_RULES §6). The discount is
 * computed once on the eligible subtotal, rounded half-up, and never exceeds it. Shipping is
 * never discounted. `customerUses` is the buyer's held or used redemptions, when known.
 */
export function evaluateCoupon(
  coupon: CouponLike,
  lines: CouponLine[],
  currency: Currency,
  now: Date,
  customerUses: number | null,
): CouponResult {
  if (!coupon.active) return { ok: false, reason: 'This code is not active' };
  if (coupon.startsAt && now < coupon.startsAt) {
    return { ok: false, reason: 'This code is not valid yet' };
  }
  if (coupon.endsAt && now > coupon.endsAt) {
    return { ok: false, reason: 'This code has expired' };
  }
  if (
    coupon.maxRedemptions !== null &&
    coupon.redemptionCount >= coupon.maxRedemptions
  ) {
    return { ok: false, reason: 'This code has been fully used' };
  }
  if (
    coupon.perCustomerLimit !== null &&
    customerUses !== null &&
    customerUses >= coupon.perCustomerLimit
  ) {
    return { ok: false, reason: 'You have already used this code' };
  }

  const eligible = lines.filter(
    (line) =>
      (coupon.appliesTo.bookIds.length === 0 ||
        coupon.appliesTo.bookIds.includes(line.bookId)) &&
      (coupon.appliesTo.formats.length === 0 ||
        coupon.appliesTo.formats.includes(line.format)),
  );
  if (eligible.length === 0) {
    return { ok: false, reason: 'This code does not apply to these items' };
  }
  const eligibleSubtotal = sum(
    eligible.map((l) => money(l.lineTotal, currency)),
    currency,
  );
  const minimum = coupon.minSubtotals.find((m) => m.currency === currency);
  if (minimum && eligibleSubtotal.amount < minimum.amount) {
    return {
      ok: false,
      reason: 'Your order is below the minimum for this code',
    };
  }

  let discount: Money;
  if (coupon.kind === 'percent') {
    if (!coupon.percentOff)
      return { ok: false, reason: 'This code is not set up correctly' };
    discount = percentOf(eligibleSubtotal, coupon.percentOff);
  } else {
    const off = coupon.amountsOff.find((a) => a.currency === currency);
    if (!off || off.amount <= 0) {
      return { ok: false, reason: `This code can't be used with ${currency}` };
    }
    discount = min(money(off.amount, currency), eligibleSubtotal);
  }
  if (discount.amount <= 0)
    return { ok: true, discount: zero(currency), eligibleSubtotal };
  return { ok: true, discount, eligibleSubtotal };
}

/** Coupon codes are case-insensitive and ignore surrounding spaces. */
export const normaliseCode = (code: string) => code.trim().toUpperCase();
