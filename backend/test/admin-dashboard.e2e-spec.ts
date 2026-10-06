import { getModelToken } from '@nestjs/mongoose';
import { Types, type Model } from 'mongoose';
import { Secret, TOTP } from 'otpauth';
import request from 'supertest';
import { User } from '../src/users/schemas/user.schema.js';
import { createTestApp, type TestApp } from './app.js';

const PASSWORD = 'lathe-gearbox-torque-42';

/** The store dashboard, customers and audit log (BS-12): access and the figures. */
describe('Admin dashboard (e2e)', () => {
  let ctx: TestApp;
  let customerToken: string;
  let ownerToken: string;
  let adminToken: string;
  let buyerId: Types.ObjectId;
  const http = () => request(ctx.app.getHttpServer());
  const bearer = (token: string) => ({ Authorization: `Bearer ${token}` });

  async function register(email: string, name = 'Test Person') {
    const res = await http()
      .post('/auth/register')
      .send({ name, email, password: PASSWORD, acceptTerms: true })
      .expect(201);
    return res.body.accessToken as string;
  }

  /** A staff account signed in with two-step verification. */
  async function staff(email: string, role: 'admin' | 'owner') {
    const users = ctx.app.get<Model<User>>(getModelToken(User.name));
    await register(email, role === 'owner' ? 'Store Owner' : 'Store Admin');
    await users.updateOne({ email }, { role });
    const login = await http()
      .post('/auth/login')
      .send({ email, password: PASSWORD })
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
    return (
      await http().post('/auth/2fa/enable').set(auth).send({ code }).expect(200)
    ).body.accessToken as string;
  }

  beforeAll(async () => {
    ctx = await createTestApp();
    customerToken = await register('reader@example.com', 'Ada Reader');
    ownerToken = await staff('owner@example.com', 'owner');
    adminToken = await staff('admin@example.com', 'admin');
    const users = ctx.app.get<Model<User>>(getModelToken(User.name));
    buyerId = (await users.findOne({ email: 'reader@example.com' }))!._id;

    const bookId = new Types.ObjectId();
    await ctx.app.get(getModelToken('Book')).collection.insertOne({
      _id: bookId,
      title: 'Cast Irons',
      slug: 'cast-irons',
      status: 'published',
      authorIds: [],
      categoryIds: [],
      tags: [],
      formats: [
        {
          type: 'print',
          sku: 'P-1',
          active: true,
          prices: [{ currency: 'NGN', amount: 2_000_000 }],
          compareAtPrices: [],
          print: {
            stockOnHand: 3,
            stockReserved: 1,
            weightGrams: 500,
            maxPerOrder: 5,
          },
        },
      ],
    });
    const orders = ctx.app.get(getModelToken('Order')).collection;
    const paymentId = new Types.ObjectId();
    const orderId = new Types.ObjectId();
    await orders.insertMany([
      {
        _id: orderId,
        orderNumber: 'BS-2026-000001',
        userId: buyerId,
        email: 'reader@example.com',
        customerName: 'Ada Reader',
        currency: 'NGN',
        items: [
          {
            bookId,
            format: 'print',
            sku: 'P-1',
            titleSnapshot: 'Cast Irons',
            slugSnapshot: 'cast-irons',
            unitAmount: 2_000_000,
            quantity: 1,
            lineTotal: 2_000_000,
          },
        ],
        subtotal: 2_000_000,
        discountTotal: 0,
        shippingTotal: 350_000,
        taxTotal: 0,
        total: 2_350_000,
        refundedTotal: 0,
        country: 'NG',
        status: 'paid',
        shipment: { status: 'pending' },
        payment: { provider: 'paystack', paymentId, paidAt: new Date() },
        attention: {
          required: true,
          reason: 'Paid after expiry and the last copy was gone',
        },
        checkoutKeyHash: 'hash-1',
        statusHistory: [],
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ]);
    await ctx.app.get(getModelToken('Payment')).collection.insertOne({
      _id: paymentId,
      orderId,
      provider: 'paystack',
      reference: 'BSP_TEST1',
      amount: 2_350_000,
      currency: 'NGN',
      status: 'succeeded',
      refunds: [],
      reconciliationRequired: true,
      reconciliationReason: 'Refund outcome unknown',
      updatedAt: new Date(),
    });
    await ctx.app.get(getModelToken('PreviewEvent')).collection.insertMany([
      { bookId, sessionId: 's1', type: 'open', page: null, at: new Date() },
      { bookId, sessionId: 's1', type: 'page', page: 2, at: new Date() },
      { bookId, sessionId: 's2', type: 'open', page: null, at: new Date() },
      {
        bookId,
        sessionId: 's2',
        type: 'buy_click',
        page: null,
        at: new Date(),
      },
    ]);
  });

  afterAll(async () => {
    await ctx?.close();
  });

  it('is for staff with two-step verification', async () => {
    await http().get('/admin/dashboard').expect(401);
    await http().get('/admin/dashboard').set(bearer(customerToken)).expect(403);
    await http().get('/admin/customers').set(bearer(customerToken)).expect(403);
    await http().get('/admin/dashboard').set(bearer(adminToken)).expect(200);
  });

  it('puts what needs a person first, then the figures', async () => {
    const res = await http()
      .get('/admin/dashboard')
      .set(bearer(ownerToken))
      .expect(200);
    const d = res.body;
    expect(d.attention.orderCount).toBe(1);
    expect(d.attention.orders[0]).toMatchObject({
      orderNumber: 'BS-2026-000001',
      reason: 'Paid after expiry and the last copy was gone',
    });
    expect(d.attention.payments[0]).toMatchObject({
      orderNumber: 'BS-2026-000001',
      reference: 'BSP_TEST1',
      reason: 'Refund outcome unknown',
    });
    expect(d.attention.toShip.count).toBe(1);
    expect(d.revenue.today).toEqual([
      expect.objectContaining({ currency: 'NGN', received: 2_350_000 }),
    ]);
    expect(d.bestSellers[0]).toMatchObject({ title: 'Cast Irons', copies: 1 });
    expect(d.conversion[0]).toMatchObject({
      title: 'Cast Irons',
      readers: 2,
      buyClicks: 1,
      orders: 1,
      rate: 50,
    });
    expect(d.lowStock).toEqual([
      expect.objectContaining({ title: 'Cast Irons', left: 2 }),
    ]);
    expect(d.customers.total).toBe(1);
  });

  it('lists customers with what they spent, per currency', async () => {
    const res = await http()
      .get('/admin/customers')
      .query({ role: 'customer', q: 'ada' })
      .set(bearer(ownerToken))
      .expect(200);
    expect(res.body.total).toBe(1);
    expect(res.body.items[0]).toMatchObject({
      name: 'Ada Reader',
      email: 'reader@example.com',
      guest: false,
      orders: 1,
      spent: [{ currency: 'NGN', amount: 2_350_000 }],
    });
    expect(res.body.items[0]).not.toHaveProperty('passwordHash');

    const staffList = await http()
      .get('/admin/customers')
      .query({ role: 'staff' })
      .set(bearer(ownerToken))
      .expect(200);
    expect(
      staffList.body.items.map((u: { role: string }) => u.role).sort(),
    ).toEqual(['admin', 'owner']);
  });

  it('shows the audit log to the owner only', async () => {
    await http().get('/admin/audit-log').set(bearer(adminToken)).expect(403);
    const res = await http()
      .get('/admin/audit-log')
      .query({ q: 'two_factor' })
      .set(bearer(ownerToken))
      .expect(200);
    expect(res.body.total).toBeGreaterThanOrEqual(2);
    expect(res.body.items[0].actor).toMatchObject({
      name: expect.any(String),
    });
    expect(res.body.entityTypes).toContain('user');
  });
});
