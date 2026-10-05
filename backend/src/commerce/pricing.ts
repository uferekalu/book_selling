import type { Currency } from '../common/money/currency.js';
import {
  add,
  money,
  multiply,
  subtract,
  sum,
  zero,
} from '../common/money/money.js';
import type { FormatType } from '../catalog/schemas/book.schema.js';
import { evaluateCoupon, type CouponLike } from './coupon-rules.js';
import { countryName } from '../payments/countries.js';

/**
 * Prices a cart from the catalogue (ARCHITECTURE §8.2). Pure: the cart, the checkout quote and
 * order placement all call this one function, so the amount on "Review & pay" is exactly the
 * amount charged. The client's numbers are never used.
 */

export interface PricingBook {
  id: string;
  slug: string;
  title: string;
  cover: string | null;
  published: boolean;
  formats: Array<{
    type: FormatType;
    sku: string;
    active: boolean;
    prices: Array<{ currency: Currency; amount: number }>;
    compareAtPrices: Array<{ currency: Currency; amount: number }>;
    print: {
      stockOnHand: number;
      stockReserved: number;
      maxPerOrder: number;
    } | null;
  }>;
}

export interface PricingZone {
  id: string;
  name: string;
  rates: Array<{
    currency: Currency;
    firstItem: number;
    additionalItem: number;
  }>;
  estimatedDays: { min: number; max: number };
}

export interface PricingInput {
  currency: Currency;
  items: Array<{ bookId: string; format: FormatType; quantity: number }>;
  books: Map<string, PricingBook>;
  /** Ebooks the buyer already owns (by book id). */
  ownedBookIds: Set<string>;
  /** Null: no country chosen yet. */
  shippingCountry: string | null;
  /** The zone for that country (already resolved), or null if none ships there. */
  zone: PricingZone | null;
  coupon: {
    code: string;
    found: CouponLike | null;
    customerUses: number | null;
  } | null;
  now: Date;
}

export type LineStatus =
  'ok' | 'unavailable' | 'no_price' | 'owned' | 'out_of_stock' | 'over_stock';

export interface QuoteLine {
  bookId: string;
  format: FormatType;
  slug: string;
  title: string;
  cover: string | null;
  sku: string | null;
  unitAmount: number | null;
  compareAt: number | null;
  quantity: number;
  lineTotal: number;
  /** Most copies that can be ordered now (print), 1 for ebooks. */
  maxQuantity: number;
  status: LineStatus;
  message: string | null;
}

export interface Quote {
  currency: Currency;
  lines: QuoteLine[];
  subtotal: number;
  discountTotal: number;
  shippingTotal: number;
  taxTotal: number;
  total: number;
  requiresShipping: boolean;
  shipping: {
    country: string | null;
    zoneId: string | null;
    zoneName: string | null;
    estimatedDays: { min: number; max: number } | null;
    available: boolean;
  };
  coupon: {
    code: string;
    applied: boolean;
    message: string | null;
    couponId: string | null;
  } | null;
  /** Everything that stops "place order", in words for the buyer. Empty = ready. */
  problems: string[];
}

const LABEL: Record<FormatType, string> = {
  ebook: 'ebook',
  print: 'print copy',
};

export function priceCart(input: PricingInput): Quote {
  const { currency } = input;
  const lines: QuoteLine[] = [];
  const problems: string[] = [];

  for (const item of input.items) {
    const book = input.books.get(item.bookId);
    const format = book?.formats.find((f) => f.type === item.format);
    const base = {
      bookId: item.bookId,
      format: item.format,
      slug: book?.slug ?? '',
      title: book?.title ?? 'A book no longer available',
      cover: book?.cover ?? null,
      sku: format?.sku ?? null,
    };
    const fail = (
      status: LineStatus,
      message: string,
      quantity = item.quantity,
    ): QuoteLine => ({
      ...base,
      unitAmount: null,
      compareAt: null,
      quantity,
      lineTotal: 0,
      maxQuantity: 0,
      status,
      message,
    });

    if (!book || !book.published || !format || !format.active) {
      lines.push(
        fail('unavailable', `The ${LABEL[item.format]} is no longer available`),
      );
      continue;
    }
    const price = format.prices.find((p) => p.currency === currency);
    if (!price) {
      lines.push(fail('no_price', `Not available in ${currency}`));
      continue;
    }
    const compare = format.compareAtPrices.find((p) => p.currency === currency);
    const compareAt =
      compare && compare.amount > price.amount ? compare.amount : null;

    if (item.format === 'ebook') {
      if (input.ownedBookIds.has(item.bookId)) {
        lines.push({
          ...fail('owned', 'Already in your library', 1),
          unitAmount: price.amount,
          compareAt,
        });
        continue;
      }
      lines.push({
        ...base,
        unitAmount: price.amount,
        compareAt,
        quantity: 1,
        lineTotal: price.amount,
        maxQuantity: 1,
        status: 'ok',
        message: null,
      });
      continue;
    }

    const available = Math.max(
      0,
      (format.print?.stockOnHand ?? 0) - (format.print?.stockReserved ?? 0),
    );
    const maxQuantity = Math.min(format.print?.maxPerOrder ?? 5, available);
    if (maxQuantity === 0) {
      lines.push({
        ...fail('out_of_stock', 'Out of stock'),
        unitAmount: price.amount,
        compareAt,
      });
      continue;
    }
    if (item.quantity > maxQuantity) {
      lines.push({
        ...base,
        unitAmount: price.amount,
        compareAt,
        quantity: item.quantity,
        lineTotal: 0,
        maxQuantity,
        status: 'over_stock',
        message:
          available < (format.print?.maxPerOrder ?? 5)
            ? `Only ${maxQuantity} available`
            : `At most ${maxQuantity} per order`,
      });
      continue;
    }
    lines.push({
      ...base,
      unitAmount: price.amount,
      compareAt,
      quantity: item.quantity,
      lineTotal: multiply(money(price.amount, currency), item.quantity).amount,
      maxQuantity,
      status: 'ok',
      message: null,
    });
  }

  const okLines = lines.filter((l) => l.status === 'ok');
  for (const line of lines) {
    if (line.status !== 'ok') problems.push(`${line.title}: ${line.message}`);
  }
  if (input.items.length === 0) problems.push('Your cart is empty');

  const subtotal = sum(
    okLines.map((l) => money(l.lineTotal, currency)),
    currency,
  );

  // ---- shipping
  const printCopies = okLines
    .filter((l) => l.format === 'print')
    .reduce((n, l) => n + l.quantity, 0);
  const requiresShipping = printCopies > 0;
  let shippingTotal = zero(currency);
  const shipping: Quote['shipping'] = {
    country: input.shippingCountry,
    zoneId: null,
    zoneName: null,
    estimatedDays: null,
    available: !requiresShipping,
  };
  if (requiresShipping) {
    if (!input.shippingCountry) {
      problems.push('Choose where to ship your print copy');
    } else {
      const rate = input.zone?.rates.find((r) => r.currency === currency);
      const place = countryName(input.shippingCountry);
      if (!input.zone) {
        // No zone covers this country (and there is no "rest of the world" zone).
        problems.push(
          `We don't deliver print copies to ${place} yet. Choose the ebook, or contact us about delivery.`,
        );
      } else if (!rate) {
        // The zone exists but has no price in this currency: say which currencies work.
        const others = input.zone.rates.map((r) => r.currency);
        problems.push(
          others.length
            ? `Delivery to ${place} isn't priced in ${currency}. Switch the currency to ${others.join(' or ')} to order the print copy.`
            : `We don't deliver print copies to ${place} yet. Choose the ebook, or contact us about delivery.`,
        );
      } else {
        shippingTotal = add(
          money(rate.firstItem, currency),
          multiply(money(rate.additionalItem, currency), printCopies - 1),
        );
        Object.assign(shipping, {
          zoneId: input.zone.id,
          zoneName: input.zone.name,
          estimatedDays: input.zone.estimatedDays,
          available: true,
        });
      }
    }
  }

  // ---- coupon (on items only; never on shipping)
  let discount = zero(currency);
  let coupon: Quote['coupon'] = null;
  if (input.coupon) {
    const { code, found, customerUses } = input.coupon;
    if (!found) {
      coupon = {
        code,
        applied: false,
        message: 'That code is not valid',
        couponId: null,
      };
    } else {
      const result = evaluateCoupon(
        found,
        okLines.map((l) => ({
          bookId: l.bookId,
          format: l.format,
          lineTotal: l.lineTotal,
        })),
        currency,
        input.now,
        customerUses,
      );
      if (result.ok) {
        discount = result.discount;
        coupon = {
          code: found.code,
          applied: true,
          message: null,
          couponId: found.id,
        };
      } else {
        coupon = {
          code: found.code,
          applied: false,
          message: result.reason,
          couponId: found.id,
        };
      }
    }
  }

  const tax = zero(currency); // prices are tax-inclusive (ARCHITECTURE §8.1)
  const total = add(add(subtract(subtotal, discount), shippingTotal), tax);
  if (okLines.length > 0 && total.amount <= 0) {
    problems.push('This order total is zero; a code cannot make an order free');
  }

  return {
    currency,
    lines,
    subtotal: subtotal.amount,
    discountTotal: discount.amount,
    shippingTotal: shippingTotal.amount,
    taxTotal: tax.amount,
    total: total.amount,
    requiresShipping,
    shipping,
    coupon,
    problems,
  };
}
