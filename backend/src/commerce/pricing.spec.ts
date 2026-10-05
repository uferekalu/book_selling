import { evaluateCoupon, type CouponLike } from './coupon-rules.js';
import { priceCart, type PricingBook, type PricingInput } from './pricing.js';

const BOOK_A = 'aaaaaaaaaaaaaaaaaaaaaaaa';
const BOOK_B = 'bbbbbbbbbbbbbbbbbbbbbbbb';

function book(
  id: string,
  overrides: Partial<PricingBook> = {},
  stock = 10,
): PricingBook {
  return {
    id,
    slug: `book-${id.slice(0, 1)}`,
    title: `Book ${id.slice(0, 1).toUpperCase()}`,
    cover: null,
    published: true,
    formats: [
      {
        type: 'ebook',
        sku: `${id}-E`,
        active: true,
        prices: [
          { currency: 'USD', amount: 2499 },
          { currency: 'NGN', amount: 1_500_000 },
        ],
        compareAtPrices: [{ currency: 'USD', amount: 2999 }],
        print: null,
      },
      {
        type: 'print',
        sku: `${id}-P`,
        active: true,
        prices: [
          { currency: 'USD', amount: 3999 },
          { currency: 'NGN', amount: 2_500_000 },
        ],
        compareAtPrices: [],
        print: { stockOnHand: stock, stockReserved: 0, maxPerOrder: 5 },
      },
    ],
    ...overrides,
  };
}

const zone = {
  id: 'zone-ng',
  name: 'Nigeria',
  rates: [
    { currency: 'NGN' as const, firstItem: 250_000, additionalItem: 100_000 },
    { currency: 'USD' as const, firstItem: 1500, additionalItem: 500 },
  ],
  estimatedDays: { min: 2, max: 5 },
};

function input(overrides: Partial<PricingInput> = {}): PricingInput {
  return {
    currency: 'USD',
    items: [{ bookId: BOOK_A, format: 'ebook', quantity: 1 }],
    books: new Map([
      [BOOK_A, book(BOOK_A)],
      [BOOK_B, book(BOOK_B)],
    ]),
    ownedBookIds: new Set(),
    shippingCountry: null,
    zone: null,
    coupon: null,
    now: new Date('2026-10-01T12:00:00Z'),
    ...overrides,
  };
}

function coupon(overrides: Partial<CouponLike> = {}): CouponLike {
  return {
    id: 'c1',
    code: 'FOUNDRY15',
    kind: 'percent',
    percentOff: 15,
    amountsOff: [],
    minSubtotals: [],
    appliesTo: { bookIds: [], formats: [] },
    startsAt: null,
    endsAt: null,
    maxRedemptions: null,
    perCustomerLimit: null,
    redemptionCount: 0,
    active: true,
    ...overrides,
  };
}

describe('priceCart', () => {
  it('prices an ebook from the catalogue in the chosen currency', () => {
    const q = priceCart(input());
    expect(q).toMatchObject({
      currency: 'USD',
      subtotal: 2499,
      discountTotal: 0,
      shippingTotal: 0,
      taxTotal: 0,
      total: 2499,
      requiresShipping: false,
      problems: [],
    });
    expect(q.lines[0]).toMatchObject({
      unitAmount: 2499,
      compareAt: 2999,
      sku: `${BOOK_A}-E`,
      status: 'ok',
    });
  });

  it('always sells one copy of an ebook, whatever quantity was asked', () => {
    const q = priceCart(
      input({ items: [{ bookId: BOOK_A, format: 'ebook', quantity: 4 }] }),
    );
    expect(q.lines[0].quantity).toBe(1);
    expect(q.total).toBe(2499);
  });

  it('refuses an ebook the buyer already owns', () => {
    const q = priceCart(input({ ownedBookIds: new Set([BOOK_A]) }));
    expect(q.lines[0].status).toBe('owned');
    expect(q.total).toBe(0);
    expect(q.problems).toEqual(['Book A: Already in your library']);
  });

  it('flags unpublished books, inactive formats and missing prices, excluding them from totals', () => {
    const books = new Map([
      [BOOK_A, book(BOOK_A, { published: false })],
      [BOOK_B, book(BOOK_B)],
    ]);
    const q = priceCart(
      input({
        currency: 'GBP',
        books,
        items: [
          { bookId: BOOK_A, format: 'ebook', quantity: 1 },
          { bookId: BOOK_B, format: 'ebook', quantity: 1 },
        ],
      }),
    );
    expect(q.lines.map((l) => l.status)).toEqual(['unavailable', 'no_price']);
    expect(q.total).toBe(0);
    expect(q.problems).toHaveLength(2);
  });

  it('limits print copies by stock left and by the per-order maximum', () => {
    const books = new Map([[BOOK_A, book(BOOK_A, {}, 3)]]);
    const over = priceCart(
      input({
        books,
        items: [{ bookId: BOOK_A, format: 'print', quantity: 4 }],
        shippingCountry: 'NG',
        zone,
      }),
    );
    expect(over.lines[0]).toMatchObject({
      status: 'over_stock',
      maxQuantity: 3,
      message: 'Only 3 available',
    });
    const perOrder = priceCart(
      input({
        items: [{ bookId: BOOK_A, format: 'print', quantity: 6 }],
        shippingCountry: 'NG',
        zone,
      }),
    );
    expect(perOrder.lines[0]).toMatchObject({
      status: 'over_stock',
      message: 'At most 5 per order',
    });
    const none = priceCart(
      input({
        books: new Map([[BOOK_A, book(BOOK_A, {}, 0)]]),
        items: [{ bookId: BOOK_A, format: 'print', quantity: 1 }],
      }),
    );
    expect(none.lines[0].status).toBe('out_of_stock');
  });

  it('counts reserved stock as unavailable', () => {
    const reserved = book(BOOK_A);
    reserved.formats[1].print = {
      stockOnHand: 5,
      stockReserved: 4,
      maxPerOrder: 5,
    };
    const q = priceCart(
      input({
        books: new Map([[BOOK_A, reserved]]),
        items: [{ bookId: BOOK_A, format: 'print', quantity: 2 }],
        shippingCountry: 'NG',
        zone,
      }),
    );
    expect(q.lines[0]).toMatchObject({ status: 'over_stock', maxQuantity: 1 });
  });

  it('charges shipping per print copy: first plus each additional', () => {
    const q = priceCart(
      input({
        currency: 'NGN',
        items: [
          { bookId: BOOK_A, format: 'print', quantity: 2 },
          { bookId: BOOK_B, format: 'print', quantity: 1 },
          { bookId: BOOK_B, format: 'ebook', quantity: 1 },
        ],
        shippingCountry: 'NG',
        zone,
      }),
    );
    expect(q.subtotal).toBe(2_500_000 * 3 + 1_500_000);
    expect(q.shippingTotal).toBe(250_000 + 2 * 100_000);
    expect(q.total).toBe(q.subtotal + q.shippingTotal);
    expect(q.shipping).toMatchObject({
      zoneName: 'Nigeria',
      estimatedDays: { min: 2, max: 5 },
      available: true,
    });
    expect(q.problems).toEqual([]);
  });

  it('needs a destination for print, and says when it cannot ship there', () => {
    const items = [{ bookId: BOOK_A, format: 'print' as const, quantity: 1 }];
    expect(priceCart(input({ items })).problems).toEqual([
      'Choose where to ship your print copy',
    ]);
    expect(
      priceCart(input({ items, shippingCountry: 'JP', zone: null }))
        .problems[0],
    ).toBe(
      "We don't deliver print copies to Japan yet. Choose the ebook, or contact us about delivery.",
    );
    expect(
      priceCart(
        input({
          currency: 'USD',
          items,
          shippingCountry: 'NG',
          zone: {
            ...zone,
            rates: zone.rates.filter((r) => r.currency === 'NGN'),
          },
        }),
      ).problems,
    ).toEqual([
      "Delivery to Nigeria isn't priced in USD. Switch the currency to NGN to order the print copy.",
    ]);
  });

  it('never needs shipping for an ebook-only order', () => {
    const q = priceCart(input({ shippingCountry: 'JP', zone: null }));
    expect(q.requiresShipping).toBe(false);
    expect(q.problems).toEqual([]);
  });

  it('applies a percentage coupon once on the item subtotal, never on shipping', () => {
    const q = priceCart(
      input({
        items: [
          { bookId: BOOK_A, format: 'ebook', quantity: 1 },
          { bookId: BOOK_B, format: 'print', quantity: 1 },
        ],
        shippingCountry: 'NG',
        zone,
        coupon: { code: 'foundry15', found: coupon(), customerUses: 0 },
      }),
    );
    // (2499 + 3999) × 15% = 974.7 → 975
    expect(q.discountTotal).toBe(975);
    expect(q.total).toBe(2499 + 3999 - 975 + 1500);
    expect(q.coupon).toMatchObject({ code: 'FOUNDRY15', applied: true });
  });

  it('reports an unknown or inapplicable code without blocking the quote', () => {
    const unknown = priceCart(
      input({ coupon: { code: 'NOPE', found: null, customerUses: null } }),
    );
    expect(unknown.coupon).toMatchObject({
      applied: false,
      message: 'That code is not valid',
    });
    expect(unknown.total).toBe(2499);
    expect(unknown.problems).toEqual([]);
  });

  it('refuses to make an order free', () => {
    const q = priceCart(
      input({
        coupon: {
          code: 'ALL',
          found: coupon({ percentOff: 100 }),
          customerUses: 0,
        },
      }),
    );
    expect(q.total).toBe(0);
    expect(q.problems[0]).toMatch(/cannot make an order free/);
  });
});

describe('evaluateCoupon', () => {
  const now = new Date('2026-10-01T12:00:00Z');
  const lines = [
    { bookId: BOOK_A, format: 'ebook' as const, lineTotal: 2499 },
    { bookId: BOOK_B, format: 'print' as const, lineTotal: 3999 },
  ];

  it('takes a fixed amount in the order currency, capped at the eligible subtotal', () => {
    const fixed = coupon({
      kind: 'fixed',
      percentOff: null,
      amountsOff: [{ currency: 'USD', amount: 1000 }],
    });
    expect(evaluateCoupon(fixed, lines, 'USD', now, 0)).toMatchObject({
      ok: true,
      discount: { amount: 1000 },
    });
    expect(evaluateCoupon(fixed, lines, 'NGN', now, 0)).toMatchObject({
      ok: false,
      reason: expect.stringMatching(/NGN/),
    });
    const huge = coupon({
      kind: 'fixed',
      percentOff: null,
      amountsOff: [{ currency: 'USD', amount: 99_999 }],
    });
    expect(evaluateCoupon(huge, lines, 'USD', now, 0)).toMatchObject({
      ok: true,
      discount: { amount: 6498 },
    });
  });

  it('applies only to the chosen books or formats', () => {
    const ebooksOnly = coupon({
      appliesTo: { bookIds: [], formats: ['ebook'] },
    });
    expect(evaluateCoupon(ebooksOnly, lines, 'USD', now, 0)).toMatchObject({
      ok: true,
      discount: { amount: 375 },
    }); // 2499 × 15% = 374.85
    const otherBook = coupon({
      appliesTo: { bookIds: ['cccccccccccccccccccccccc'], formats: [] },
    });
    expect(evaluateCoupon(otherBook, lines, 'USD', now, 0)).toMatchObject({
      ok: false,
    });
  });

  it('enforces the date window, limits, minimum spend and the active switch', () => {
    const cases: Array<[Partial<CouponLike>, RegExp, number | null]> = [
      [{ active: false }, /not active/, 0],
      [{ startsAt: new Date('2026-10-02') }, /not valid yet/, 0],
      [{ endsAt: new Date('2026-09-30') }, /expired/, 0],
      [{ maxRedemptions: 10, redemptionCount: 10 }, /fully used/, 0],
      [{ perCustomerLimit: 1 }, /already used/, 1],
      [{ minSubtotals: [{ currency: 'USD', amount: 10_000 }] }, /minimum/, 0],
    ];
    for (const [overrides, reason, uses] of cases) {
      expect(
        evaluateCoupon(coupon(overrides), lines, 'USD', now, uses),
      ).toEqual({ ok: false, reason: expect.stringMatching(reason) });
    }
    // Per-customer limit unknown (no email yet): checked again when the order is placed.
    expect(
      evaluateCoupon(coupon({ perCustomerLimit: 1 }), lines, 'USD', now, null),
    ).toMatchObject({ ok: true });
  });
});
