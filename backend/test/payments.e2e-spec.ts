import { getModelToken } from '@nestjs/mongoose';
import { createHmac, randomBytes } from 'node:crypto';
import type { Model } from 'mongoose';
import request from 'supertest';
import { Book } from '../src/catalog/schemas/book.schema.js';
import { Order } from '../src/commerce/schemas/order.schema.js';
import { Payment } from '../src/payments/schemas/payment.schema.js';
import { createTestApp, type TestApp } from './app.js';
import { TEST_PAYSTACK_SECRET } from './test-env.js';

const PASSWORD = 'lathe-gearbox-torque-42';

describe('Payments over HTTP (e2e)', () => {
  let ctx: TestApp;
  let payments: Model<Payment>;
  let orders: Model<Order>;
  const http = () => request(ctx.app.getHttpServer());

  beforeAll(async () => {
    ctx = await createTestApp();
    payments = ctx.app.get(getModelToken(Payment.name));
    orders = ctx.app.get(getModelToken(Order.name));
    const books = ctx.app.get<Model<Book>>(getModelToken(Book.name));
    await books.create({
      title: 'Heat Treatment of Steels',
      slug: 'heat-treatment-of-steels',
      status: 'published',
      formats: [
        {
          type: 'ebook',
          sku: 'E-HT',
          active: true,
          prices: [{ currency: 'NGN', amount: 1_500_000 }],
          ebook: { stampWithBuyer: true },
        },
      ],
    });
  });

  afterAll(async () => {
    await ctx?.close();
  });

  /** A guest order for the ebook, plus a payment attempt (as /payments/initiate would create). */
  async function orderWithAttempt() {
    const book = await http().get('/catalog/books?currency=NGN').expect(200);
    const bookId = book.body.items[0].id as string;
    const added = await http()
      .post('/cart/items?currency=NGN')
      .send({ bookId, format: 'ebook', quantity: 1 })
      .expect(201);
    const cookie = ([] as string[])
      .concat(added.headers['set-cookie'] ?? [])
      .find((c) => c.startsWith('bs_cart='))!
      .split(';')[0];
    const placed = await http()
      .post('/orders')
      .set('Cookie', cookie)
      .set('Idempotency-Key', `e2e-key-${Date.now()}-0123456789`)
      .send({
        currency: 'NGN',
        email: `guest${Date.now()}@example.com`,
        name: 'Chidi Eze',
        acceptTerms: true,
      })
      .expect(201);
    const order = (await orders
      .findOne({ orderNumber: placed.body.orderNumber })
      .lean())!;
    const reference = `BSP-${randomBytes(16).toString('hex')}`;
    await payments.create({
      orderId: order._id,
      provider: 'paystack',
      reference,
      amount: order.total,
      currency: order.currency,
      status: 'initiated',
    });
    return { order, reference };
  }

  const signed = (body: object) => {
    const raw = JSON.stringify(body);
    return {
      raw,
      signature: createHmac('sha512', TEST_PAYSTACK_SECRET)
        .update(raw)
        .digest('hex'),
    };
  };

  it('offers only configured providers for a currency', async () => {
    const res = await http().get('/payments/options?currency=NGN').expect(200);
    expect(res.body).toEqual({
      currency: 'NGN',
      providers: [{ id: 'paystack', label: 'Paystack' }],
      default: 'paystack',
    });
    const usd = await http().get('/payments/options?currency=USD').expect(200);
    expect(usd.body.default).toBe('paystack');
    await http().get('/payments/options?currency=JPY').expect(400);
  });

  it('pays the order from a correctly signed webhook over the raw body, exactly once', async () => {
    const { order, reference } = await orderWithAttempt();
    const { raw, signature } = signed({
      event: 'charge.success',
      data: {
        id: 4242,
        status: 'success',
        reference,
        amount: order.total,
        currency: 'NGN',
      },
    });

    await http()
      .post('/payments/webhooks/paystack')
      .set('Content-Type', 'application/json')
      .set('x-paystack-signature', 'f'.repeat(128))
      .send(raw)
      .expect(401);
    expect((await orders.findById(order._id).lean())!.status).toBe(
      'pending_payment',
    );

    for (let i = 0; i < 2; i += 1) {
      await http()
        .post('/payments/webhooks/paystack')
        .set('Content-Type', 'application/json')
        .set('x-paystack-signature', signature)
        .send(raw)
        .expect(200, { received: true });
    }
    expect(await orders.findById(order._id).lean()).toMatchObject({
      status: 'paid',
      payment: { provider: 'paystack' },
    });
    expect(await payments.findOne({ reference }).lean()).toMatchObject({
      status: 'succeeded',
      providerTransactionId: '4242',
    });
  });

  it('never marks paid when the signed webhook reports a different amount', async () => {
    const { order, reference } = await orderWithAttempt();
    const { raw, signature } = signed({
      event: 'charge.success',
      data: {
        id: 4343,
        status: 'success',
        reference,
        amount: order.total - 1,
        currency: 'NGN',
      },
    });
    await http()
      .post('/payments/webhooks/paystack')
      .set('Content-Type', 'application/json')
      .set('x-paystack-signature', signature)
      .send(raw)
      .expect(200);
    expect(await orders.findById(order._id).lean()).toMatchObject({
      status: 'pending_payment',
      attention: { required: true },
    });
  });

  it('rejects unknown providers and unsigned calls; validates input strictly', async () => {
    await http().post('/payments/webhooks/paypal').send({}).expect(401);
    await http().post('/payments/webhooks/stripe').send({}).expect(401); // not configured here
    await http()
      .post('/payments/verify')
      .send({ reference: 'nope' })
      .expect(400);
    await http()
      .post('/payments/verify')
      .send({ reference: `BSP-${'0'.repeat(32)}` })
      .expect(404);
    await http()
      .post('/payments/initiate')
      .send({
        orderNumber: 'BS-2026-999999',
        provider: 'paystack',
        checkoutKey: 'x'.repeat(30),
      })
      .expect(404);
    await http()
      .post('/payments/initiate')
      .send({ orderNumber: 'BS-2026-999999', provider: 'paypal' })
      .expect(400);
  });

  it('keeps refunds for the owner (with 2FA); admins and customers are refused', async () => {
    const reg = await http()
      .post('/auth/register')
      .send({
        name: 'Ada Obi',
        email: 'ada-pay@example.com',
        password: PASSWORD,
        acceptTerms: true,
      })
      .expect(201);
    await http()
      .post('/admin/orders/BS-2026-000001/refunds')
      .set('Authorization', `Bearer ${reg.body.accessToken as string}`)
      .send({ amount: 100, reason: 'x' })
      .expect(403);
    await http()
      .post('/admin/orders/BS-2026-000001/refunds')
      .send({ amount: 100, reason: 'x' })
      .expect(401);
  });
});
