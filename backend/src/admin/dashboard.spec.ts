import type { ReportOrder } from '../reports/sales-report.js';
import {
  bestSellers,
  conversion,
  dashboardWindows,
  localDate,
  lowStock,
  revenue,
} from './dashboard.js';

const TZ = 'Africa/Lagos';
const NOW = new Date('2026-10-06T10:00:00Z');

function order(
  n: number,
  paidAt: string,
  currency: ReportOrder['currency'],
  items: Array<[string, 'ebook' | 'print', number, number]>,
): ReportOrder {
  const lines = items.map(([bookId, format, unitAmount, quantity]) => ({
    bookId,
    format,
    titleSnapshot: `Book ${bookId}`,
    unitAmount,
    quantity,
    lineTotal: unitAmount * quantity,
  }));
  const subtotal = lines.reduce((s, l) => s + l.lineTotal, 0);
  return {
    _id: `o${n}`,
    orderNumber: `BS-2026-${String(n).padStart(6, '0')}`,
    email: 'buyer@example.com',
    customerName: 'Buyer',
    currency,
    status: 'paid',
    country: 'NG',
    shippingAddress: null,
    items: lines,
    subtotal,
    discountTotal: 0,
    shippingTotal: 0,
    taxTotal: 0,
    total: subtotal,
    refundedTotal: 0,
    coupon: null,
    payment: { provider: 'paystack', paidAt: new Date(paidAt) },
    shipment: {
      status: 'not_required',
      carrier: null,
      trackingNumber: null,
      shippedAt: null,
      deliveredAt: null,
    },
  };
}

describe('dashboard windows', () => {
  it('uses the owner’s calendar day', () => {
    // 23:30 UTC on the 5th is already the 6th in Lagos (UTC+1).
    expect(localDate(new Date('2026-10-05T23:30:00Z'), TZ)).toBe('2026-10-06');
    expect(dashboardWindows(NOW, TZ)).toEqual({
      today: { from: '2026-10-06', to: '2026-10-06' },
      week: { from: '2026-09-30', to: '2026-10-06' },
      month: { from: '2026-09-07', to: '2026-10-06' },
    });
  });
});

describe('revenue', () => {
  const orders = [
    order(1, '2026-10-06T08:00:00Z', 'NGN', [['a', 'ebook', 1_200_000, 1]]),
    order(2, '2026-10-02T08:00:00Z', 'NGN', [['b', 'print', 2_000_000, 2]]),
    order(3, '2026-09-10T08:00:00Z', 'USD', [['a', 'ebook', 1999, 1]]),
  ];

  it('keeps each currency separate in each window', () => {
    const r = revenue(orders, NOW, TZ);
    expect(r.today.map((t) => [t.currency, t.received])).toEqual([
      ['NGN', 1_200_000],
    ]);
    expect(r.week.map((t) => [t.currency, t.received])).toEqual([
      ['NGN', 5_200_000],
    ]);
    expect(r.month.map((t) => [t.currency, t.received])).toEqual([
      ['NGN', 5_200_000],
      ['USD', 1999],
    ]);
  });

  it('has a row for every day and currency, zero days included', () => {
    const r = revenue(orders, NOW, TZ);
    expect(r.daily).toHaveLength(60);
    expect(r.daily.at(-2)).toEqual({
      date: '2026-10-06',
      currency: 'NGN',
      received: 1_200_000,
    });
    expect(r.daily.at(-1)).toEqual({
      date: '2026-10-06',
      currency: 'USD',
      received: 0,
    });
  });

  it('is empty with no sales', () => {
    const r = revenue([], NOW, TZ);
    expect(r).toEqual({ today: [], week: [], month: [], daily: [] });
  });
});

describe('best sellers', () => {
  it('ranks books by copies across currencies, money per currency', () => {
    const top = bestSellers([
      order(1, '2026-10-01T08:00:00Z', 'NGN', [['a', 'ebook', 100, 1]]),
      order(2, '2026-10-01T08:00:00Z', 'USD', [['a', 'print', 10, 2]]),
      order(3, '2026-10-01T08:00:00Z', 'NGN', [['b', 'ebook', 500, 2]]),
    ]);
    expect(top.map((b) => [b.bookId, b.copies])).toEqual([
      ['a', 3],
      ['b', 2],
    ]);
    expect(top[0].sales).toEqual([
      { currency: 'NGN', amount: 100 },
      { currency: 'USD', amount: 20 },
    ]);
    expect(top[0]).toMatchObject({ ebookCopies: 1, printCopies: 2 });
  });
});

describe('preview → purchase', () => {
  it('divides orders by preview readers, per book', () => {
    const rows = conversion(
      [
        { id: 'a', title: 'A', slug: 'a' },
        { id: 'b', title: 'B', slug: 'b' },
        { id: 'c', title: 'C', slug: 'c' },
      ],
      [
        { bookId: 'a', readers: 40, finished: 12, buyClicks: 6 },
        { bookId: 'b', readers: 3, finished: 1, buyClicks: 0 },
      ],
      [
        // Two lines of the same book on one order count once.
        order(1, '2026-10-01T08:00:00Z', 'NGN', [
          ['a', 'ebook', 100, 1],
          ['a', 'print', 200, 1],
        ]),
        order(2, '2026-10-01T08:00:00Z', 'NGN', [['a', 'ebook', 100, 1]]),
        order(3, '2026-10-01T08:00:00Z', 'NGN', [['c', 'ebook', 100, 1]]),
      ],
    );
    expect(rows.map((r) => [r.bookId, r.readers, r.orders, r.rate])).toEqual([
      ['a', 40, 2, 5],
      ['b', 3, 0, 0],
      ['c', 0, 1, null],
    ]);
  });
});

describe('low stock', () => {
  it('lists published, active print copies at or under the threshold', () => {
    const book = (
      id: string,
      status: string,
      onHand: number,
      reserved: number,
      active = true,
    ) => ({
      _id: id,
      title: `Book ${id}`,
      status,
      formats: [
        { type: 'ebook', active: true, print: null },
        {
          type: 'print',
          active,
          print: { stockOnHand: onHand, stockReserved: reserved },
        },
      ],
    });
    const rows = lowStock(
      [
        book('a', 'published', 10, 0),
        book('b', 'published', 5, 3),
        book('c', 'published', 0, 0),
        book('d', 'draft', 0, 0),
        book('e', 'published', 0, 0, false),
      ],
      3,
    );
    expect(rows.map((r) => [r.bookId, r.left])).toEqual([
      ['c', 0],
      ['b', 2],
    ]);
  });
});
