import { getModelToken } from '@nestjs/mongoose';
import type { Model } from 'mongoose';
import request from 'supertest';
import { Webhook } from 'svix';
import { EmailOutbox } from '../src/mail/schemas/email-outbox.schema.js';
import { EmailSuppression } from '../src/mail/schemas/email-suppression.schema.js';
import { createTestApp, type TestApp } from './app.js';
import { TEST_RESEND_WEBHOOK_SECRET } from './test-env.js';

const signer = new Webhook(TEST_RESEND_WEBHOOK_SECRET);

function signed(
  event: object,
  id = `msg_${Math.random().toString(36).slice(2)}`,
) {
  const payload = JSON.stringify(event);
  const timestamp = new Date();
  return {
    payload,
    headers: {
      'svix-id': id,
      'svix-timestamp': Math.floor(timestamp.getTime() / 1000).toString(),
      'svix-signature': signer.sign(id, timestamp, payload),
      'content-type': 'application/json',
    },
  };
}

const event = (type: string, extra: object = {}) => ({
  type,
  created_at: new Date().toISOString(),
  data: {
    email_id: 'resend-msg-1',
    to: ['Ada@Example.com'],
    from: 'books@mail.example.com',
    subject: 'Confirm your email',
    created_at: new Date().toISOString(),
    message_id: '<x@resend>',
    ...extra,
  },
});

describe('Resend webhooks (e2e)', () => {
  let ctx: TestApp;
  let outbox: Model<EmailOutbox>;
  let suppressions: Model<EmailSuppression>;

  beforeAll(async () => {
    ctx = await createTestApp();
    outbox = ctx.app.get(getModelToken(EmailOutbox.name));
    suppressions = ctx.app.get(getModelToken(EmailSuppression.name));
  });

  afterAll(async () => {
    await ctx?.close();
  });

  beforeEach(async () => {
    await outbox.deleteMany({});
    await suppressions.deleteMany({});
    await outbox.create({
      to: 'ada@example.com',
      template: 'auth.verify-email',
      data: null,
      category: 'critical',
      dedupeKey: 'verify:1',
      status: 'sent',
      nextAttemptAt: new Date(),
      providerMessageId: 'resend-msg-1',
    });
  });

  const post = (body: string, headers: Record<string, string>) =>
    request(ctx.app.getHttpServer())
      .post('/mail/webhooks/resend')
      .set(headers)
      .send(body);

  it('rejects a request with no signature', async () => {
    const { payload } = signed(event('email.delivered'));
    await post(payload, { 'content-type': 'application/json' }).expect(401);
    expect(
      (await outbox.findOne({ dedupeKey: 'verify:1' }).lean())?.deliveryStatus,
    ).toBeNull();
  });

  it('rejects a forged signature', async () => {
    const { payload, headers } = signed(event('email.delivered'));
    await post(payload, {
      ...headers,
      'svix-signature': 'v1,Zm9yZ2VkLXNpZ25hdHVyZQ==',
    }).expect(401);
  });

  it('rejects a body altered after signing', async () => {
    const { headers } = signed(event('email.delivered'));
    await post(JSON.stringify(event('email.complained')), headers).expect(401);
    expect(await suppressions.countDocuments()).toBe(0);
  });

  it('records a verified delivery', async () => {
    const { payload, headers } = signed(event('email.delivered'));
    await post(payload, headers).expect(200, { received: true });
    const row = await outbox.findOne({ dedupeKey: 'verify:1' }).lean();
    expect(row?.deliveryStatus).toBe('delivered');
  });

  it('suppresses an address after a permanent bounce, idempotently', async () => {
    const bounce = event('email.bounced', {
      bounce: {
        type: 'Permanent',
        subType: 'General',
        message: 'mailbox does not exist',
      },
    });
    const first = signed(bounce, 'evt_bounce');
    await post(first.payload, first.headers).expect(200);
    const again = signed(bounce, 'evt_bounce_retry');
    await post(again.payload, again.headers).expect(200);

    expect(
      await suppressions.find({ email: 'ada@example.com' }).countDocuments(),
    ).toBe(1);
    expect(
      (await outbox.findOne({ dedupeKey: 'verify:1' }).lean())?.deliveryStatus,
    ).toBe('bounced');
  });

  it('does not suppress on a temporary bounce', async () => {
    const { payload, headers } = signed(
      event('email.bounced', {
        bounce: { type: 'Transient', subType: 'MailboxFull', message: 'full' },
      }),
    );
    await post(payload, headers).expect(200);
    expect(await suppressions.countDocuments()).toBe(0);
  });

  it('suppresses after a spam complaint', async () => {
    const { payload, headers } = signed(event('email.complained'));
    await post(payload, headers).expect(200);
    expect(
      await suppressions.findOne({ email: 'ada@example.com' }).lean(),
    ).toMatchObject({ reason: 'complaint' });
  });

  it('acknowledges event types it does not act on', async () => {
    const { payload, headers } = signed(event('email.opened'));
    await post(payload, headers).expect(200);
  });
});
