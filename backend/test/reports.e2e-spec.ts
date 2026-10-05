import { getModelToken } from '@nestjs/mongoose';
import { Types, type Model } from 'mongoose';
import { Secret, TOTP } from 'otpauth';
import request from 'supertest';
import { User } from '../src/users/schemas/user.schema.js';
import { createTestApp, type TestApp } from './app.js';

const PASSWORD = 'lathe-gearbox-torque-42';

/** Sales and earnings reports (BS-29): access, validation, the figures and the CSV. */
describe('Reports (e2e)', () => {
  let ctx: TestApp;
  let customerToken: string;
  let staffToken: string;
  const http = () => request(ctx.app.getHttpServer());
  const bearer = (token: string) => ({ Authorization: `Bearer ${token}` });

  async function register(email: string): Promise<string> {
    const res = await http()
      .post('/auth/register')
      .send({
        name: 'Test Person',
        email,
        password: PASSWORD,
        acceptTerms: true,
      })
      .expect(201);
    return res.body.accessToken as string;
  }

  const baseOrder = (n: number, over: Record<string, unknown>) => ({
    orderNumber: `BS-2026-${String(n).padStart(6, '0')}`,
    userId: new Types.ObjectId(),
    email: `buyer${n}@example.com`,
    customerName: `Buyer ${n}`,
    currency: 'NGN',
    items: [
      {
        bookId: new Types.ObjectId('64b0000000000000000000a1'),
        format: 'ebook',
        sku: 'E-1',
        titleSnapshot: 'Cast Irons',
        slugSnapshot: 'cast-irons',
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
    country: 'NG',
    shippingAddress: null,
    status: 'paid',
    shipment: { status: 'not_required' },
    payment: {
      provider: 'paystack',
      paymentId: new Types.ObjectId(),
      paidAt: new Date('2026-10-05T09:00:00Z'),
    },
    checkoutKeyHash: `hash-${n}`,
    statusHistory: [],
    ...over,
  });

  beforeAll(async () => {
    ctx = await createTestApp();
    const users = ctx.app.get<Model<User>>(getModelToken(User.name));
    customerToken = await register('reader@example.com');
    await register('owner@example.com');
    await users.updateOne({ email: 'owner@example.com' }, { role: 'owner' });
    const login = await http()
      .post('/auth/login')
      .send({ email: 'owner@example.com', password: PASSWORD })
      .expect(200);
    const auth = bearer(login.body.accessToken);
    const setup = await http()
      .post('/auth/2fa/setup')
      .set(auth)
      .send({ password: PASSWORD })
      .expect(200);
    const code = TOTP.generate({
      secret: Secret.fromBase32(setup.body.manualKey.replace(/\s/g, '')),
      period: 30,
    });
    staffToken = (
      await http().post('/auth/2fa/enable').set(auth).send({ code }).expect(200)
    ).body.accessToken;

    const orders = ctx.app.get(getModelToken('Order')).collection;
    await orders.insertMany([
      baseOrder(1, {}),
      baseOrder(2, {
        currency: 'USD',
        country: 'GB',
        items: [
          {
            bookId: new Types.ObjectId('64b0000000000000000000a2'),
            format: 'print',
            sku: 'P-2',
            titleSnapshot: 'Casting Defects',
            slugSnapshot: 'casting-defects',
            unitAmount: 2999,
            quantity: 2,
            lineTotal: 5998,
          },
        ],
        subtotal: 5998,
        shippingTotal: 1500,
        total: 7498,
        shippingAddress: {
          fullName: 'B',
          phone: '1',
          line1: '1',
          city: 'London',
          country: 'GB',
        },
        shipment: {
          status: 'shipped',
          carrier: 'DHL',
          trackingNumber: 'DHL9',
          shippedAt: new Date('2026-10-06T10:00:00Z'),
        },
        payment: {
          provider: 'flutterwave',
          paymentId: new Types.ObjectId(),
          paidAt: new Date('2026-10-05T12:00:00Z'),
        },
      }),
      // Not sales: unpaid, expired, and a sale outside the range.
      baseOrder(3, { status: 'pending_payment', payment: null }),
      baseOrder(4, { status: 'expired', payment: null }),
      baseOrder(5, {
        payment: {
          provider: 'paystack',
          paymentId: new Types.ObjectId(),
          paidAt: new Date('2026-09-15T09:00:00Z'),
        },
      }),
    ]);
  }, 120_000);

  afterAll(async () => {
    await ctx?.close();
  });

  const range = 'from=2026-10-01&to=2026-10-31';

  it('is for two-step verified staff only', async () => {
    await http().get(`/admin/reports/sales?${range}`).expect(401);
    await http()
      .get(`/admin/reports/sales?${range}`)
      .set(bearer(customerToken))
      .expect(403);
    await http()
      .get(`/admin/reports/earnings?${range}`)
      .set(bearer(customerToken))
      .expect(403);
    await http()
      .get(`/admin/reports/sales.csv?${range}`)
      .set(bearer(customerToken))
      .expect(403);
  });

  it('validates the range and filters', async () => {
    const get = (q: string) =>
      http().get(`/admin/reports/sales?${q}`).set(bearer(staffToken));
    await get('from=2026-10-01').expect(400);
    await get('from=yesterday&to=2026-10-31').expect(400);
    await get('from=2026-02-31&to=2026-03-01').expect(400);
    await get('from=2026-10-31&to=2026-10-01').expect(400);
    await get(`${range}&currency=JPY`).expect(400);
    await get(`${range}&format=audiobook`).expect(400);
    await get(`${range}&delivery=lost`).expect(400);
    await get(`${range}&extra=1`).expect(400);
  });

  it('lists only paid sales in the range, one row per book, with per-currency sums', async () => {
    const res = await http()
      .get(`/admin/reports/sales?${range}`)
      .set(bearer(staffToken))
      .expect(200);
    expect(res.headers['cache-control']).toBe('no-store');
    expect(res.body.total).toBe(2);
    expect(res.body.timeZone).toBe('Africa/Lagos');
    expect(
      res.body.rows.map((r: { orderNumber: string }) => r.orderNumber),
    ).toEqual(['BS-2026-000002', 'BS-2026-000001']);
    expect(res.body.rows[0]).toMatchObject({
      title: 'Casting Defects',
      format: 'print',
      quantity: 2,
      currency: 'USD',
      country: 'GB',
      city: 'London',
      delivery: 'shipped',
      carrier: 'DHL',
      provider: 'flutterwave',
    });
    expect(res.body.sums).toEqual([
      {
        currency: 'NGN',
        copies: 1,
        lineTotal: 1_300_000,
        discount: 0,
        lineNet: 1_300_000,
      },
      {
        currency: 'USD',
        copies: 2,
        lineTotal: 5998,
        discount: 0,
        lineNet: 5998,
      },
    ]);

    const printOnly = await http()
      .get(`/admin/reports/sales?${range}&format=print&q=casting`)
      .set(bearer(staffToken))
      .expect(200);
    expect(printOnly.body.total).toBe(1);
    const september = await http()
      .get('/admin/reports/sales?from=2026-09-01&to=2026-09-30')
      .set(bearer(staffToken))
      .expect(200);
    expect(
      september.body.rows.map((r: { orderNumber: string }) => r.orderNumber),
    ).toEqual(['BS-2026-000005']);
  });

  it('earnings per currency, never summed across currencies', async () => {
    const res = await http()
      .get(`/admin/reports/earnings?${range}&grouping=day`)
      .set(bearer(staffToken))
      .expect(200);
    expect(res.body.totals).toEqual([
      expect.objectContaining({
        currency: 'NGN',
        orders: 1,
        ebookCopies: 1,
        received: 1_300_000,
        net: 1_300_000,
      }),
      expect.objectContaining({
        currency: 'USD',
        orders: 1,
        printCopies: 2,
        shipping: 1500,
        received: 7498,
        net: 7498,
      }),
    ]);
    expect(
      res.body.periods.map(
        (p: { period: string; currency: string }) =>
          `${p.period} ${p.currency}`,
      ),
    ).toEqual(['2026-10-05 NGN', '2026-10-05 USD']);
  });

  it('downloads the sales as a CSV spreadsheet', async () => {
    const res = await http()
      .get(`/admin/reports/sales.csv?${range}`)
      .set(bearer(staffToken))
      .expect(200);
    expect(res.headers['content-type']).toContain('text/csv');
    expect(res.headers['content-disposition']).toContain(
      'sales-2026-10-01-to-2026-10-31.csv',
    );
    const lines = res.text.trim().split('\r\n');
    expect(lines).toHaveLength(3);
    expect(lines[1]).toContain('Casting Defects,Print,2,29.99,59.98');
  });
});
