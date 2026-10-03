import { ConfigModule } from '@nestjs/config';
import { MongooseModule, getModelToken } from '@nestjs/mongoose';
import { Test, type TestingModule } from '@nestjs/testing';
import type { MongoMemoryReplSet } from 'mongodb-memory-server';
import { Types, type Model } from 'mongoose';
import { startMongo } from '../../test/mongo.js';
import { AuditModule } from '../audit/audit.module.js';
import type { AccessTokenPayload } from '../auth/interfaces/auth.types.js';
import { randomToken } from '../common/crypto/tokens.js';
import { Book } from '../catalog/schemas/book.schema.js';
import { MailService } from '../mail/mail.service.js';
import { NotificationsModule } from '../notifications/notifications.module.js';
import { RealtimeModule } from '../realtime/realtime.module.js';
import { CloudinaryService } from '../uploads/cloudinary.service.js';
import { User } from '../users/schemas/user.schema.js';
import { CartService } from './cart.service.js';
import { CommerceModule } from './commerce.module.js';
import { CouponsService } from './coupons.service.js';
import { OrdersService, PAYMENT_WINDOW_MS } from './orders.service.js';
import { Coupon, CouponRedemption } from './schemas/coupon.schema.js';
import { Entitlement } from './schemas/entitlement.schema.js';
import { Order } from './schemas/order.schema.js';
import { ShippingService } from './shipping.service.js';

const staff: AccessTokenPayload = {
  sub: '64b000000000000000000001',
  email: 'owner@x.com',
  role: 'owner',
  mfa: true,
  sid: 's',
  typ: 'access',
};

class FakeMail {
  sent: Array<{ to: string; template: string; dedupeKey: string }> = [];
  enqueue(email: { to: string; template: string; dedupeKey: string }) {
    if (!this.sent.some((e) => e.dedupeKey === email.dedupeKey))
      this.sent.push(email);
    return Promise.resolve({});
  }
}

const fakeMedia = {
  configured: false,
  imageUrl: () => null,
};

describe('Orders (placement, holds, idempotency, expiry)', () => {
  let mongod: MongoMemoryReplSet;
  let moduleRef: TestingModule;
  let orders: OrdersService;
  let cart: CartService;
  let shipping: ShippingService;
  let coupons: CouponsService;
  let bookModel: Model<Book>;
  let userModel: Model<User>;
  let orderModel: Model<Order>;
  let couponModel: Model<Coupon>;
  let entitlementModel: Model<Entitlement>;
  let redemptionModel: Model<CouponRedemption>;
  const mail = new FakeMail();

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
            }),
          ],
        }),
        MongooseModule.forRoot(mongod.getUri()),
        AuditModule,
        RealtimeModule,
        NotificationsModule,
        CommerceModule,
      ],
    })
      .overrideProvider(CloudinaryService)
      .useValue(fakeMedia)
      .overrideProvider(MailService)
      .useValue(mail)
      .compile();
    orders = moduleRef.get(OrdersService);
    cart = moduleRef.get(CartService);
    shipping = moduleRef.get(ShippingService);
    coupons = moduleRef.get(CouponsService);
    bookModel = moduleRef.get(getModelToken(Book.name));
    userModel = moduleRef.get(getModelToken(User.name));
    orderModel = moduleRef.get(getModelToken(Order.name));
    couponModel = moduleRef.get(getModelToken(Coupon.name));
    entitlementModel = moduleRef.get(getModelToken(Entitlement.name));
    redemptionModel = moduleRef.get(getModelToken(CouponRedemption.name));
    for (const model of [
      bookModel,
      userModel,
      orderModel,
      couponModel,
      entitlementModel,
      redemptionModel,
    ]) {
      await model.syncIndexes();
    }
  }, 120_000);

  afterAll(async () => {
    await moduleRef?.close();
    await mongod?.stop();
  });

  beforeEach(async () => {
    const collections = await bookModel.db.listCollections();
    await Promise.all(
      collections
        .filter((c) => !c.name.startsWith('system.'))
        .map((c) => bookModel.db.collection(c.name).deleteMany({})),
    );
    mail.sent = [];
  });

  // ---------------------------------------------------------------- fixtures

  let skuSeq = 0;
  async function publishedBook(
    title: string,
    stock = 5,
    ebookUsd = 2499,
    printUsd = 3999,
  ) {
    skuSeq += 1;
    const doc = await bookModel.create({
      title,
      slug: `${title.toLowerCase().replace(/\W+/g, '-')}-${skuSeq}`,
      status: 'published',
      formats: [
        {
          type: 'ebook',
          sku: `E-${skuSeq}`,
          active: true,
          prices: [
            { currency: 'USD', amount: ebookUsd },
            { currency: 'NGN', amount: 1_500_000 },
          ],
          ebook: { stampWithBuyer: true },
        },
        {
          type: 'print',
          sku: `P-${skuSeq}`,
          active: true,
          prices: [
            { currency: 'USD', amount: printUsd },
            { currency: 'NGN', amount: 2_500_000 },
          ],
          print: {
            stockOnHand: stock,
            stockReserved: 0,
            weightGrams: 600,
            maxPerOrder: 5,
          },
        },
      ],
    });
    return doc._id.toString();
  }

  async function customer(email = 'ada@example.com') {
    const user = await userModel.create({
      email,
      name: 'Ada Obi',
      passwordHash: 'x',
      role: 'customer',
      accountStatus: 'active',
      termsAcceptedAt: new Date(),
    });
    const actor: AccessTokenPayload = {
      sub: user._id.toString(),
      email,
      role: 'customer',
      mfa: false,
      sid: 's',
      typ: 'access',
    };
    return { owner: { userId: actor.sub, guestId: null }, actor };
  }

  const key = () => randomToken(24);
  const stockOf = async (bookId: string) => {
    const book = await bookModel.findById(bookId).lean();
    return book!.formats.find((f) => f.type === 'print')!.print!;
  };
  const address = {
    fullName: 'Ada Obi',
    phone: '+2348000000000',
    line1: '12 Campus Road',
    line2: '',
    city: 'Lagos',
    state: 'Lagos',
    postalCode: '100001',
    country: 'NG',
  };
  async function nigeriaZone() {
    await shipping.create(
      {
        name: 'Nigeria',
        countries: ['NG'],
        rates: [
          { currency: 'USD', firstItem: 1500, additionalItem: 500 },
          { currency: 'NGN', firstItem: 250_000, additionalItem: 100_000 },
        ],
        estimatedDays: { min: 2, max: 5 },
        active: true,
      },
      staff,
    );
  }

  // ---------------------------------------------------------------- placement

  it('places an order priced from the catalogue, numbered, held for 30 minutes', async () => {
    const book = await publishedBook('Principles of Foundry Technology');
    const { owner, actor } = await customer();
    await cart.add(
      owner,
      { bookId: book, format: 'ebook', quantity: 1 },
      'USD',
    );
    const now = new Date('2026-10-01T10:00:00Z');

    const { order, created } = await orders.place({
      owner,
      actor,
      checkoutKey: key(),
      currency: 'USD',
      now,
    });

    expect(created).toBe(true);
    expect(order).toMatchObject({
      orderNumber: 'BS-2026-000001',
      status: 'pending_payment',
      currency: 'USD',
      subtotal: 2499,
      discountTotal: 0,
      shippingTotal: 0,
      total: 2499,
      email: 'ada@example.com',
      shipment: { status: 'not_required' },
    });
    expect(order.expiresAt!.getTime()).toBe(now.getTime() + PAYMENT_WINDOW_MS);
    expect(order.items[0]).toMatchObject({
      format: 'ebook',
      unitAmount: 2499,
      quantity: 1,
      lineTotal: 2499,
    });
    // The cart is kept until payment succeeds (BS-8), so an expired order loses nothing.
    expect(await cart.items(owner)).toHaveLength(1);
  });

  it('uses the price at the moment of ordering, not the price when the item was added', async () => {
    const book = await publishedBook('Heat Treatment of Steels');
    const { owner, actor } = await customer();
    await cart.add(
      owner,
      { bookId: book, format: 'ebook', quantity: 1 },
      'USD',
    );
    await bookModel.updateOne(
      { _id: book, 'formats.type': 'ebook' },
      { $set: { 'formats.$.prices': [{ currency: 'USD', amount: 1999 }] } },
    );

    const view = await cart.view(owner, 'USD');
    expect(view.lines[0]).toMatchObject({ unitAmount: 1999, priceWas: 2499 });
    const { order } = await orders.place({
      owner,
      actor,
      checkoutKey: key(),
      currency: 'USD',
    });
    expect(order.total).toBe(1999);
  });

  it('returns the same order for a retried checkout key, and refuses the key from someone else', async () => {
    const book = await publishedBook('Metal Casting');
    const { owner, actor } = await customer();
    await cart.add(
      owner,
      { bookId: book, format: 'ebook', quantity: 1 },
      'USD',
    );
    const checkoutKey = key();
    const first = await orders.place({
      owner,
      actor,
      checkoutKey,
      currency: 'USD',
    });
    const retry = await orders.place({
      owner,
      actor,
      checkoutKey,
      currency: 'USD',
    });
    expect(retry.created).toBe(false);
    expect(retry.order.orderNumber).toBe(first.order.orderNumber);
    expect(await orderModel.countDocuments()).toBe(1);

    const other = await customer('bola@example.com');
    await expect(
      orders.place({ ...other, checkoutKey, currency: 'USD' }),
    ).rejects.toThrow(/already used/);
  });

  it('creates exactly one order when the same request arrives twice at once', async () => {
    const book = await publishedBook('Moulding Sands');
    const { owner, actor } = await customer();
    await cart.add(
      owner,
      { bookId: book, format: 'print', quantity: 1 },
      'USD',
    );
    await nigeriaZone();
    const checkoutKey = key();
    const input = {
      owner,
      actor,
      checkoutKey,
      currency: 'USD' as const,
      shippingAddress: address,
    };
    const results = await Promise.allSettled([
      orders.place(input),
      orders.place(input),
    ]);
    const numbers = results
      .filter((r) => r.status === 'fulfilled')
      .map(
        (r) =>
          (r as PromiseFulfilledResult<{ order: { orderNumber: string } }>)
            .value.order.orderNumber,
      );
    expect(new Set(numbers).size).toBe(1);
    expect(await orderModel.countDocuments()).toBe(1);
    expect((await stockOf(book)).stockReserved).toBe(1);
  });

  // ---------------------------------------------------------------- stock

  it('holds print stock and never oversells the last copy', async () => {
    const book = await publishedBook('Cores and Core Making', 1);
    await nigeriaZone();
    const a = await customer('a@example.com');
    const b = await customer('b@example.com');
    await cart.add(
      a.owner,
      { bookId: book, format: 'print', quantity: 1 },
      'NGN',
    );
    await cart.add(
      b.owner,
      { bookId: book, format: 'print', quantity: 1 },
      'NGN',
    );

    const results = await Promise.allSettled([
      orders.place({
        ...a,
        checkoutKey: key(),
        currency: 'NGN',
        shippingAddress: address,
      }),
      orders.place({
        ...b,
        checkoutKey: key(),
        currency: 'NGN',
        shippingAddress: address,
      }),
    ]);
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    const failure = results.find(
      (r) => r.status === 'rejected',
    ) as PromiseRejectedResult;
    expect(
      String(
        (failure.reason as { response?: { problems?: string[] } }).response
          ?.problems,
      ),
    ).toMatch(/sold out|Out of stock|Stock changed/);
    expect(await stockOf(book)).toMatchObject({
      stockOnHand: 1,
      stockReserved: 1,
    });
  });

  it('charges shipping in the order currency and needs an address for print', async () => {
    const book = await publishedBook('Gating Systems');
    await nigeriaZone();
    const { owner, actor } = await customer();
    await cart.add(
      owner,
      { bookId: book, format: 'print', quantity: 2 },
      'NGN',
    );
    await expect(
      orders.place({ owner, actor, checkoutKey: key(), currency: 'NGN' }),
    ).rejects.toMatchObject({
      response: {
        problems: expect.arrayContaining([
          expect.stringMatching(/Choose where to ship|shipping address/),
        ]),
      },
    });
    await expect(
      orders.place({
        owner,
        actor,
        checkoutKey: key(),
        currency: 'NGN',
        shippingAddress: { ...address, country: 'JP' },
      }),
    ).rejects.toMatchObject({
      response: {
        problems: [expect.stringMatching(/can't ship print copies to JP/)],
      },
    });

    const { order } = await orders.place({
      owner,
      actor,
      checkoutKey: key(),
      currency: 'NGN',
      shippingAddress: address,
    });
    expect(order).toMatchObject({
      subtotal: 5_000_000,
      shippingTotal: 350_000,
      total: 5_350_000,
      shipment: { status: 'pending' },
    });
    expect(order.shippingAddress).toMatchObject({
      city: 'Lagos',
      country: 'NG',
    });
  });

  // ---------------------------------------------------------------- library, guests

  it('refuses an ebook the buyer already owns', async () => {
    const book = await publishedBook('Solidification');
    const { owner, actor } = await customer();
    await cart.add(
      owner,
      { bookId: book, format: 'ebook', quantity: 1 },
      'USD',
    );
    await entitlementModel.create({
      userId: new Types.ObjectId(actor.sub),
      bookId: new Types.ObjectId(book),
      orderId: new Types.ObjectId(),
      grantedAt: new Date(),
    });
    await expect(
      orders.place({ owner, actor, checkoutKey: key(), currency: 'USD' }),
    ).rejects.toMatchObject({
      response: {
        problems: [expect.stringMatching(/Already in your library/)],
      },
    });
    // And it can't be added to the cart again.
    await expect(
      cart.add(owner, { bookId: book, format: 'ebook', quantity: 1 }, 'USD'),
    ).rejects.toThrow(/already in your library/);
  });

  it('lets a guest check out, creating an unclaimed account, and see the order only with their key', async () => {
    const book = await publishedBook('Furnaces and Melting');
    const owner = { userId: null, guestId: cart.newGuestId() };
    await cart.add(
      owner,
      { bookId: book, format: 'ebook', quantity: 1 },
      'USD',
    );
    await expect(
      orders.place({ owner, actor: null, checkoutKey: key(), currency: 'USD' }),
    ).rejects.toMatchObject({
      response: { problems: [expect.stringMatching(/name and email/)] },
    });

    const checkoutKey = key();
    const { order } = await orders.place({
      owner,
      actor: null,
      checkoutKey,
      currency: 'USD',
      email: 'Guest@Example.com ',
      name: 'Chidi Eze',
    });
    const user = await userModel.findOne({ email: 'guest@example.com' }).lean();
    expect(user).toMatchObject({
      accountStatus: 'unclaimed',
      name: 'Chidi Eze',
    });
    expect(order.userId.toString()).toBe(user!._id.toString());
    expect(
      (await orders.forGuest(order.orderNumber, checkoutKey)).orderNumber,
    ).toBe(order.orderNumber);
    await expect(orders.forGuest(order.orderNumber, key())).rejects.toThrow(
      /not found/,
    );
  });

  it('merges a guest cart into the account on sign-in', async () => {
    const a = await publishedBook('Book A');
    const b = await publishedBook('Book B');
    const { owner } = await customer();
    const guest = { userId: null, guestId: cart.newGuestId() };
    await cart.add(owner, { bookId: a, format: 'print', quantity: 1 }, 'USD');
    await cart.add(guest, { bookId: a, format: 'print', quantity: 2 }, 'USD');
    await cart.add(guest, { bookId: b, format: 'ebook', quantity: 1 }, 'USD');
    const merged = await cart.view(
      { userId: owner.userId, guestId: guest.guestId },
      'USD',
    );
    expect(merged.lines.map((l) => [l.format, l.quantity])).toEqual([
      ['print', 3],
      ['ebook', 1],
    ]);
    expect(await cart.view(guest, 'USD')).toMatchObject({ lines: [] });
  });

  // ---------------------------------------------------------------- coupons

  it('applies and holds a coupon; the last use cannot be taken twice; a bad code stops the order', async () => {
    const book = await publishedBook('Inspection of Castings');
    await coupons.create(
      { code: 'launch15', kind: 'percent', percentOff: 15, maxRedemptions: 1 },
      staff,
    );
    const a = await customer('a@example.com');
    const b = await customer('b@example.com');
    await cart.add(
      a.owner,
      { bookId: book, format: 'ebook', quantity: 1 },
      'USD',
    );
    await cart.add(
      b.owner,
      { bookId: book, format: 'ebook', quantity: 1 },
      'USD',
    );

    const { order } = await orders.place({
      ...a,
      checkoutKey: key(),
      currency: 'USD',
      couponCode: 'LAUNCH15',
    });
    expect(order).toMatchObject({
      discountTotal: 375,
      total: 2124,
      coupon: { code: 'LAUNCH15' },
    });
    expect(
      await couponModel.findOne({ code: 'LAUNCH15' }).lean(),
    ).toMatchObject({ redemptionCount: 1 });

    await expect(
      orders.place({
        ...b,
        checkoutKey: key(),
        currency: 'USD',
        couponCode: 'LAUNCH15',
      }),
    ).rejects.toMatchObject({
      response: { problems: [expect.stringMatching(/fully used/)] },
    });
    await expect(
      orders.place({
        ...b,
        checkoutKey: key(),
        currency: 'USD',
        couponCode: 'NOSUCH',
      }),
    ).rejects.toMatchObject({
      response: { problems: [expect.stringMatching(/not valid/)] },
    });
  });

  // ---------------------------------------------------------------- closing

  it('expires unpaid orders once: stock and coupon released, one reminder email', async () => {
    const book = await publishedBook('Patterns', 3);
    await nigeriaZone();
    await coupons.create(
      { code: 'SAVE10', kind: 'percent', percentOff: 10 },
      staff,
    );
    const { owner, actor } = await customer();
    await cart.add(
      owner,
      { bookId: book, format: 'print', quantity: 2 },
      'USD',
    );
    const now = new Date('2026-10-01T10:00:00Z');
    const { order } = await orders.place({
      owner,
      actor,
      checkoutKey: key(),
      currency: 'USD',
      shippingAddress: address,
      couponCode: 'save10',
      now,
    });
    expect(await stockOf(book)).toMatchObject({ stockReserved: 2 });

    expect(
      await orders.expireDue(
        new Date(now.getTime() + PAYMENT_WINDOW_MS - 1000),
      ),
    ).toBe(0);
    expect(
      await orders.expireDue(
        new Date(now.getTime() + PAYMENT_WINDOW_MS + 1000),
      ),
    ).toBe(1);
    expect(
      await orders.expireDue(
        new Date(now.getTime() + PAYMENT_WINDOW_MS + 60_000),
      ),
    ).toBe(0);

    const expired = await orderModel.findById(order._id).lean();
    expect(expired).toMatchObject({
      status: 'expired',
      expiresAt: null,
      completeOrderEmailSent: true,
    });
    expect(await stockOf(book)).toMatchObject({
      stockOnHand: 3,
      stockReserved: 0,
    });
    expect(await couponModel.findOne({ code: 'SAVE10' }).lean()).toMatchObject({
      redemptionCount: 0,
    });
    expect(
      await redemptionModel.findOne({ orderId: order._id }).lean(),
    ).toMatchObject({ status: 'released' });
    expect(mail.sent).toEqual([
      expect.objectContaining({
        to: 'ada@example.com',
        template: 'order.complete-your-order',
      }),
    ]);
  });

  it('cancels an unpaid order once, and a newer checkout replaces an older unpaid one', async () => {
    const book = await publishedBook('Fettling', 4);
    await nigeriaZone();
    const { owner, actor } = await customer();
    await cart.add(
      owner,
      { bookId: book, format: 'print', quantity: 1 },
      'USD',
    );
    const first = await orders.place({
      owner,
      actor,
      checkoutKey: key(),
      currency: 'USD',
      shippingAddress: address,
    });
    const second = await orders.place({
      owner,
      actor,
      checkoutKey: key(),
      currency: 'USD',
      shippingAddress: address,
    });
    expect((await orderModel.findById(first.order._id).lean())!.status).toBe(
      'cancelled',
    );
    expect(await stockOf(book)).toMatchObject({ stockReserved: 1 });

    const cancelled = await orders.cancel(second.order, 'customer');
    expect(cancelled.status).toBe('cancelled');
    expect(await stockOf(book)).toMatchObject({ stockReserved: 0 });
    await expect(orders.cancel(cancelled, 'customer')).rejects.toThrow(
      /Only an unpaid order/,
    );
  });

  it('refuses to save an order whose totals do not add up', async () => {
    const book = await publishedBook('Bad Totals');
    const { owner, actor } = await customer();
    await cart.add(
      owner,
      { bookId: book, format: 'ebook', quantity: 1 },
      'USD',
    );
    const { order } = await orders.place({
      owner,
      actor,
      checkoutKey: key(),
      currency: 'USD',
    });
    order.total = order.total + 1;
    await expect(order.save()).rejects.toThrow(/Total does not match/);
  });

  it('hides other customers’ orders', async () => {
    const book = await publishedBook('Private');
    const a = await customer('a@example.com');
    const b = await customer('b@example.com');
    await cart.add(
      a.owner,
      { bookId: book, format: 'ebook', quantity: 1 },
      'USD',
    );
    const { order } = await orders.place({
      ...a,
      checkoutKey: key(),
      currency: 'USD',
    });
    await expect(
      orders.forUser(order.orderNumber, b.actor.sub),
    ).rejects.toThrow(/not found/);
    expect((await orders.listForUser(b.actor.sub)).length).toBe(0);
  });
});
