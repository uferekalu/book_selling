import { getModelToken } from '@nestjs/mongoose';
import { Types, type Model } from 'mongoose';
import { Secret, TOTP } from 'otpauth';
import request from 'supertest';
import { User } from '../src/users/schemas/user.schema.js';
import { createTestApp, type TestApp } from './app.js';

const PASSWORD = 'lathe-gearbox-torque-42';

/** Verified-buyer reviews, moderation and wishlists (BS-11). */
describe('Reviews and wishlist (e2e)', () => {
  let ctx: TestApp;
  let users: Model<User>;
  let buyerToken: string;
  let secondBuyerToken: string;
  let strangerToken: string;
  let staffToken: string;
  const bookId = new Types.ObjectId();
  const draftId = new Types.ObjectId();
  const http = () => request(ctx.app.getHttpServer());
  const bearer = (token: string) => ({ Authorization: `Bearer ${token}` });
  const db = () => ctx.app.get<Model<User>>(getModelToken(User.name)).db;

  async function register(email: string, name: string): Promise<string> {
    const res = await http()
      .post('/auth/register')
      .send({ name, email, password: PASSWORD, acceptTerms: true })
      .expect(201);
    return res.body.accessToken as string;
  }

  async function paidOrder(email: string, n: number, status = 'paid') {
    const user = await users.findOne({ email }).lean();
    await db()
      .collection('orders')
      .insertOne({
        orderNumber: `BS-2026-00010${n}`,
        userId: user!._id,
        email,
        customerName: user!.name,
        currency: 'NGN',
        items: [
          {
            bookId,
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
        status,
        shipment: { status: 'not_required' },
        payment: {
          provider: 'paystack',
          paymentId: new Types.ObjectId(),
          paidAt: new Date(),
        },
        checkoutKeyHash: `k-${n}`,
        statusHistory: [],
      });
  }

  const book = async () =>
    (await db().collection('books').findOne({ _id: bookId }))!;

  beforeAll(async () => {
    ctx = await createTestApp();
    users = ctx.app.get(getModelToken(User.name));
    await db()
      .collection('books')
      .insertMany([
        {
          _id: bookId,
          title: 'Cast Irons',
          slug: 'cast-irons',
          status: 'published',
          formats: [],
          ratingAvg: 0,
          ratingCount: 0,
        },
        {
          _id: draftId,
          title: 'Draft',
          slug: 'draft',
          status: 'draft',
          formats: [],
        },
      ]);
    buyerToken = await register('ada@example.com', 'Ada Obi');
    secondBuyerToken = await register('chidi@example.com', 'Chidi Eze');
    strangerToken = await register('stranger@example.com', 'Sam Stranger');
    await register('owner@example.com', 'Owner');
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
    await paidOrder('ada@example.com', 1);
    await paidOrder('chidi@example.com', 2);
    // Fully refunded: no longer counts as having bought the book.
    await paidOrder('stranger@example.com', 3, 'refunded');
  }, 120_000);

  afterAll(async () => {
    await ctx?.close();
  });

  const review = (token: string, body: object) =>
    http()
      .put(`/reviews/books/${bookId.toString()}`)
      .set(bearer(token))
      .send(body);

  it('only buyers can review; strangers, refunded buyers and staff are told why', async () => {
    const mine = await http()
      .get(`/reviews/books/${bookId.toString()}/mine`)
      .set(bearer(strangerToken))
      .expect(200);
    expect(mine.body).toEqual({
      canReview: false,
      reason: 'not_bought',
      review: null,
    });
    await review(strangerToken, { rating: 5 }).expect(403);
    await review(staffToken, { rating: 5 }).expect(403);
    await http()
      .put(`/reviews/books/${bookId.toString()}`)
      .send({ rating: 5 })
      .expect(401);
    const buyer = await http()
      .get(`/reviews/books/${bookId.toString()}/mine`)
      .set(bearer(buyerToken))
      .expect(200);
    expect(buyer.body).toMatchObject({
      canReview: true,
      reason: null,
      review: null,
    });
  });

  it('validates the review', async () => {
    await review(buyerToken, { rating: 0 }).expect(400);
    await review(buyerToken, { rating: 6 }).expect(400);
    await review(buyerToken, { rating: 4.5 }).expect(400);
    await review(buyerToken, { rating: 5, body: 'x'.repeat(4001) }).expect(400);
    await review(buyerToken, { rating: 5, status: 'hidden' }).expect(400);
    await http()
      .put(`/reviews/books/${draftId.toString()}`)
      .set(bearer(buyerToken))
      .send({ rating: 5 })
      .expect(404);
  });

  it('a review sets the book’s stars; editing changes them; one review per buyer', async () => {
    await review(buyerToken, {
      rating: 5,
      title: 'Clear',
      body: 'Explains graphite well.',
    }).expect(200);
    expect(await book()).toMatchObject({ ratingAvg: 5, ratingCount: 1 });
    await review(buyerToken, {
      rating: 3,
      title: 'Good',
      body: 'Changed my mind a little.',
    }).expect(200);
    expect(await book()).toMatchObject({ ratingAvg: 3, ratingCount: 1 });
    await review(secondBuyerToken, { rating: 4 }).expect(200);
    expect(await book()).toMatchObject({ ratingAvg: 3.5, ratingCount: 2 });

    const page = await http()
      .get(`/catalog/books/${bookId.toString()}/reviews`)
      .expect(200);
    expect(page.body.total).toBe(2);
    expect(page.body.summary).toEqual({
      average: 3.5,
      count: 2,
      distribution: { 1: 0, 2: 0, 3: 1, 4: 1, 5: 0 },
    });
    expect(
      page.body.items.map((r: { authorName: string }) => r.authorName).sort(),
    ).toEqual(['Ada O.', 'Chidi E.']);
    expect(JSON.stringify(page.body)).not.toContain('@example.com');
  });

  it('staff hide an abusive review (never edit it); the stars follow; showing it again restores them', async () => {
    const list = await http()
      .get('/admin/reviews')
      .set(bearer(staffToken))
      .expect(200);
    const chidi = list.body.items.find(
      (r: { authorName: string }) => r.authorName === 'Chidi E.',
    );
    expect(chidi).toMatchObject({
      reviewerEmail: 'chidi@example.com',
      book: { title: 'Cast Irons' },
    });
    await http().get('/admin/reviews').set(bearer(buyerToken)).expect(403);

    await http()
      .post(`/admin/reviews/${chidi.id}/visibility`)
      .set(bearer(staffToken))
      .send({ status: 'hidden', reason: 'Spam link' })
      .expect(204);
    expect(await book()).toMatchObject({ ratingAvg: 3, ratingCount: 1 });
    const pub = await http()
      .get(`/catalog/books/${bookId.toString()}/reviews`)
      .expect(200);
    expect(pub.body.total).toBe(1);
    // Editing a hidden review keeps it hidden.
    await review(secondBuyerToken, { rating: 5 }).expect(200);
    expect(await book()).toMatchObject({ ratingCount: 1 });
    await http()
      .post(`/admin/reviews/${chidi.id}/visibility`)
      .set(bearer(staffToken))
      .send({ status: 'published' })
      .expect(204);
    expect(await book()).toMatchObject({ ratingAvg: 4, ratingCount: 2 });
    await http()
      .post(`/admin/reviews/${chidi.id}/visibility`)
      .set(bearer(staffToken))
      .send({ status: 'hidden', body: 'rewritten' })
      .expect(400);
    expect(
      await db()
        .collection('audit_logs')
        .countDocuments({ action: { $in: ['review.hidden', 'review.shown'] } }),
    ).toBe(2);
  });

  it('a buyer can delete their own review', async () => {
    await http()
      .delete(`/reviews/books/${bookId.toString()}`)
      .set(bearer(buyerToken))
      .expect(204);
    expect(await book()).toMatchObject({ ratingAvg: 5, ratingCount: 1 });
    await http()
      .delete(`/reviews/books/${bookId.toString()}`)
      .set(bearer(buyerToken))
      .expect(404);
  });

  it('the wishlist: save, list as cards, no duplicates, remove; only published books; signed in only', async () => {
    const id = bookId.toString();
    await http().get('/wishlist/ids').expect(401);
    await http()
      .put(`/wishlist/${id}`)
      .set(bearer(strangerToken))
      .expect(200, [id]);
    await http()
      .put(`/wishlist/${id}`)
      .set(bearer(strangerToken))
      .expect(200, [id]);
    await http()
      .put(`/wishlist/${draftId.toString()}`)
      .set(bearer(strangerToken))
      .expect(404);
    await http()
      .put('/wishlist/not-an-id')
      .set(bearer(strangerToken))
      .expect(404);
    const cards = await http()
      .get('/wishlist?currency=NGN')
      .set(bearer(strangerToken))
      .expect(200);
    expect(cards.body).toEqual([
      expect.objectContaining({ slug: 'cast-irons', title: 'Cast Irons' }),
    ]);
    // Each customer's own.
    await http().get('/wishlist/ids').set(bearer(buyerToken)).expect(200, []);
    await http()
      .delete(`/wishlist/${id}`)
      .set(bearer(strangerToken))
      .expect(200, []);
  });
});
