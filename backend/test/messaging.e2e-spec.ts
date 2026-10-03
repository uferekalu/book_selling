import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { getModelToken } from '@nestjs/mongoose';
import type { Model } from 'mongoose';
import { Secret, TOTP } from 'otpauth';
import { io, type Socket } from 'socket.io-client';
import request from 'supertest';
import { User } from '../src/users/schemas/user.schema.js';
import { createTestApp, type TestApp } from './app.js';

const PASSWORD = 'lathe-gearbox-torque-42';

/** Route rules and live delivery for messaging, notifications and the contact form (BS-10). */
describe('Messaging (e2e)', () => {
  let ctx: TestApp;
  let users: Model<User>;
  let customerToken: string;
  let otherToken: string;
  let staffToken: string;
  let socketUrl: string;
  const sockets: Socket[] = [];
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

  function connect(token?: string): Socket {
    const socket = io(socketUrl, {
      auth: token ? { token } : {},
      transports: ['websocket'],
      reconnection: false,
      forceNew: true,
    });
    sockets.push(socket);
    return socket;
  }

  const once = <T>(socket: Socket, event: string) =>
    new Promise<T>((resolve, reject) => {
      const timer = setTimeout(
        () => reject(new Error(`No "${event}" within 5s`)),
        5000,
      );
      socket.once(event, (payload: T) => {
        clearTimeout(timer);
        resolve(payload);
      });
    });

  beforeAll(async () => {
    ctx = await createTestApp();
    await ctx.app.listen(0);
    const server = ctx.app.getHttpServer() as unknown as Server;
    const { port } = server.address() as AddressInfo;
    socketUrl = `http://127.0.0.1:${port}`;
    users = ctx.app.get(getModelToken(User.name));
    customerToken = await register('reader@example.com');
    otherToken = await register('other@example.com');
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
    for (const socket of sockets) socket.disconnect();
    await ctx?.close();
  });

  it('conversations need a signed-in customer and validate input', async () => {
    await http().get('/conversations').expect(401);
    await http().get('/notifications').expect(401);
    await http()
      .post('/conversations')
      .set(bearer(customerToken))
      .send({ subject: 'Hi', body: '' })
      .expect(400);
    await http()
      .post('/conversations')
      .set(bearer(customerToken))
      .send({ subject: 'Hi', body: 'x', role: 'staff' })
      .expect(400);
    await http()
      .post('/conversations')
      .set(bearer(customerToken))
      .send({ subject: 'Hi', body: 'x'.repeat(5001) })
      .expect(400);
  });

  it('the staff inbox is for two-step-verified staff only', async () => {
    await http()
      .get('/admin/conversations')
      .set(bearer(customerToken))
      .expect(403);
    await http()
      .get('/admin/contact-requests')
      .set(bearer(customerToken))
      .expect(403);
    await http()
      .get('/admin/conversations?filter=bogus')
      .set(bearer(staffToken))
      .expect(400);
    await http()
      .put('/admin/messaging/settings')
      .set(bearer(customerToken))
      .send({ replyTime: 'Instantly' })
      .expect(403);
  });

  it('a message round trip: customer → staff inbox → reply → customer, with unread counts and the bell', async () => {
    const started = await http()
      .post('/conversations')
      .set(bearer(customerToken))
      .send({ subject: 'Errata', body: 'Page 112: typo in the Fe–C diagram.' })
      .expect(201);
    const id = started.body.id as string;

    await http()
      .get(`/conversations/${id}`)
      .set(bearer(otherToken))
      .expect(404);

    const unread = await http()
      .get('/admin/inbox/unread-count')
      .set(bearer(staffToken))
      .expect(200);
    expect(unread.body).toEqual({ conversations: 1, contact: 0 });
    const inbox = await http()
      .get('/admin/conversations?filter=unread')
      .set(bearer(staffToken))
      .expect(200);
    expect(inbox.body.items[0]).toMatchObject({
      id,
      unread: 1,
      customer: { email: 'reader@example.com' },
    });

    await http()
      .post(`/admin/conversations/${id}/read`)
      .set(bearer(staffToken))
      .expect(204);
    await http()
      .post(`/admin/conversations/${id}/messages`)
      .set(bearer(staffToken))
      .send({ body: 'Thank you, fixed in the next edition.' })
      .expect(201);

    const count = await http()
      .get('/conversations/unread-count')
      .set(bearer(customerToken))
      .expect(200);
    expect(count.body).toEqual({ count: 1 });
    const thread = await http()
      .get(`/conversations/${id}`)
      .set(bearer(customerToken))
      .expect(200);
    expect(thread.headers['cache-control']).toBe('no-store');
    expect(thread.body.messages).toEqual([
      expect.objectContaining({
        senderRole: 'customer',
        readAt: expect.any(String),
      }),
      expect.objectContaining({ senderRole: 'staff', readAt: null }),
    ]);
    const bell = await http()
      .get('/notifications')
      .set(bearer(customerToken))
      .expect(200);
    expect(bell.body.unreadCount).toBe(1);
    expect(bell.body.items[0].link).toBe(`/account/messages/${id}`);

    await http()
      .post(`/conversations/${id}/read`)
      .set(bearer(customerToken))
      .expect(204);
    expect(
      (
        await http()
          .get('/notifications')
          .set(bearer(customerToken))
          .expect(200)
      ).body.unreadCount,
    ).toBe(0);
  });

  it('live updates: a socket needs a valid token, and a reply reaches the customer instantly', async () => {
    const anonymous = connect();
    await once(anonymous, 'auth:invalid');
    const forged = connect('not-a-token');
    await once(forged, 'auth:invalid');

    const started = await http()
      .post('/conversations')
      .set(bearer(customerToken))
      .send({ subject: 'Live', body: 'Are you there?' })
      .expect(201);
    const id = started.body.id as string;

    const customer = connect(customerToken);
    const other = connect(otherToken);
    const staff = connect(staffToken);
    await Promise.all([customer, other, staff].map((s) => once(s, 'connect')));
    let otherGotIt = false;
    other.on('message:new', () => (otherGotIt = true));

    const toStaff = once<{ conversationId: string }>(staff, 'message:new');
    await http()
      .post(`/conversations/${id}/messages`)
      .set(bearer(customerToken))
      .send({ body: 'Hello?' })
      .expect(201);
    expect(await toStaff).toEqual({ conversationId: id });

    const toCustomer = once<{ conversationId: string }>(
      customer,
      'message:new',
    );
    await http()
      .post(`/admin/conversations/${id}/messages`)
      .set(bearer(staffToken))
      .send({ body: 'Yes, here.' })
      .expect(201);
    expect(await toCustomer).toEqual({ conversationId: id });

    const seen = once<{ conversationId: string }>(staff, 'message:read');
    await http()
      .post(`/conversations/${id}/read`)
      .set(bearer(customerToken))
      .expect(204);
    expect(await seen).toEqual({ conversationId: id });
    // Another customer's socket never hears about this conversation.
    expect(otherGotIt).toBe(false);
  });

  it('the contact form is public, validated and rate limited', async () => {
    const form = {
      name: 'Visitor',
      email: 'visitor@example.com',
      subject: 'Hello',
      body: 'A question about the books.',
      elapsedMs: 8000,
    };
    await http()
      .post('/contact')
      .send({ ...form, email: 'nope' })
      .expect(400);
    await http()
      .post('/contact')
      .send({ ...form, extra: 1 })
      .expect(400);
    await http()
      .post('/contact')
      .send(form)
      .expect(202, { status: 'received' });
    // A bot filling the hidden field gets the same answer and stores nothing.
    await http()
      .post('/contact')
      .send({ ...form, website: 'spam' })
      .expect(202);
    const list = await http()
      .get('/admin/contact-requests')
      .set(bearer(staffToken))
      .expect(200);
    expect(list.body.total).toBe(1);
    // 5 requests per hour per IP, counting the ones above; the next ones are refused.
    let limited = false;
    for (let i = 0; i < 6 && !limited; i++) {
      const res = await http().post('/contact').send(form);
      limited = res.status === 429;
    }
    expect(limited).toBe(true);
  });

  it('reply-time setting is public to read and owner-only to change', async () => {
    await http()
      .get('/messaging/settings')
      .expect(200, { replyTime: 'Usually replies within a day' });
    await http()
      .put('/admin/messaging/settings')
      .set(bearer(staffToken))
      .send({ replyTime: 'Usually replies within 2 hours' })
      .expect(200);
    await http()
      .get('/messaging/settings')
      .expect(200, { replyTime: 'Usually replies within 2 hours' });
  });
});
