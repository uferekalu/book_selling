import { getModelToken } from '@nestjs/mongoose';
import type { Model } from 'mongoose';
import { Secret, TOTP } from 'otpauth';
import request from 'supertest';
import { User } from '../src/users/schemas/user.schema.js';
import { createTestApp, type TestApp } from './app.js';

const PASSWORD = 'lathe-gearbox-torque-42';

/** Route-level rules for the library and fulfilment endpoints (BS-9). */
describe('Library and fulfilment (e2e)', () => {
  let ctx: TestApp;
  let users: Model<User>;
  let customerToken: string;
  let staffToken: string;
  const http = () => request(ctx.app.getHttpServer());
  const customer = () => ({ Authorization: `Bearer ${customerToken}` });
  const staff = () => ({ Authorization: `Bearer ${staffToken}` });

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

  beforeAll(async () => {
    ctx = await createTestApp();
    users = ctx.app.get(getModelToken(User.name));
    customerToken = await register('reader@example.com');
    await register('owner@example.com');
    await users.updateOne({ email: 'owner@example.com' }, { role: 'owner' });
    const login = await http()
      .post('/auth/login')
      .send({ email: 'owner@example.com', password: PASSWORD })
      .expect(200);
    const auth = { Authorization: `Bearer ${login.body.accessToken}` };
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
  });

  afterAll(async () => {
    await ctx?.close();
  });

  it('the library needs a signed-in customer and only ever shows their own books', async () => {
    await http().get('/library').expect(401);
    await http().get('/library').set(customer()).expect(200, []);
    await http().get('/library/owned').set(customer()).expect(200, []);
    const res = await http().get('/library').set(customer()).expect(200);
    expect(res.headers['cache-control']).toBe('no-store');
    const someone = '64b0000000000000000000ff';
    await http().post(`/library/${someone}/read`).set(customer()).expect(404);
    await http()
      .post(`/library/${someone}/download`)
      .set(customer())
      .expect(404);
    await http().get(`/library/not-an-id`).set(customer()).expect(404);
  });

  it('validates reading progress', async () => {
    const book = '64b0000000000000000000ff';
    await http()
      .put(`/library/${book}/progress`)
      .set(customer())
      .send({ page: 0 })
      .expect(400);
    await http()
      .put(`/library/${book}/progress`)
      .set(customer())
      .send({ page: 'ten' })
      .expect(400);
    await http()
      .put(`/library/${book}/progress`)
      .set(customer())
      .send({ page: 3 })
      .expect(404);
  });

  it('invoices: only for the order’s owner (or a guest with the checkout key)', async () => {
    await http().get('/orders/BS-2026-000001/invoice').expect(401);
    await http()
      .get('/orders/BS-2026-000001/invoice')
      .set(customer())
      .expect(404);
    await http()
      .post('/guest-orders/invoice')
      .send({ orderNumber: 'BS-2026-000001', checkoutKey: 'x'.repeat(30) })
      .expect(404);
    await http()
      .post('/guest-orders/invoice')
      .send({ orderNumber: 'nonsense', checkoutKey: 'short' })
      .expect(400);
  });

  it('shipping updates are for staff with two-step verification, and validated', async () => {
    const url = '/admin/orders/BS-2026-000001/shipment';
    await http().post(url).send({ status: 'processing' }).expect(401);
    await http()
      .post(url)
      .set(customer())
      .send({ status: 'processing' })
      .expect(403);
    await http().post(url).set(staff()).send({ status: 'lost' }).expect(400);
    await http()
      .post(url)
      .set(staff())
      .send({
        status: 'shipped',
        carrier: 'DHL',
        trackingUrl: 'http://insecure.example.com',
      })
      .expect(400);
    await http()
      .post(url)
      .set(staff())
      .send({ status: 'processing' })
      .expect(404);
    await http()
      .get('/admin/orders?shipment=to_ship')
      .set(staff())
      .expect(200, []);
    await http().get('/admin/orders?shipment=lost').set(staff()).expect(400);
  });
});
