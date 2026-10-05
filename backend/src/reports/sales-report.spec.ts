import { dayStart } from './reports.service.js';
import {
  allocate,
  csvCell,
  earnings,
  periodKey,
  saleRows,
  salesCsv,
  type ReportOrder,
} from './sales-report.js';

const id = (s: string) => ({ toString: () => s });

function order(over: Partial<ReportOrder> = {}): ReportOrder {
  return {
    _id: id('o1'),
    orderNumber: 'BS-2026-000001',
    email: 'ada@example.com',
    customerName: 'Ada Obi',
    currency: 'NGN',
    status: 'paid',
    country: 'NG',
    shippingAddress: null,
    items: [
      {
        bookId: id('b1'),
        format: 'ebook',
        titleSnapshot: 'Cast Irons',
        unitAmount: 1_300_000,
        quantity: 1,
        lineTotal: 1_300_000,
      },
    ],
    subtotal: 1_300_000,
    discountTotal: 0,
    shippingTotal: 0,
    taxTotal: 0,
    total: 1_300_000,
    refundedTotal: 0,
    coupon: null,
    payment: { provider: 'paystack', paidAt: new Date('2026-10-05T09:00:00Z') },
    shipment: {
      status: 'not_required',
      carrier: null,
      trackingNumber: null,
      shippedAt: null,
      deliveredAt: null,
    },
    ...over,
  };
}

/** Ebook ₦13,000 + print ₦22,000 × 2, 10% coupon (₦5,700), ₦2,500 shipping to Lagos, shipped. */
const mixed = order({
  _id: id('o2'),
  orderNumber: 'BS-2026-000002',
  items: [
    {
      bookId: id('b1'),
      format: 'ebook',
      titleSnapshot: 'Cast Irons',
      unitAmount: 1_300_000,
      quantity: 1,
      lineTotal: 1_300_000,
    },
    {
      bookId: id('b2'),
      format: 'print',
      titleSnapshot: 'Casting Defects',
      unitAmount: 2_200_000,
      quantity: 2,
      lineTotal: 4_400_000,
    },
  ],
  subtotal: 5_700_000,
  discountTotal: 570_000,
  shippingTotal: 250_000,
  total: 5_380_000,
  coupon: { code: 'SAVE10' },
  shippingAddress: { city: 'Lagos', country: 'NG' },
  payment: { provider: 'paystack', paidAt: new Date('2026-10-06T10:00:00Z') },
  shipment: {
    status: 'shipped',
    carrier: 'GIG Logistics',
    trackingNumber: 'GIG123',
    shippedAt: new Date('2026-10-07T08:00:00Z'),
    deliveredAt: null,
  },
});

describe('allocate (discount shares)', () => {
  it('splits exactly, with the leftover units on the largest fractions', () => {
    expect(allocate(100, [1, 1, 1])).toEqual([34, 33, 33]);
    expect(allocate(570_000, [1_300_000, 4_400_000])).toEqual([
      130_000, 440_000,
    ]);
    expect(allocate(7, [3, 3, 1])).toEqual([3, 3, 1]);
    expect(allocate(0, [5, 5])).toEqual([0, 0]);
    for (const [total, weights] of [
      [999, [1, 2, 3, 4]],
      [1, [7, 7, 7]],
      [123_457, [3333, 1, 99_999]],
    ] as Array<[number, number[]]>) {
      expect(allocate(total, weights).reduce((a, b) => a + b, 0)).toBe(total);
    }
  });
});

describe('saleRows', () => {
  it('one row per book per order, newest first, with discount share, delivery and country', () => {
    const rows = saleRows([order(), mixed]);
    expect(rows.map((r) => r.orderNumber)).toEqual([
      'BS-2026-000002',
      'BS-2026-000002',
      'BS-2026-000001',
    ]);
    const [ebook, print] = rows;
    expect(ebook).toMatchObject({
      title: 'Cast Irons',
      format: 'ebook',
      lineTotal: 1_300_000,
      discount: 130_000,
      lineNet: 1_170_000,
      delivery: 'instant',
      country: 'NG',
      city: null,
      carrier: null,
      coupon: 'SAVE10',
    });
    expect(print).toMatchObject({
      title: 'Casting Defects',
      format: 'print',
      quantity: 2,
      unitPrice: 2_200_000,
      discount: 440_000,
      lineNet: 3_960_000,
      delivery: 'shipped',
      carrier: 'GIG Logistics',
      trackingNumber: 'GIG123',
      city: 'Lagos',
      orderShipping: 250_000,
      orderTotal: 5_380_000,
    });
  });

  it('skips an order with no payment record', () => {
    expect(saleRows([order({ payment: null })])).toEqual([]);
  });
});

describe('earnings', () => {
  const usd = order({
    _id: id('o3'),
    orderNumber: 'BS-2026-000003',
    currency: 'USD',
    country: 'GB',
    items: [
      {
        bookId: id('b1'),
        format: 'ebook',
        titleSnapshot: 'Cast Irons',
        unitAmount: 2199,
        quantity: 1,
        lineTotal: 2199,
      },
    ],
    subtotal: 2199,
    total: 2199,
    refundedTotal: 2199,
    status: 'refunded',
    payment: {
      provider: 'flutterwave',
      paidAt: new Date('2026-09-30T23:30:00Z'),
    },
  });

  it('totals per currency, never adding naira to dollars', () => {
    const report = earnings([order(), mixed, usd], 'month', 'Africa/Lagos');
    expect(report.totals).toEqual([
      {
        currency: 'NGN',
        orders: 2,
        ebookCopies: 2,
        printCopies: 2,
        bookSales: 7_000_000,
        discounts: 570_000,
        shipping: 250_000,
        tax: 0,
        received: 6_680_000,
        refunds: 0,
        net: 6_680_000,
        averageOrder: 3_340_000,
      },
      expect.objectContaining({
        currency: 'USD',
        orders: 1,
        received: 2199,
        refunds: 2199,
        net: 0,
      }),
    ]);
  });

  it('groups by period in Lagos time: 23:30 UTC on 30 September is 1 October there', () => {
    const report = earnings([order(), usd], 'month', 'Africa/Lagos');
    expect(report.periods.map((p) => `${p.period} ${p.currency}`)).toEqual([
      '2026-10 NGN',
      '2026-10 USD',
    ]);
  });

  it('by book (net of each line’s discount share), by country and by provider', () => {
    const report = earnings([order(), mixed, usd], 'day', 'Africa/Lagos');
    expect(report.books.filter((b) => b.currency === 'NGN')).toEqual([
      {
        bookId: 'b2',
        title: 'Casting Defects',
        currency: 'NGN',
        ebookCopies: 0,
        printCopies: 2,
        sales: 4_400_000,
        net: 3_960_000,
      },
      {
        bookId: 'b1',
        title: 'Cast Irons',
        currency: 'NGN',
        ebookCopies: 2,
        printCopies: 0,
        sales: 2_600_000,
        net: 2_470_000,
      },
    ]);
    expect(
      report.countries.map((c) => `${c.country} ${c.currency} ${c.orders}`),
    ).toEqual(['NG NGN 2', 'GB USD 1']);
    expect(report.providers.map((p) => `${p.provider} ${p.currency}`)).toEqual([
      'paystack NGN',
      'flutterwave USD',
    ]);
  });
});

describe('periods and days', () => {
  it('keys days, Monday-start weeks and months in the time zone', () => {
    const at = new Date('2026-10-04T23:30:00Z'); // Monday 5 Oct, 00:30 in Lagos
    expect(periodKey(at, 'day', 'Africa/Lagos')).toBe('2026-10-05');
    expect(periodKey(at, 'week', 'Africa/Lagos')).toBe('2026-10-05');
    expect(
      periodKey(new Date('2026-10-11T12:00:00Z'), 'week', 'Africa/Lagos'),
    ).toBe('2026-10-05');
    expect(periodKey(at, 'month', 'Africa/Lagos')).toBe('2026-10');
    expect(periodKey(at, 'day', 'UTC')).toBe('2026-10-04');
  });

  it('a report day starts at local midnight', () => {
    expect(dayStart('2026-10-05', 'Africa/Lagos').toISOString()).toBe(
      '2026-10-04T23:00:00.000Z',
    );
    expect(dayStart('2026-07-01', 'Europe/London').toISOString()).toBe(
      '2026-06-30T23:00:00.000Z',
    );
    expect(dayStart('2026-01-15', 'UTC').toISOString()).toBe(
      '2026-01-15T00:00:00.000Z',
    );
  });
});

describe('CSV', () => {
  it('quotes what needs quoting and defuses spreadsheet formulas', () => {
    expect(csvCell('Cast Irons')).toBe('Cast Irons');
    expect(csvCell('Obi, Ada')).toBe('"Obi, Ada"');
    expect(csvCell('He said "hi"')).toBe('"He said ""hi"""');
    expect(csvCell('=HYPERLINK("x")')).toBe(`"'=HYPERLINK(""x"")"`);
    expect(csvCell('+234')).toBe("'+234");
    expect(csvCell(null)).toBe('');
    expect(csvCell(3)).toBe('3');
  });

  it('writes one line per sale, amounts in major units with the currency, Excel-ready', () => {
    const csv = salesCsv(saleRows([mixed]), 'Africa/Lagos');
    expect(csv.startsWith('﻿Paid at,Order,')).toBe(true);
    const lines = csv.trim().split('\r\n');
    expect(lines).toHaveLength(3);
    expect(lines[2]).toContain(
      'Casting Defects,Print,2,22000.00,44000.00,4400.00,39600.00,NGN',
    );
    expect(lines[2]).toContain('Shipped,GIG Logistics,GIG123');
    expect(lines[1]).toContain('Instant (ebook)');
  });
});
