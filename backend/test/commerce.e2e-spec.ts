import { getModelToken } from '@nestjs/mongoose';
import type { Model } from 'mongoose';
import request from 'supertest';
import { Book } from '../src/catalog/schemas/book.schema.js';
import { createTestApp, type TestApp } from './app.js';

const PASSWORD = 'lathe-gearbox-torque-42';

describe('Cart and checkout (e2e)', () => {
  let ctx: TestApp;
  let books: Model<Book>;
  let bookId: string;
  const http = () => request(ctx.app.getHttpServer());

  beforeAll(async () => {
    ctx = await createTestApp();
    books = ctx.app.get(getModelToken(Book.name));
    const book = await books.create({
      title: 'Principles of Foundry Technology',
      slug: 'principles-of-foundry-technology',
      status: 'published',
      formats: [
        {
          type: 'ebook',
          sku: 'E-1',
          active: true,
          prices: [{ currency: 'USD', amount: 2499 }],
          ebook: { stampWithBuyer: true },
        },
      ],
    });
    bookId = book._id.toString();
  });

  afterAll(async () => {
    await ctx?.close();
  });

  const cartCookie = (res: request.Response) =>
    ([] as string[])
      .concat(res.headers['set-cookie'] ?? [])
      .find((c) => c.startsWith('bs_cart='));

  it('gives a guest an httpOnly cart cookie and prices the cart on the server', async () => {
    const empty = await http().get('/cart?currency=USD').expect(200);
    expect(empty.body).toMatchObject({ lines: [], itemCount: 0 });
    expect(cartCookie(empty)).toBeUndefined();

    const added = await http()
      .post('/cart/items?currency=USD')
      .send({ bookId, format: 'ebook', quantity: 3 })
      .expect(201);
    const cookie = cartCookie(added)!;
    expect(cookie).toMatch(/HttpOnly/i);
    expect(cookie).toMatch(/Path=\/api/);
    expect(cookie).toMatch(/SameSite=Lax/i);
    expect(added.body).toMatchObject({
      itemCount: 1,
      subtotal: 2499,
      lines: [{ quantity: 1, unitAmount: 2499, status: 'ok' }],
    });

    const sessionCookie = cookie.split(';')[0];
    const quote = await http()
      .post('/checkout/quote')
      .set('Cookie', sessionCookie)
      .send({ currency: 'USD' })
      .expect(200);
    expect(quote.body).toMatchObject({ total: 2499, problems: [] });
  });

  it('validates cart input strictly', async () => {
    await http()
      .post('/cart/items')
      .send({ bookId: 'nope', format: 'ebook', quantity: 1 })
      .expect(400);
    await http()
      .post('/cart/items')
      .send({ bookId, format: 'audio', quantity: 1 })
      .expect(400);
    await http()
      .post('/cart/items')
      .send({ bookId, format: 'ebook', quantity: 1, price: 1 })
      .expect(400);
    await http().delete(`/cart/items/${bookId}/audio`).expect(400);
  });

  it('answers 401 to an expired or forged token on cart routes, so the client renews it', async () => {
    await http()
      .get('/cart')
      .set('Authorization', 'Bearer not-a-real-token')
      .expect(401);
  });

  it('places a guest order with an idempotency key and terms, and finds it only with that key', async () => {
    const added = await http()
      .post('/cart/items?currency=USD')
      .send({ bookId, format: 'ebook', quantity: 1 })
      .expect(201);
    const cookie = cartCookie(added)!.split(';')[0];
    const body = {
      currency: 'USD',
      country: 'US',
      email: 'guest@example.com',
      name: 'Chidi Eze',
      acceptTerms: true,
    };

    await http().post('/orders').set('Cookie', cookie).send(body).expect(400);
    // The buyer's country is required (it decides the payment options, BS-22).
    const { country: _country, ...withoutCountry } = body;
    await http()
      .post('/orders')
      .set('Cookie', cookie)
      .set('Idempotency-Key', 'no-country-checkout-key-0123456789')
      .send(withoutCountry)
      .expect(400);
    await http()
      .post('/orders')
      .set('Cookie', cookie)
      .set('Idempotency-Key', 'k'.repeat(30))
      .send({ ...body, acceptTerms: false })
      .expect(400);

    const key = 'checkout-key-0123456789abcdef';
    const placed = await http()
      .post('/orders')
      .set('Cookie', cookie)
      .set('Idempotency-Key', key)
      .send(body)
      .expect(201);
    expect(placed.body).toMatchObject({
      status: 'pending_payment',
      awaitingPayment: true,
      total: 2499,
      orderNumber: expect.stringMatching(/^BS-\d{4}-\d{6}$/),
    });
    expect(JSON.stringify(placed.body)).not.toMatch(/checkoutKey|userId|_id/);

    const retried = await http()
      .post('/orders')
      .set('Cookie', cookie)
      .set('Idempotency-Key', key)
      .send(body)
      .expect(200);
    expect(retried.body.orderNumber).toBe(placed.body.orderNumber);

    await http()
      .post('/guest-orders/lookup')
      .send({ orderNumber: placed.body.orderNumber, checkoutKey: key })
      .expect(200);
    await http()
      .post('/guest-orders/lookup')
      .send({
        orderNumber: placed.body.orderNumber,
        checkoutKey: 'x'.repeat(30),
      })
      .expect(404);
    await http().get(`/orders/${placed.body.orderNumber}`).expect(401);

    const cancelled = await http()
      .post('/guest-orders/cancel')
      .send({ orderNumber: placed.body.orderNumber, checkoutKey: key })
      .expect(200);
    expect(cancelled.body.status).toBe('cancelled');
  });

  it('lists a signed-in customer’s own orders only, and keeps admin commerce behind staff', async () => {
    const reg = await http()
      .post('/auth/register')
      .send({
        name: 'Ada Obi',
        email: 'ada@example.com',
        password: PASSWORD,
        acceptTerms: true,
      })
      .expect(201);
    const auth = { Authorization: `Bearer ${reg.body.accessToken as string}` };
    await http()
      .post('/cart/items?currency=USD')
      .set(auth)
      .send({ bookId, format: 'ebook', quantity: 1 })
      .expect(201);
    const placed = await http()
      .post('/orders')
      .set(auth)
      .set('Idempotency-Key', 'ada-checkout-key-0123456789')
      .send({ currency: 'USD', country: 'GB', acceptTerms: true })
      .expect(201);
    const mine = await http().get('/orders').set(auth).expect(200);
    expect(
      mine.body.map((o: { orderNumber: string }) => o.orderNumber),
    ).toEqual([placed.body.orderNumber]);
    await http()
      .get(`/orders/${placed.body.orderNumber}`)
      .set(auth)
      .expect(200);

    await http().get('/admin/orders').set(auth).expect(403);
    await http().get('/admin/shipping-zones').expect(401);
  });
});
