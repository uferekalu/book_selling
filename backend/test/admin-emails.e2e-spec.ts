import { getModelToken } from '@nestjs/mongoose';
import type { Model } from 'mongoose';
import { Secret, TOTP } from 'otpauth';
import request from 'supertest';
import { Webhook } from 'svix';
import { EmailOutbox } from '../src/mail/schemas/email-outbox.schema.js';
import { EmailSuppression } from '../src/mail/schemas/email-suppression.schema.js';
import { User } from '../src/users/schemas/user.schema.js';
import { createTestApp, type TestApp } from './app.js';
import { TEST_RESEND_WEBHOOK_SECRET } from './test-env.js';

const PASSWORD = 'lathe-gearbox-torque-42';
const OWNER_ALERTS = 'alerts@books.example.com';
const signer = new Webhook(TEST_RESEND_WEBHOOK_SECRET);

function signed(event: object) {
  const id = `msg_${Math.random().toString(36).slice(2)}`;
  const payload = JSON.stringify(event);
  const at = new Date();
  return {
    payload,
    headers: {
      'svix-id': id,
      'svix-timestamp': Math.floor(at.getTime() / 1000).toString(),
      'svix-signature': signer.sign(id, at, payload),
      'content-type': 'application/json',
    },
  };
}

/** Undelivered emails: the owner is told about bounced buyer emails and can act on them (BS-30). */
describe('Admin emails and bounce alerts (e2e)', () => {
  let ctx: TestApp;
  let outbox: Model<EmailOutbox>;
  let suppressions: Model<EmailSuppression>;
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

  const bounce = (messageId: string, type = 'email.bounced') =>
    signed({
      type,
      created_at: new Date().toISOString(),
      data: {
        email_id: messageId,
        to: ['ada@exmaple.com'],
        bounce: { type: 'Permanent', message: 'Mailbox does not exist' },
      },
    });

  beforeAll(async () => {
    process.env.OWNER_ALERT_EMAIL = OWNER_ALERTS;
    ctx = await createTestApp();
    outbox = ctx.app.get(getModelToken(EmailOutbox.name));
    suppressions = ctx.app.get(getModelToken(EmailSuppression.name));
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
  }, 120_000);

  afterAll(async () => {
    delete process.env.OWNER_ALERT_EMAIL;
    await ctx?.close();
  });

  beforeEach(async () => {
    await outbox.deleteMany({});
    await suppressions.deleteMany({});
  });

  const receipt = (over: Partial<EmailOutbox> = {}) =>
    outbox.create({
      to: 'ada@exmaple.com',
      template: 'order.receipt',
      data: { orderNumber: 'BS-2026-000042', name: 'Ada' },
      category: 'critical',
      dedupeKey: `receipt:${Math.random()}`,
      status: 'sent',
      nextAttemptAt: new Date(),
      providerMessageId: 'resend-receipt-1',
      ...over,
    });

  it('a bounced receipt alerts the owner once, pauses the address, and shows on the Emails page', async () => {
    await receipt();
    for (let i = 0; i < 2; i++) {
      const { payload, headers } = bounce('resend-receipt-1');
      await http()
        .post('/mail/webhooks/resend')
        .set(headers)
        .send(payload)
        .expect(200);
    }
    const alerts = await outbox.find({ template: 'ops.email-bounced' }).lean();
    expect(alerts).toHaveLength(1);
    expect(alerts[0]).toMatchObject({
      to: OWNER_ALERTS,
      data: expect.objectContaining({
        recipient: 'ada@exmaple.com',
        email: 'Payment receipt',
        orderNumber: 'BS-2026-000042',
        reason: 'Mailbox does not exist',
      }),
    });
    expect(
      await suppressions.countDocuments({ email: 'ada@exmaple.com' }),
    ).toBe(1);

    const page = await http()
      .get('/admin/emails/problems')
      .set(bearer(staffToken))
      .expect(200);
    expect(page.body.items).toEqual([
      expect.objectContaining({
        to: 'ada@exmaple.com',
        label: 'Payment receipt',
        problem: 'bounced',
        orderNumber: 'BS-2026-000042',
        canResend: false,
        addressPaused: true,
      }),
    ]);
    // Sending it again to the same refused address is explained, not attempted.
    await http()
      .post(`/admin/emails/${page.body.items[0].id}/resend`)
      .set(bearer(staffToken))
      .expect(409);
    // The customer fixed their mailbox: allow the address again.
    await http()
      .post('/admin/emails/allow-address')
      .set(bearer(staffToken))
      .send({ email: 'Ada@Exmaple.com' })
      .expect(200, { email: 'ada@exmaple.com', paused: false });
    await http()
      .post('/admin/emails/allow-address')
      .set(bearer(staffToken))
      .send({ email: 'ada@exmaple.com' })
      .expect(404);
  });

  it('never alerts about emails that are not for buyers, or about the owner’s own alerts', async () => {
    await outbox.create({
      to: 'ada@exmaple.com',
      template: 'auth.verify-email',
      data: null,
      category: 'critical',
      dedupeKey: 'verify:1',
      status: 'sent',
      nextAttemptAt: new Date(),
      providerMessageId: 'resend-verify-1',
    });
    await receipt({ to: OWNER_ALERTS, providerMessageId: 'resend-own-1' });
    for (const id of ['resend-verify-1', 'resend-own-1']) {
      const { payload, headers } = bounce(id);
      await http()
        .post('/mail/webhooks/resend')
        .set(headers)
        .send(payload)
        .expect(200);
    }
    expect(await outbox.countDocuments({ template: 'ops.email-bounced' })).toBe(
      0,
    );
  });

  it('an email that was never sent can be sent again, with a fresh key, and marked as handled', async () => {
    const dead = await receipt({
      status: 'dead',
      providerMessageId: null,
      attempts: 8,
      lastError: 'Resend rate_limit_exceeded',
    });
    const id = dead._id.toString();
    await http()
      .get('/admin/emails/problems/count')
      .set(bearer(staffToken))
      .expect(200, { open: 1 });

    const resent = await http()
      .post(`/admin/emails/${id}/resend`)
      .set(bearer(staffToken))
      .expect(200);
    expect(resent.body).toMatchObject({ status: 'queued' });
    expect(await outbox.findById(id).lean()).toMatchObject({
      status: 'queued',
      attempts: 0,
      resends: 1,
      lastError: null,
    });

    await outbox.updateOne({ _id: dead._id }, { status: 'dead' });
    await http()
      .post(`/admin/emails/${id}/reviewed`)
      .set(bearer(staffToken))
      .expect(200);
    await http()
      .get('/admin/emails/problems/count')
      .set(bearer(staffToken))
      .expect(200, { open: 0 });
    const all = await http()
      .get('/admin/emails/problems?show=all')
      .set(bearer(staffToken))
      .expect(200);
    expect(all.body.items[0].reviewedAt).toEqual(expect.any(String));
  });

  it('is for two-step verified staff only, and validates input', async () => {
    await http().get('/admin/emails/problems').expect(401);
    await http()
      .get('/admin/emails/problems')
      .set(bearer(customerToken))
      .expect(403);
    await http()
      .post('/admin/emails/allow-address')
      .set(bearer(customerToken))
      .send({ email: 'a@b.co' })
      .expect(403);
    await http()
      .get('/admin/emails/problems?show=bogus')
      .set(bearer(staffToken))
      .expect(400);
    await http()
      .post('/admin/emails/nope/resend')
      .set(bearer(staffToken))
      .expect(404);
    await http()
      .post('/admin/emails/allow-address')
      .set(bearer(staffToken))
      .send({ email: 'not-an-email' })
      .expect(400);
  });
});
