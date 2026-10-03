import { ConfigModule } from '@nestjs/config';
import { MongooseModule, getModelToken } from '@nestjs/mongoose';
import { Test, type TestingModule } from '@nestjs/testing';
import type { MongoMemoryReplSet } from 'mongodb-memory-server';
import { Types, type Connection, type Model } from 'mongoose';
import { getConnectionToken } from '@nestjs/mongoose';
import { startMongo } from '../../test/mongo.js';
import { AuditModule } from '../audit/audit.module.js';
import { MailService } from '../mail/mail.service.js';
import { NotificationsModule } from '../notifications/notifications.module.js';
import { RealtimeModule } from '../realtime/realtime.module.js';
import { RealtimeService } from '../realtime/realtime.service.js';
import { BookFilesService } from '../uploads/book-files.service.js';
import { CloudinaryService } from '../uploads/cloudinary.service.js';
import { User } from '../users/schemas/user.schema.js';
import { ContactService, MAX_ACKS_PER_DAY } from './contact.service.js';
import { MessagingModule } from './messaging.module.js';
import {
  MessagingService,
  REMINDER_DELAY_MS,
  cleanMessageBody,
  previewOf,
} from './messaging.service.js';
import { Conversation } from './schemas/conversation.schema.js';

interface QueuedEmail {
  to: string;
  template: string;
  dedupeKey: string;
  sendAfter?: Date;
  data: Record<string, unknown>;
}

class FakeMail {
  sent: QueuedEmail[] = [];
  cancelled: string[] = [];
  enqueue(email: QueuedEmail) {
    if (!this.sent.some((e) => e.dedupeKey === email.dedupeKey))
      this.sent.push(email);
    return Promise.resolve({});
  }
  cancel(dedupeKey: string) {
    this.cancelled.push(dedupeKey);
    return Promise.resolve(true);
  }
  find(template: string) {
    return this.sent.filter((e) => e.template === template);
  }
}

describe('Messaging (conversations, read receipts, reminders, contact form)', () => {
  let mongod: MongoMemoryReplSet;
  let moduleRef: TestingModule;
  let messaging: MessagingService;
  let contact: ContactService;
  let users: Model<User>;
  let conversations: Model<Conversation>;
  let db: Connection;
  const mail = new FakeMail();
  const pushes: Array<{ to: string; event: string }> = [];
  let customerId: string;
  let otherCustomerId: string;
  let staffId: string;
  const staff = () => ({ id: staffId, role: 'owner' });

  beforeAll(async () => {
    mongod = await startMongo();
    moduleRef = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({
          isGlobal: true,
          ignoreEnvFile: true,
          load: [
            () => ({
              NODE_ENV: 'test',
              FRONTEND_URL: 'https://books.example.com',
              OWNER_ALERT_EMAIL: 'owner@example.com',
            }),
          ],
        }),
        MongooseModule.forRoot(mongod.getUri()),
        AuditModule,
        RealtimeModule,
        NotificationsModule,
        MessagingModule,
      ],
    })
      .overrideProvider(MailService)
      .useValue(mail)
      .overrideProvider(CloudinaryService)
      .useValue({ configured: false, imageUrl: () => null })
      .overrideProvider(BookFilesService)
      .useValue({})
      .compile();
    messaging = moduleRef.get(MessagingService);
    contact = moduleRef.get(ContactService);
    users = moduleRef.get(getModelToken(User.name));
    conversations = moduleRef.get(getModelToken(Conversation.name));
    db = moduleRef.get(getConnectionToken());
    const realtime = moduleRef.get(RealtimeService);
    vi.spyOn(realtime, 'toUser').mockImplementation((to, event) => {
      pushes.push({ to, event });
    });
    vi.spyOn(realtime, 'toStaff').mockImplementation((event) => {
      pushes.push({ to: 'staff', event });
    });
  }, 120_000);

  afterAll(async () => {
    await moduleRef?.close();
    await mongod?.stop();
  });

  const person = (email: string, name: string, role = 'customer') => ({
    email,
    name,
    role,
    accountStatus: 'active',
    emailVerified: true,
    passwordHash: 'x',
  });

  beforeEach(async () => {
    const collections = await db.listCollections();
    await Promise.all(
      collections
        .filter((c) => !c.name.startsWith('system.'))
        .map((c) => db.collection(c.name).deleteMany({})),
    );
    mail.sent = [];
    mail.cancelled = [];
    pushes.length = 0;
    const [customer, other, owner] = await users.insertMany([
      person('ada@example.com', 'Ada Obi'),
      person('chidi@example.com', 'Chidi Eze'),
      person('owner@example.com', 'Dr. Okafor', 'owner'),
    ]);
    customerId = customer._id.toString();
    otherCustomerId = other._id.toString();
    staffId = owner._id.toString();
  });

  const notificationsFor = (userId: string) =>
    db
      .collection('notifications')
      .find({ userId: new Types.ObjectId(userId) })
      .toArray();

  it('cleans message text and makes short previews', () => {
    expect(cleanMessageBody('  Hello\r\n\r\n\r\n\r\n\r\nthere  ')).toBe(
      'Hello\n\n\nthere',
    );
    expect(() => cleanMessageBody('   \n ')).toThrow('Write a message first');
    expect(() => cleanMessageBody('x'.repeat(5001))).toThrow(/up to 5,000/);
    expect(previewOf('a\n  b')).toBe('a b');
    expect(previewOf('y'.repeat(300))).toHaveLength(160);
  });

  it('a new conversation reaches staff: unread count, one delayed email, a bell entry, a push', async () => {
    const before = Date.now();
    const thread = await messaging.start(customerId, {
      subject: 'Do you ship to Ghana?',
      body: 'I would like the print edition delivered to Accra.',
    });
    expect(thread).toMatchObject({
      subject: 'Do you ship to Ghana?',
      status: 'open',
      unread: 0,
      messages: [
        expect.objectContaining({ senderRole: 'customer', readAt: null }),
      ],
    });
    const row = await conversations.findById(thread.id).lean();
    expect(row?.unread).toEqual({ customer: 0, staff: 1 });

    const [reminder] = mail.find('messaging.unread-message');
    expect(reminder.to).toBe('owner@example.com');
    expect(reminder.sendAfter!.getTime()).toBeGreaterThanOrEqual(
      before + REMINDER_DELAY_MS,
    );
    expect(reminder.data.conversationUrl).toBe(
      `https://books.example.com/admin/messages/${thread.id}`,
    );
    expect(row?.reminders.staff).toBe(reminder.dedupeKey);
    expect(await notificationsFor(staffId)).toEqual([
      expect.objectContaining({
        type: 'message',
        link: `/admin/messages/${thread.id}`,
      }),
    ]);
    expect(pushes).toContainEqual({
      to: 'staff',
      event: 'conversation:updated',
    });

    // A second message in the same unread streak only adds to the count: no second email.
    await messaging.send(customerId, thread.id, 'And how long does it take?');
    expect(mail.find('messaging.unread-message')).toHaveLength(1);
    expect((await conversations.findById(thread.id).lean())?.unread.staff).toBe(
      2,
    );
  });

  it('staff reading the thread clears the count, marks messages seen, cancels the email and the bell', async () => {
    const thread = await messaging.start(customerId, {
      subject: 'Errata',
      body: 'Page 112 has a typo in the Fe-C diagram.',
    });
    const key = mail.find('messaging.unread-message')[0].dedupeKey;
    pushes.length = 0;

    await messaging.markReadByStaff(thread.id);

    const row = await conversations.findById(thread.id).lean();
    expect(row?.unread.staff).toBe(0);
    expect(row?.reminders.staff).toBeNull();
    expect(mail.cancelled).toEqual([key]);
    const seen = await messaging.forCustomer(customerId, thread.id);
    expect(seen.messages[0].readAt).toBeInstanceOf(Date);
    expect((await notificationsFor(staffId))[0].readAt).toBeInstanceOf(Date);
    // The customer's open page shows "Seen" without a reload.
    expect(pushes).toContainEqual({ to: customerId, event: 'message:read' });

    // Opening it again with nothing unread does no work.
    pushes.length = 0;
    await messaging.markReadByStaff(thread.id);
    expect(pushes).toEqual([]);
  });

  it('a staff reply reaches the customer the same way, and reopens a closed conversation', async () => {
    const thread = await messaging.start(customerId, {
      subject: 'Bulk order',
      body: 'Can I buy 20 copies?',
    });
    await messaging.setStatus(staff(), thread.id, 'closed');
    expect((await conversations.findById(thread.id).lean())?.status).toBe(
      'closed',
    );

    const reply = await messaging.reply(
      staff(),
      thread.id,
      'Yes, with a 10% discount.',
    );
    expect(reply).toMatchObject({
      senderRole: 'staff',
      senderName: 'Dr. Okafor',
    });
    const row = await conversations.findById(thread.id).lean();
    expect(row).toMatchObject({
      status: 'open',
      unread: { customer: 1, staff: 1 },
      lastMessageBy: 'staff',
    });
    const toCustomer = mail
      .find('messaging.unread-message')
      .find((e) => e.to === 'ada@example.com');
    expect(toCustomer?.data).toMatchObject({
      name: 'Ada',
      from: 'Dr. Okafor',
      conversationUrl: `https://books.example.com/account/messages/${thread.id}`,
    });
    expect(await notificationsFor(customerId)).toEqual([
      expect.objectContaining({ title: 'New reply from Dr. Okafor' }),
    ]);
    expect(await messaging.unreadForCustomer(customerId)).toEqual({
      count: 1,
    });
    expect(pushes).toContainEqual({ to: customerId, event: 'message:new' });

    await messaging.markReadByCustomer(customerId, thread.id);
    expect(await messaging.unreadForCustomer(customerId)).toEqual({
      count: 0,
    });
    expect(mail.cancelled).toContain(toCustomer?.dedupeKey);
  });

  it('a customer never sees, writes in or reads someone else’s conversation', async () => {
    const thread = await messaging.start(customerId, {
      subject: 'Private',
      body: 'My question',
    });
    await expect(
      messaging.forCustomer(otherCustomerId, thread.id),
    ).rejects.toThrow('Conversation not found');
    await expect(
      messaging.send(otherCustomerId, thread.id, 'hijack'),
    ).rejects.toThrow('Conversation not found');
    await expect(
      messaging.markReadByCustomer(otherCustomerId, thread.id),
    ).rejects.toThrow('Conversation not found');
    await expect(messaging.forCustomer(customerId, 'nope')).rejects.toThrow(
      'Conversation not found',
    );
    expect(await messaging.listForCustomer(otherCustomerId)).toEqual([]);
  });

  it('staff answer from the inbox instead of starting customer conversations', async () => {
    await expect(
      messaging.start(staffId, { subject: 'Hi', body: 'Hello' }),
    ).rejects.toThrow('Staff answer customers from the admin inbox');
  });

  it('"Question about this order" checks the order is theirs and keeps one open thread per order', async () => {
    const order = new Types.ObjectId();
    await db.collection('orders').insertOne({
      _id: order,
      orderNumber: 'BS-2026-000042',
      userId: new Types.ObjectId(customerId),
    });
    await expect(
      messaging.start(otherCustomerId, {
        body: 'Where is it?',
        orderNumber: 'BS-2026-000042',
      }),
    ).rejects.toThrow('Order not found');

    const first = await messaging.start(customerId, {
      body: 'Where is my book?',
      orderNumber: 'BS-2026-000042',
    });
    expect(first).toMatchObject({
      subject: 'Question about order BS-2026-000042',
      orderNumber: 'BS-2026-000042',
    });
    const again = await messaging.start(customerId, {
      body: 'Any update?',
      orderNumber: 'BS-2026-000042',
    });
    expect(again.id).toBe(first.id);
    expect(again.messages.map((m) => m.body)).toEqual([
      'Where is my book?',
      'Any update?',
    ]);
    expect(await conversations.countDocuments()).toBe(1);
  });

  it('"Ask the author" only works for a published book', async () => {
    const [published, draft] = [new Types.ObjectId(), new Types.ObjectId()];
    await db.collection('books').insertMany([
      {
        _id: published,
        title: 'Principles of Foundry Technology',
        slug: 'principles-of-foundry-technology',
        status: 'published',
      },
      { _id: draft, title: 'Unreleased', slug: 'unreleased', status: 'draft' },
    ]);
    const thread = await messaging.start(customerId, {
      body: 'Does it cover investment casting?',
      bookId: published.toString(),
    });
    expect(thread).toMatchObject({
      subject: 'About “Principles of Foundry Technology”',
      bookTitle: 'Principles of Foundry Technology',
    });
    await expect(
      messaging.start(customerId, { body: 'Hi', bookId: draft.toString() }),
    ).rejects.toThrow('Book not found');
    await expect(messaging.start(customerId, { body: 'Hi' })).rejects.toThrow(
      'Add a subject',
    );
  });

  it('parallel messages keep the unread counter equal to the unread messages', async () => {
    const thread = await messaging.start(customerId, {
      subject: 'Many',
      body: 'first',
    });
    await Promise.all(
      Array.from({ length: 8 }, (_, i) =>
        messaging.send(customerId, thread.id, `message ${i}`),
      ),
    );
    const row = await conversations.findById(thread.id).lean();
    const unreadMessages = await db
      .collection('messages')
      .countDocuments({ conversationId: row!._id, readAt: null });
    expect(row?.unread.staff).toBe(9);
    expect(unreadMessages).toBe(9);
    expect(mail.find('messaging.unread-message')).toHaveLength(1);
  });

  it('pages older messages with `before`', async () => {
    const thread = await messaging.start(customerId, {
      subject: 'Long',
      body: 'm0',
    });
    for (let i = 1; i <= 55; i++) {
      await messaging.send(customerId, thread.id, `m${i}`);
    }
    const latest = await messaging.forStaff(thread.id);
    expect(latest.messages).toHaveLength(50);
    expect(latest.messages.at(-1)?.body).toBe('m55');
    expect(latest.hasMore).toBe(true);
    const older = await messaging.forStaff(thread.id, latest.messages[0].id);
    expect(older.messages.map((m) => m.body)).toEqual([
      'm0',
      'm1',
      'm2',
      'm3',
      'm4',
      'm5',
    ]);
    expect(older.hasMore).toBe(false);
  });

  it('the inbox filters by open, unread, order-linked and closed', async () => {
    const a = await messaging.start(customerId, { subject: 'A', body: 'a' });
    const b = await messaging.start(otherCustomerId, {
      subject: 'B',
      body: 'b',
    });
    await messaging.markReadByStaff(b.id);
    await messaging.setStatus(staff(), b.id, 'closed');
    const ids = async (filter: Parameters<MessagingService['inbox']>[0]) =>
      (await messaging.inbox(filter, 1)).items.map((i) => i.id);
    expect(await ids('open')).toEqual([a.id]);
    expect(await ids('unread')).toEqual([a.id]);
    expect(await ids('closed')).toEqual([b.id]);
    expect(await ids('order')).toEqual([]);
    expect((await ids('all')).sort()).toEqual([a.id, b.id].sort());
    const [item] = (await messaging.inbox('open', 1)).items;
    expect(item.customer).toEqual({
      id: customerId,
      name: 'Ada Obi',
      email: 'ada@example.com',
    });
    expect(await messaging.unreadForStaff()).toEqual({ conversations: 1 });
  });

  it('the owner sets the reply time customers see', async () => {
    expect(await messaging.getSettings()).toEqual({
      replyTime: 'Usually replies within a day',
    });
    await messaging.updateSettings(staff(), 'Usually replies within 2 hours');
    expect(await messaging.getSettings()).toEqual({
      replyTime: 'Usually replies within 2 hours',
    });
  });

  describe('contact form', () => {
    const form = {
      name: 'Chidi Eze',
      email: 'Visitor@Example.com',
      subject: 'Department order',
      body: 'We need 30 copies.',
      elapsedMs: 9000,
    };

    it('stores the message, acknowledges it, alerts the owner and the bell', async () => {
      await contact.submit(form, '203.0.113.9');
      const [row] = await db.collection('contact_requests').find().toArray();
      expect(row).toMatchObject({
        email: 'visitor@example.com',
        status: 'new',
      });
      expect(row.ipHash).toMatch(/^[0-9a-f]{64}$/);
      expect(mail.find('messaging.contact-received')[0].to).toBe(
        'visitor@example.com',
      );
      expect(mail.find('messaging.contact-new')[0].to).toBe(
        'owner@example.com',
      );
      expect(await notificationsFor(staffId)).toEqual([
        expect.objectContaining({ type: 'contact' }),
      ]);
      expect(await contact.countNew()).toBe(1);
    });

    it('quietly drops bots: the honeypot and too-fast submissions store nothing', async () => {
      await contact.submit({ ...form, website: 'http://spam.example' }, 'ip');
      await contact.submit({ ...form, elapsedMs: 400 }, 'ip');
      expect(await db.collection('contact_requests').countDocuments()).toBe(0);
      expect(mail.sent).toEqual([]);
    });

    it('acknowledges an address at most a few times a day (no mail-bombing through the form)', async () => {
      for (let i = 0; i < MAX_ACKS_PER_DAY + 2; i++) {
        await contact.submit(form, 'ip');
      }
      expect(mail.find('messaging.contact-received')).toHaveLength(
        MAX_ACKS_PER_DAY,
      );
      expect(mail.find('messaging.contact-new')).toHaveLength(
        MAX_ACKS_PER_DAY + 2,
      );
    });

    it('staff replies go out by email, are kept with the request, and mark it replied', async () => {
      await contact.submit(form, 'ip');
      const { items } = await contact.list('new', 1);
      const replied = await contact.reply(
        staff(),
        items[0].id,
        'Yes: ₦18,000 each.',
      );
      expect(replied).toMatchObject({
        status: 'replied',
        replies: [
          expect.objectContaining({
            staffName: 'Dr. Okafor',
            body: 'Yes: ₦18,000 each.',
          }),
        ],
      });
      const [email] = mail.find('messaging.contact-reply');
      expect(email).toMatchObject({
        to: 'visitor@example.com',
        data: expect.objectContaining({ reply: 'Yes: ₦18,000 each.' }),
      });
      await contact.reply(staff(), items[0].id, 'And delivery is free.');
      expect(mail.find('messaging.contact-reply')).toHaveLength(2);
      expect((await notificationsFor(staffId))[0].readAt).toBeInstanceOf(Date);
      await contact.setStatus(staff(), items[0].id, 'closed');
      expect((await contact.list('closed', 1)).total).toBe(1);
    });
  });
});
