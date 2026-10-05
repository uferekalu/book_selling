import type { Currency } from '../common/money/currency.js';
import { toMajorString } from '../common/money/money.js';

/**
 * The owner's sales and earnings reports (BS-29). Pure functions over paid orders, so every figure
 * is exact and tested: integer minor units throughout, and never a sum across currencies (a naira
 * total and a dollar total are reported side by side, never added).
 */

export const SALE_STATUSES = [
  'paid',
  'fulfilled',
  'partially_refunded',
  'refunded',
] as const;

export interface ReportOrder {
  _id: { toString(): string };
  orderNumber: string;
  email: string;
  customerName: string;
  currency: Currency;
  status: string;
  country: string | null;
  shippingAddress: { city: string; state?: string; country: string } | null;
  items: Array<{
    bookId: { toString(): string };
    format: 'ebook' | 'print';
    titleSnapshot: string;
    unitAmount: number;
    quantity: number;
    lineTotal: number;
  }>;
  subtotal: number;
  discountTotal: number;
  shippingTotal: number;
  taxTotal: number;
  total: number;
  refundedTotal: number;
  coupon: { code: string } | null;
  payment: { provider: string; paidAt: Date } | null;
  shipment: {
    status: string;
    carrier: string | null;
    trackingNumber: string | null;
    shippedAt: Date | null;
    deliveredAt: Date | null;
  };
}

/** One book sold on one order: the rows of the sales report. */
export interface SaleRow {
  paidAt: Date;
  orderNumber: string;
  orderStatus: string;
  bookId: string;
  title: string;
  format: 'ebook' | 'print';
  quantity: number;
  unitPrice: number;
  /** Price × quantity, before the order's discount. */
  lineTotal: number;
  /** This line's share of the order's discount (split by line value, to the exact minor unit). */
  discount: number;
  /** What the buyer paid for this line: lineTotal − discount. */
  lineNet: number;
  currency: Currency;
  buyerName: string;
  buyerEmail: string;
  /** Where it was shipped (print) or the country the buyer gave (ebook). */
  country: string | null;
  city: string | null;
  provider: string;
  coupon: string | null;
  /** 'instant' for ebooks; the order's shipment status for print copies. */
  delivery: string;
  carrier: string | null;
  trackingNumber: string | null;
  shippedAt: Date | null;
  deliveredAt: Date | null;
  /** Whole-order figures, repeated on each of its lines so a row stands on its own. */
  orderShipping: number;
  orderTotal: number;
  orderRefunded: number;
}

/**
 * Splits `total` across `weights` in proportion, in whole minor units, so the parts add up to
 * exactly `total` (largest remainder: the leftover units go to the largest fractions, earlier
 * lines first on ties).
 */
export function allocate(total: number, weights: number[]): number[] {
  const sumWeights = weights.reduce((a, b) => a + b, 0);
  if (total === 0 || sumWeights === 0) return weights.map(() => 0);
  const raw = weights.map((w) => (total * w) / sumWeights);
  const parts = raw.map(Math.floor);
  let left = total - parts.reduce((a, b) => a + b, 0);
  const order = raw
    .map((r, i) => ({ i, frac: r - Math.floor(r) }))
    .sort((a, b) => b.frac - a.frac || a.i - b.i);
  for (const { i } of order) {
    if (left <= 0) break;
    parts[i] += 1;
    left -= 1;
  }
  return parts;
}

export function saleRows(orders: ReportOrder[]): SaleRow[] {
  const rows: SaleRow[] = [];
  for (const order of orders) {
    if (!order.payment) continue;
    const discounts = allocate(
      order.discountTotal,
      order.items.map((i) => i.lineTotal),
    );
    order.items.forEach((item, index) => {
      const print = item.format === 'print';
      rows.push({
        paidAt: order.payment!.paidAt,
        orderNumber: order.orderNumber,
        orderStatus: order.status,
        bookId: item.bookId.toString(),
        title: item.titleSnapshot,
        format: item.format,
        quantity: item.quantity,
        unitPrice: item.unitAmount,
        lineTotal: item.lineTotal,
        discount: discounts[index],
        lineNet: item.lineTotal - discounts[index],
        currency: order.currency,
        buyerName: order.customerName,
        buyerEmail: order.email,
        // Print: where it was shipped. Ebook: the country the buyer gave at checkout.
        country: print
          ? (order.shippingAddress?.country ?? order.country ?? null)
          : (order.country ?? order.shippingAddress?.country ?? null),
        city: print ? (order.shippingAddress?.city ?? null) : null,
        provider: order.payment!.provider,
        coupon: order.coupon?.code ?? null,
        delivery: print ? order.shipment.status : 'instant',
        carrier: print ? order.shipment.carrier : null,
        trackingNumber: print ? order.shipment.trackingNumber : null,
        shippedAt: print ? order.shipment.shippedAt : null,
        deliveredAt: print ? order.shipment.deliveredAt : null,
        orderShipping: order.shippingTotal,
        orderTotal: order.total,
        orderRefunded: order.refundedTotal,
      });
    });
  }
  return rows.sort(
    (a, b) =>
      b.paidAt.getTime() - a.paidAt.getTime() ||
      b.orderNumber.localeCompare(a.orderNumber),
  );
}

/** One currency's totals. `net` is what the store keeps before payment-provider fees. */
export interface CurrencyTotals {
  currency: Currency;
  orders: number;
  ebookCopies: number;
  printCopies: number;
  /** Book prices × quantities, before discounts. */
  bookSales: number;
  discounts: number;
  shipping: number;
  tax: number;
  /** What buyers paid: bookSales − discounts + shipping + tax. */
  received: number;
  /** Refunded on these orders (whenever the refund was made). */
  refunds: number;
  /** received − refunds. */
  net: number;
  /** received ÷ orders, rounded to the minor unit. */
  averageOrder: number;
}

function emptyTotals(currency: Currency): CurrencyTotals {
  return {
    currency,
    orders: 0,
    ebookCopies: 0,
    printCopies: 0,
    bookSales: 0,
    discounts: 0,
    shipping: 0,
    tax: 0,
    received: 0,
    refunds: 0,
    net: 0,
    averageOrder: 0,
  };
}

function addOrder(t: CurrencyTotals, order: ReportOrder): void {
  t.orders += 1;
  for (const item of order.items) {
    if (item.format === 'ebook') t.ebookCopies += item.quantity;
    else t.printCopies += item.quantity;
  }
  t.bookSales += order.subtotal;
  t.discounts += order.discountTotal;
  t.shipping += order.shippingTotal;
  t.tax += order.taxTotal;
  t.received += order.total;
  t.refunds += order.refundedTotal;
  t.net = t.received - t.refunds;
  t.averageOrder = Math.round(t.received / t.orders);
}

const CURRENCY_ORDER: Currency[] = ['NGN', 'USD', 'GBP', 'EUR'];
const byCurrency = (a: { currency: Currency }, b: { currency: Currency }) =>
  CURRENCY_ORDER.indexOf(a.currency) - CURRENCY_ORDER.indexOf(b.currency);

export type Grouping = 'day' | 'week' | 'month';

/** The calendar key of an instant in a time zone: 2026-10-05, the Monday 2026-10-05, or 2026-10. */
export function periodKey(
  at: Date,
  grouping: Grouping,
  timeZone: string,
): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(at);
  const get = (type: string) => parts.find((p) => p.type === type)!.value;
  const [y, m, d] = [get('year'), get('month'), get('day')];
  if (grouping === 'month') return `${y}-${m}`;
  if (grouping === 'day') return `${y}-${m}-${d}`;
  // Weeks start on Monday (ISO).
  const local = new Date(Date.UTC(Number(y), Number(m) - 1, Number(d)));
  const back = (local.getUTCDay() + 6) % 7;
  local.setUTCDate(local.getUTCDate() - back);
  return local.toISOString().slice(0, 10);
}

export interface EarningsReport {
  totals: CurrencyTotals[];
  periods: Array<{ period: string } & CurrencyTotals>;
  books: Array<{
    bookId: string;
    title: string;
    currency: Currency;
    ebookCopies: number;
    printCopies: number;
    /** Before discounts. */
    sales: number;
    /** After each line's share of the order discount. */
    net: number;
  }>;
  countries: Array<{ country: string | null } & CurrencyTotals>;
  providers: Array<{ provider: string } & CurrencyTotals>;
}

export function earnings(
  orders: ReportOrder[],
  grouping: Grouping,
  timeZone: string,
): EarningsReport {
  const totals = new Map<Currency, CurrencyTotals>();
  const periods = new Map<string, { period: string } & CurrencyTotals>();
  const countries = new Map<
    string,
    { country: string | null } & CurrencyTotals
  >();
  const providers = new Map<string, { provider: string } & CurrencyTotals>();
  const books = new Map<string, EarningsReport['books'][number]>();

  for (const order of orders) {
    if (!order.payment) continue;
    const c = order.currency;
    if (!totals.has(c)) totals.set(c, emptyTotals(c));
    addOrder(totals.get(c)!, order);

    const period = periodKey(order.payment.paidAt, grouping, timeZone);
    const pk = `${period}|${c}`;
    if (!periods.has(pk)) periods.set(pk, { period, ...emptyTotals(c) });
    addOrder(periods.get(pk)!, order);

    const country = order.shippingAddress?.country ?? order.country ?? null;
    const ck = `${country ?? '-'}|${c}`;
    if (!countries.has(ck)) countries.set(ck, { country, ...emptyTotals(c) });
    addOrder(countries.get(ck)!, order);

    const provider = order.payment.provider;
    const vk = `${provider}|${c}`;
    if (!providers.has(vk)) providers.set(vk, { provider, ...emptyTotals(c) });
    addOrder(providers.get(vk)!, order);

    const discounts = allocate(
      order.discountTotal,
      order.items.map((i) => i.lineTotal),
    );
    order.items.forEach((item, index) => {
      const bk = `${item.bookId.toString()}|${c}`;
      if (!books.has(bk)) {
        books.set(bk, {
          bookId: item.bookId.toString(),
          title: item.titleSnapshot,
          currency: c,
          ebookCopies: 0,
          printCopies: 0,
          sales: 0,
          net: 0,
        });
      }
      const b = books.get(bk)!;
      if (item.format === 'ebook') b.ebookCopies += item.quantity;
      else b.printCopies += item.quantity;
      b.sales += item.lineTotal;
      b.net += item.lineTotal - discounts[index];
    });
  }

  return {
    totals: [...totals.values()].sort(byCurrency),
    periods: [...periods.values()].sort(
      (a, b) => b.period.localeCompare(a.period) || byCurrency(a, b),
    ),
    books: [...books.values()].sort(
      (a, b) =>
        byCurrency(a, b) || b.net - a.net || a.title.localeCompare(b.title),
    ),
    countries: [...countries.values()].sort(
      (a, b) => byCurrency(a, b) || b.received - a.received,
    ),
    providers: [...providers.values()].sort(
      (a, b) => byCurrency(a, b) || b.received - a.received,
    ),
  };
}

/** A spreadsheet-safe CSV cell: quoted, and never read as a formula by Excel or Sheets. */
export function csvCell(value: string | number | null): string {
  if (value === null) return '';
  if (typeof value === 'number') return String(value);
  // A leading = + - @ would make a spreadsheet run the cell as a formula (CSV injection).
  const safe = /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
  return /[",\r\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

const amount = (minor: number, currency: Currency) =>
  toMajorString({ amount: minor, currency });

const DELIVERY: Record<string, string> = {
  instant: 'Instant (ebook)',
  pending: 'Not shipped yet',
  processing: 'Being prepared',
  shipped: 'Shipped',
  delivered: 'Delivered',
  not_required: 'Not required',
};

/**
 * The sales report as CSV (UTF-8 with BOM, so Excel shows ₦ and accented names). Amounts are in
 * major units with their currency beside them; dates in the report's time zone.
 */
export function salesCsv(rows: SaleRow[], timeZone: string): string {
  const date = new Intl.DateTimeFormat('en-GB', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
  const when = (d: Date | null) => (d ? date.format(d) : '');
  const header = [
    'Paid at',
    'Order',
    'Order status',
    'Book',
    'Format',
    'Quantity',
    'Unit price',
    'Line total',
    'Discount share',
    'Line net',
    'Currency',
    'Buyer',
    'Buyer email',
    'Country',
    'City',
    'Payment provider',
    'Coupon',
    'Delivery',
    'Carrier',
    'Tracking number',
    'Shipped at',
    'Delivered at',
    'Order shipping charged',
    'Order total paid',
    'Order refunded',
  ];
  const lines = rows.map((r) =>
    [
      when(r.paidAt),
      r.orderNumber,
      r.orderStatus.replace('_', ' '),
      r.title,
      r.format === 'ebook' ? 'Ebook' : 'Print',
      r.quantity,
      amount(r.unitPrice, r.currency),
      amount(r.lineTotal, r.currency),
      amount(r.discount, r.currency),
      amount(r.lineNet, r.currency),
      r.currency,
      r.buyerName,
      r.buyerEmail,
      r.country,
      r.city,
      r.provider,
      r.coupon,
      DELIVERY[r.delivery] ?? r.delivery,
      r.carrier,
      r.trackingNumber,
      when(r.shippedAt),
      when(r.deliveredAt),
      amount(r.orderShipping, r.currency),
      amount(r.orderTotal, r.currency),
      amount(r.orderRefunded, r.currency),
    ]
      .map(csvCell)
      .join(','),
  );
  return `﻿${[header.map(csvCell).join(','), ...lines].join('\r\n')}\r\n`;
}
