import { ConfigModule } from '@nestjs/config';
import {
  MongooseModule,
  getConnectionToken,
  getModelToken,
} from '@nestjs/mongoose';
import { Test, type TestingModule } from '@nestjs/testing';
import type { MongoMemoryReplSet } from 'mongodb-memory-server';
import type { Connection, Model } from 'mongoose';
import { startMongo } from '../../test/mongo.js';
import { JobsModule } from '../jobs/jobs.module.js';
import { AttachmentRegistry } from './attachments.js';
import { MailService } from './mail.service.js';
import { OutboxWorker } from './outbox-worker.service.js';
import { MAX_ATTEMPTS, SEND_LEASE_MS } from './retry-policy.js';
import {
  EmailOutbox,
  EmailOutboxSchema,
} from './schemas/email-outbox.schema.js';
import {
  EmailSuppression,
  EmailSuppressionSchema,
} from './schemas/email-suppression.schema.js';
import { TemplateRendererService } from './template-renderer.service.js';
import { EMAIL_TEMPLATES } from './templates/registry.js';
import {
  EMAIL_TRANSPORT,
  EmailSendError,
  type OutgoingEmail,
} from './transports/email-transport.js';

class FakeTransport {
  sent: OutgoingEmail[] = [];
  failures: EmailSendError[] = [];
  send(email: OutgoingEmail) {
    const failure = this.failures.shift();
    if (failure) return Promise.reject(failure);
    this.sent.push(email);
    return Promise.resolve({ providerMessageId: `msg_${this.sent.length}` });
  }
}

const verifySample = EMAIL_TEMPLATES['auth.verify-email'].sample;
const welcomeSample = EMAIL_TEMPLATES['auth.welcome'].sample;
const minutes = (n: number) => n * 60_000;

describe('Email outbox (MailService + OutboxWorker)', () => {
  let mongod: MongoMemoryReplSet;
  let moduleRef: TestingModule;
  let mail: MailService;
  let worker: OutboxWorker;
  let outbox: Model<EmailOutbox>;
  let suppressions: Model<EmailSuppression>;
  let connection: Connection;
  let transport: FakeTransport;
  let attachments: AttachmentRegistry;
  let invoiceFailures = 0;

  beforeAll(async () => {
    mongod = await startMongo();
    transport = new FakeTransport();
    moduleRef = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({
          ignoreEnvFile: true,
          load: [
            () => ({
              NODE_ENV: 'test',
              FRONTEND_URL: 'https://books.example.com',
              BRAND_NAME: 'Engineering Books',
              MAIL_FROM: 'Engineering Books <books@mail.example.com>',
              OWNER_ALERT_EMAIL: 'owner@example.com',
            }),
          ],
        }),
        MongooseModule.forRoot(mongod.getUri()),
        MongooseModule.forFeature([
          { name: EmailOutbox.name, schema: EmailOutboxSchema },
          { name: EmailSuppression.name, schema: EmailSuppressionSchema },
        ]),
        JobsModule,
      ],
      providers: [
        MailService,
        AttachmentRegistry,
        OutboxWorker,
        TemplateRendererService,
        { provide: EMAIL_TRANSPORT, useValue: transport },
      ],
    }).compile();
    mail = moduleRef.get(MailService);
    worker = moduleRef.get(OutboxWorker);
    attachments = moduleRef.get(AttachmentRegistry);
    attachments.register('invoice', (ref) => {
      if (invoiceFailures > 0) {
        invoiceFailures -= 1;
        return Promise.reject(new Error('order not found'));
      }
      return Promise.resolve({
        filename: `invoice-${ref}.pdf`,
        content: Buffer.from('%PDF-1.7 fake'),
        contentType: 'application/pdf',
      });
    });
    outbox = moduleRef.get(getModelToken(EmailOutbox.name));
    suppressions = moduleRef.get(getModelToken(EmailSuppression.name));
    connection = moduleRef.get(getConnectionToken());
    await outbox.syncIndexes();
    await suppressions.syncIndexes();
  }, 90_000);

  afterAll(async () => {
    await moduleRef?.close();
    await mongod?.stop();
  });

  beforeEach(async () => {
    await outbox.deleteMany({});
    await suppressions.deleteMany({});
    transport.sent = [];
    transport.failures = [];
    invoiceFailures = 0;
  });

  const load = async (dedupeKey: string) =>
    (await outbox.findOne({ dedupeKey }).lean().exec())!;

  describe('enqueue', () => {
    it('stores a queued, normalised row with the template category', async () => {
      await mail.enqueue({
        to: '  Ada@Example.COM ',
        template: 'auth.verify-email',
        data: verifySample,
        dedupeKey: 'k1',
      });
      const row = await load('k1');
      expect(row).toMatchObject({
        to: 'ada@example.com',
        status: 'queued',
        attempts: 0,
        category: 'critical',
      });
    });

    it('is idempotent on dedupeKey: the same event never produces two emails', async () => {
      const first = await mail.enqueue({
        to: 'ada@example.com',
        template: 'auth.welcome',
        data: welcomeSample,
        dedupeKey: 'k1',
      });
      const second = await mail.enqueue({
        to: 'other@example.com',
        template: 'auth.welcome',
        data: welcomeSample,
        dedupeKey: 'k1',
      });
      expect(second._id.toString()).toBe(first._id.toString());
      expect(await outbox.countDocuments()).toBe(1);
      expect((await load('k1')).to).toBe('ada@example.com');
    });

    it('is safe under concurrent enqueues of the same event', async () => {
      await Promise.all(
        Array.from({ length: 5 }, () =>
          mail
            .enqueue({
              to: 'ada@example.com',
              template: 'auth.welcome',
              data: welcomeSample,
              dedupeKey: 'race',
            })
            // Parallel upserts may lose a race with E11000 outside a transaction; the row still exists once.
            .catch(() => null),
        ),
      );
      expect(await outbox.countDocuments({ dedupeKey: 'race' })).toBe(1);
    });

    it('rolls back with the caller transaction', async () => {
      const session = await connection.startSession();
      await expect(
        session.withTransaction(async () => {
          await mail.enqueue(
            {
              to: 'ada@example.com',
              template: 'auth.welcome',
              data: welcomeSample,
              dedupeKey: 'tx',
            },
            session,
          );
          throw new Error('order update failed');
        }),
      ).rejects.toThrow('order update failed');
      await session.endSession();
      expect(await outbox.countDocuments({ dedupeKey: 'tx' })).toBe(0);
    });

    it('rejects an invalid recipient', async () => {
      await expect(
        mail.enqueue({
          to: 'not-an-email',
          template: 'auth.welcome',
          data: welcomeSample,
          dedupeKey: 'bad',
        }),
      ).rejects.toThrow(/Invalid recipient/);
    });
  });

  describe('delivery', () => {
    it('sends with the outbox id as idempotency key and erases one-time links afterwards', async () => {
      const row = await mail.enqueue({
        to: 'ada@example.com',
        template: 'auth.verify-email',
        data: verifySample,
        dedupeKey: 'k1',
      });
      expect(await worker.processDue()).toBe(1);

      expect(transport.sent).toHaveLength(1);
      const email = transport.sent[0];
      expect(email.idempotencyKey).toBe(`outbox-${row._id.toString()}`);
      expect(email.from).toBe('Engineering Books <books@mail.example.com>');
      expect(email.subject).toBe('Confirm your email for Engineering Books');
      expect(email.text).toContain(verifySample.verifyUrl);

      const stored = await load('k1');
      expect(stored).toMatchObject({
        status: 'sent',
        providerMessageId: 'msg_1',
        data: null,
        attempts: 1,
      });
      expect(stored.expireAt).toBeInstanceOf(Date);
    });

    it('keeps data for non-sensitive templates', async () => {
      await mail.enqueue({
        to: 'ada@example.com',
        template: 'auth.welcome',
        data: welcomeSample,
        dedupeKey: 'k1',
      });
      await worker.processDue();
      expect((await load('k1')).data).toEqual(welcomeSample);
    });

    it('never sends the same row twice', async () => {
      await mail.enqueue({
        to: 'ada@example.com',
        template: 'auth.welcome',
        data: welcomeSample,
        dedupeKey: 'k1',
      });
      await worker.processDue();
      await worker.processDue();
      expect(transport.sent).toHaveLength(1);
    });

    it('holds delayed emails until sendAfter', async () => {
      const now = new Date();
      await mail.enqueue({
        to: 'ada@example.com',
        template: 'auth.welcome',
        data: welcomeSample,
        dedupeKey: 'later',
        sendAfter: new Date(now.getTime() + minutes(10)),
      });
      expect(await worker.processDue(now)).toBe(0);
      expect(
        await worker.processDue(new Date(now.getTime() + minutes(11))),
      ).toBe(1);
    });

    it('does not send a cancelled email', async () => {
      await mail.enqueue({
        to: 'ada@example.com',
        template: 'auth.welcome',
        data: welcomeSample,
        dedupeKey: 'k1',
      });
      expect(await mail.cancel('k1')).toBe(true);
      await worker.processDue();
      expect(transport.sent).toHaveLength(0);
      expect((await load('k1')).status).toBe('cancelled');
    });
  });

  describe('failures', () => {
    it('backs off and retries a retryable failure, then succeeds', async () => {
      transport.failures.push(
        new EmailSendError('Resend rate_limit_exceeded', true),
      );
      await mail.enqueue({
        to: 'ada@example.com',
        template: 'auth.welcome',
        data: welcomeSample,
        dedupeKey: 'k1',
      });
      const now = new Date();

      await worker.processDue(now);
      let row = await load('k1');
      expect(row.status).toBe('failed');
      expect(row.lastError).toContain('rate_limit_exceeded');
      expect(row.nextAttemptAt.getTime()).toBeGreaterThanOrEqual(
        now.getTime() + 30_000,
      );

      expect(await worker.processDue(now)).toBe(0); // not due yet
      await worker.processDue(new Date(now.getTime() + minutes(1)));
      row = await load('k1');
      expect(row).toMatchObject({ status: 'sent', attempts: 2 });
    });

    it('gives up at once on a permanent error and alerts the owner', async () => {
      transport.failures.push(
        new EmailSendError('Resend validation_error: bad address', false),
      );
      await mail.enqueue({
        to: 'ada@example.com',
        template: 'auth.welcome',
        data: welcomeSample,
        dedupeKey: 'k1',
      });
      await worker.processDue();

      const row = await load('k1');
      expect(row.status).toBe('dead');
      const alert = await outbox
        .findOne({ template: 'ops.email-dead-letter' })
        .lean()
        .exec();
      expect(alert).toMatchObject({
        to: 'owner@example.com',
        dedupeKey: `email-dead-letter:${row._id.toString()}`,
      });
    });

    it('gives up after the maximum number of attempts', async () => {
      for (let i = 0; i < MAX_ATTEMPTS; i += 1) {
        transport.failures.push(
          new EmailSendError('Resend internal_server_error', true),
        );
      }
      await mail.enqueue({
        to: 'ada@example.com',
        template: 'auth.welcome',
        data: welcomeSample,
        dedupeKey: 'k1',
      });
      let now = new Date();
      for (let i = 0; i < MAX_ATTEMPTS; i += 1) {
        await worker.processDue(now);
        // Past the longest possible delay: 6h cap + 20% jitter.
        now = new Date(now.getTime() + 8 * 60 * minutes(1));
      }
      const row = await load('k1');
      expect(row).toMatchObject({ status: 'dead', attempts: MAX_ATTEMPTS });
    });

    it('does not alert about a failed alert (no loops)', async () => {
      transport.failures.push(new EmailSendError('bad', false));
      await mail.enqueue({
        to: 'owner@example.com',
        template: 'ops.email-dead-letter',
        data: EMAIL_TEMPLATES['ops.email-dead-letter'].sample,
        dedupeKey: 'alert',
      });
      await worker.processDue();
      expect(await outbox.countDocuments()).toBe(1);
    });

    it('marks a render failure dead instead of retrying forever', async () => {
      await outbox.create({
        to: 'ada@example.com',
        template: 'auth.welcome',
        data: null,
        category: 'notification',
        dedupeKey: 'broken',
        nextAttemptAt: new Date(),
      });
      await worker.processDue();
      expect(await load('broken')).toMatchObject({ status: 'dead' });
      expect(transport.sent).toHaveLength(0);
    });

    it('reclaims a row stuck in sending after a crash and delivers it', async () => {
      const now = new Date();
      await outbox.create({
        to: 'ada@example.com',
        template: 'auth.welcome',
        data: { ...welcomeSample } as Record<string, unknown>,
        category: 'notification',
        dedupeKey: 'stuck',
        status: 'sending',
        attempts: 1,
        nextAttemptAt: new Date(now.getTime() - minutes(5)),
        lockedUntil: new Date(now.getTime() - SEND_LEASE_MS),
      });
      await worker.processDue(now);
      expect(await load('stuck')).toMatchObject({
        status: 'sent',
        attempts: 2,
      });
    });

    it('requeues a dead email for another try', async () => {
      transport.failures.push(new EmailSendError('bad', false));
      const row = await mail.enqueue({
        to: 'ada@example.com',
        template: 'auth.welcome',
        data: welcomeSample,
        dedupeKey: 'k1',
      });
      await worker.processDue();
      expect(await mail.requeue(row._id.toString())).toBe(true);
      await worker.processDue();
      expect(await load('k1')).toMatchObject({ status: 'sent', resends: 1 });
      // A deliberate resend uses a fresh provider key: Resend remembers a key for 24 hours and
      // would otherwise answer with the first attempt's failure (BS-30).
      const keys = transport.sent.map((e) => e.idempotencyKey);
      expect(keys.at(-1)).toBe(`outbox-${row._id.toString()}-r1`);
    });
  });

  describe('suppression', () => {
    beforeEach(async () => {
      await suppressions.create({ email: 'ada@example.com', reason: 'bounce' });
    });

    it('skips notification emails to a suppressed address', async () => {
      await mail.enqueue({
        to: 'ada@example.com',
        template: 'auth.welcome',
        data: welcomeSample,
        dedupeKey: 'k1',
      });
      await worker.processDue();
      expect(transport.sent).toHaveLength(0);
      expect((await load('k1')).status).toBe('suppressed');
    });

    it('still sends critical emails the person asked for', async () => {
      await mail.enqueue({
        to: 'ada@example.com',
        template: 'auth.verify-email',
        data: verifySample,
        dedupeKey: 'k1',
      });
      await worker.processDue();
      expect(transport.sent).toHaveLength(1);
    });
  });

  describe('attachments', () => {
    const receipt = EMAIL_TEMPLATES['order.receipt'].sample;

    it('builds attachments when sending, never storing the file in the outbox', async () => {
      await mail.enqueue({
        to: 'ada@example.com',
        template: 'order.receipt',
        data: receipt,
        dedupeKey: 'receipt:1',
        attachments: [{ kind: 'invoice', ref: 'order-1' }],
      });
      expect((await load('receipt:1')).attachments).toEqual([
        { kind: 'invoice', ref: 'order-1' },
      ]);
      await worker.processDue();
      expect(transport.sent[0].attachments).toEqual([
        {
          filename: 'invoice-order-1.pdf',
          content: Buffer.from('%PDF-1.7 fake'),
          contentType: 'application/pdf',
        },
      ]);
    });

    it('retries a failed attachment, then sends the email without it rather than not at all', async () => {
      invoiceFailures = 10;
      await mail.enqueue({
        to: 'ada@example.com',
        template: 'order.receipt',
        data: receipt,
        dedupeKey: 'receipt:2',
        attachments: [{ kind: 'invoice', ref: 'order-2' }],
      });
      let now = new Date();
      for (let i = 0; i < 3; i += 1) {
        await worker.processDue(now);
        now = new Date(now.getTime() + minutes(60));
      }
      expect(transport.sent).toHaveLength(1);
      expect(transport.sent[0].attachments).toBeUndefined();
      expect((await load('receipt:2')).status).toBe('sent');
    });
  });
});
