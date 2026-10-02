import { ConfigModule } from '@nestjs/config';
import { MongooseModule, getModelToken } from '@nestjs/mongoose';
import { Test, type TestingModule } from '@nestjs/testing';
import type { MongoMemoryReplSet } from 'mongodb-memory-server';
import { Types, type Model } from 'mongoose';
import { startMongo } from '../../test/mongo.js';
import { AuditLog, AuditModule } from '../audit/audit.module.js';
import { AuthService } from '../auth/auth.service.js';
import type { AccessTokenPayload } from '../auth/interfaces/auth.types.js';
import { randomToken } from '../common/crypto/tokens.js';
import type { Currency } from '../common/money/currency.js';
import { money } from '../common/money/money.js';
import { Book } from '../catalog/schemas/book.schema.js';
import { CartService } from '../commerce/cart.service.js';
import { CouponsService } from '../commerce/coupons.service.js';
import {
  OrdersService,
  PAYMENT_WINDOW_MS,
} from '../commerce/orders.service.js';
import { Coupon, CouponRedemption } from '../commerce/schemas/coupon.schema.js';
import { Entitlement } from '../commerce/schemas/entitlement.schema.js';
import { Order, type OrderDocument } from '../commerce/schemas/order.schema.js';
import { ShippingService } from '../commerce/shipping.service.js';
import { MailService } from '../mail/mail.service.js';
import { CloudinaryService } from '../uploads/cloudinary.service.js';
import { User } from '../users/schemas/user.schema.js';
import {
  OutcomeUnknownError,
  ProviderRejectedError,
  type InitiateParams,
  type PaymentAdapter,
  type ProviderResult,
  type RefundResult,
  type WebhookEnvelope,
} from './adapters/payment-adapter.js';
import { PAYMENT_ADAPTERS, PaymentsService } from './payments.service.js';
import {
  Payment,
  WebhookEvent,
  type Provider,
} from './schemas/payment.schema.js';

const owner: AccessTokenPayload = {
  sub: '64b000000000000000000001',
  email: 'owner@x.com',
  role: 'owner',
  mfa: true,
  sid: 's',
  typ: 'access',
};

/** A controllable provider: what verify answers, how refunds go, signed webhooks ("sig: ok"). */
class FakeAdapter implements PaymentAdapter {
  enabled = true;
  verifyResults = new Map<string, ProviderResult>();
  verifyError: Error | null = null;
  initiateError: Error | null = null;
  refundResult: RefundResult | Error = {
    status: 'succeeded',
    providerRefundId: 're_1',
  };
  initiated: InitiateParams[] = [];
  refunds: Array<{ amount: number; idempotencyKey: string }> = [];
  constructor(readonly provider: Provider) {}
  initiate(params: InitiateParams) {
    if (this.initiateError) return Promise.reject(this.initiateError);
    this.initiated.push(params);
    return Promise.resolve({
      redirectUrl: `https://pay.example/${params.reference}`,
      providerTransactionId: `tx-${params.reference}`,
    });
  }
  verify(reference: string) {
    if (this.verifyError) return Promise.reject(this.verifyError);
    return Promise.resolve(
      this.verifyResults.get(reference) ?? {
        reference,
        status: 'pending' as const,
        amount: null,
        providerTransactionId: null,
        providerChargeId: null,
        failureReason: null,
      },
    );
  }
  parseWebhook(
    rawBody: Buffer,
    headers: Record<string, string | string[] | undefined>,
  ): Promise<WebhookEnvelope | null> {
    if (headers.sig !== 'ok') return Promise.resolve(null);
    return Promise.resolve(JSON.parse(rawBody.toString()) as WebhookEnvelope);
  }
  refund(p: {
    amount: { amount: number };
    idempotencyKey: string;
  }): Promise<RefundResult> {
    this.refunds.push({
      amount: p.amount.amount,
      idempotencyKey: p.idempotencyKey,
    });
    return this.refundResult instanceof Error
      ? Promise.reject(this.refundResult)
      : Promise.resolve(this.refundResult);
  }
}

class FakeMail {
  sent: Array<{ to: string; template: string; dedupeKey: string }> = [];
  enqueue(email: { to: string; template: string; dedupeKey: string }) {
    if (!this.sent.some((e) => e.dedupeKey === email.dedupeKey))
      this.sent.push(email);
    return Promise.resolve({});
  }
  count(template: string) {
    return this.sent.filter((e) => e.template === template).length;
  }
}

describe('Payments (settlement, webhooks, reconciliation, refunds)', () => {
  let mongod: MongoMemoryReplSet;
  let moduleRef: TestingModule;
  let payments: PaymentsService;
  let orders: OrdersService;
  let cart: CartService;
  let models: {
    book: Model<Book>;
    user: Model<User>;
    order: Model<Order>;
    payment: Model<Payment>;
    webhook: Model<WebhookEvent>;
    entitlement: Model<Entitlement>;
    coupon: Model<Coupon>;
    redemption: Model<CouponRedemption>;
    audit: Model<AuditLog>;
  };
  const mail = new FakeMail();
  const claimLinks: string[] = [];
  const paystack = new FakeAdapter('paystack');
  const stripe = new FakeAdapter('stripe');
  const flutterwave = new FakeAdapter('flutterwave');

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
              BRAND_NAME: 'Engineering Books',
              JWT_ACCESS_SECRET: 'x'.repeat(40),
              TWO_FACTOR_ENCRYPTION_KEY: Buffer.alloc(32, 1).toString('base64'),
              BCRYPT_COST: 4,
              STRIPE_COUNTRIES: 'US, gb',
            }),
          ],
        }),
        MongooseModule.forRoot(mongod.getUri()),
        AuditModule,
        (await import('./payments.module.js')).PaymentsModule,
      ],
    })
      .overrideProvider(PAYMENT_ADAPTERS)
      .useValue([paystack, stripe, flutterwave])
      .overrideProvider(MailService)
      .useValue(mail)
      .overrideProvider(CloudinaryService)
      .useValue({ configured: false, imageUrl: () => null })
      .overrideProvider(AuthService)
      .useValue({
        sendClaimLink: (user: { email: string }) => (
          claimLinks.push(user.email),
          Promise.resolve()
        ),
      })
      .compile();
    payments = moduleRef.get(PaymentsService);
    orders = moduleRef.get(OrdersService);
    cart = moduleRef.get(CartService);
    const m = <T>(name: string) => moduleRef.get<Model<T>>(getModelToken(name));
    models = {
      book: m(Book.name),
      user: m(User.name),
      order: m(Order.name),
      payment: m(Payment.name),
      webhook: m(WebhookEvent.name),
      entitlement: m(Entitlement.name),
      coupon: m(Coupon.name),
      redemption: m(CouponRedemption.name),
      audit: m(AuditLog.name),
    };
    for (const model of Object.values(models)) await model.syncIndexes();
    await moduleRef.get(ShippingService).create(
      {
        name: 'Nigeria',
        countries: ['NG'],
        rates: [
          { currency: 'NGN', firstItem: 250_000, additionalItem: 100_000 },
          { currency: 'USD', firstItem: 1500, additionalItem: 500 },
        ],
        estimatedDays: { min: 2, max: 5 },
        active: true,
      },
      owner,
    );
  }, 120_000);

  afterAll(async () => {
    await moduleRef?.close();
    await mongod?.stop();
  });

  beforeEach(async () => {
    // Every collection, so nothing leaks between tests (audit_logs included).
    const collections = await models.book.db.listCollections();
    await Promise.all(
      collections
        .filter(
          (c) => !c.name.startsWith('system.') && c.name !== 'shipping_zones',
        )
        .map((c) => models.book.db.collection(c.name).deleteMany({})),
    );
    mail.sent = [];
    claimLinks.length = 0;
    for (const adapter of [paystack, stripe, flutterwave]) {
      Object.assign(adapter, {
        enabled: true,
        verifyResults: new Map(),
        verifyError: null,
        initiateError: null,
        initiated: [],
        refunds: [],
        refundResult: { status: 'succeeded', providerRefundId: 're_1' },
      });
    }
  });

  // ---------------------------------------------------------------- fixtures

  let seq = 0;
  async function book(stock = 5) {
    seq += 1;
    const doc = await models.book.create({
      title: `Foundry Book ${seq}`,
      slug: `foundry-book-${seq}`,
      status: 'published',
      formats: [
        {
          type: 'ebook',
          sku: `E-${seq}`,
          active: true,
          prices: [
            { currency: 'NGN', amount: 1_500_000 },
            { currency: 'USD', amount: 2499 },
          ],
          ebook: { stampWithBuyer: true },
        },
        {
          type: 'print',
          sku: `P-${seq}`,
          active: true,
          prices: [
            { currency: 'NGN', amount: 2_500_000 },
            { currency: 'USD', amount: 3999 },
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

  const address = {
    fullName: 'Ada Obi',
    phone: '+2348000000000',
    line1: '1 Road',
    line2: '',
    city: 'Lagos',
    state: '',
    postalCode: '',
    country: 'NG',
  };

  /** A guest's NGN order: one ebook + one print copy (₦15,000 + ₦25,000 + ₦2,500 shipping). */
  async function placeOrder(
    opts: {
      stock?: number;
      couponCode?: string;
      currency?: Currency;
      ebookOnly?: boolean;
      country?: string;
      now?: Date;
    } = {},
  ) {
    const bookId = await book(opts.stock ?? 5);
    const guestId = cart.newGuestId();
    const ownerCart = { userId: null, guestId };
    const currency = opts.currency ?? 'NGN';
    await cart.add(
      ownerCart,
      { bookId, format: 'ebook', quantity: 1 },
      currency,
    );
    if (!opts.ebookOnly)
      await cart.add(
        ownerCart,
        { bookId, format: 'print', quantity: 1 },
        currency,
      );
    const checkoutKey = randomToken(24);
    const { order } = await orders.place({
      owner: ownerCart,
      actor: null,
      checkoutKey,
      currency,
      email: `buyer${seq}@example.com`,
      name: 'Ada Obi',
      ...(opts.ebookOnly ? {} : { shippingAddress: address }),
      ...(opts.couponCode ? { couponCode: opts.couponCode } : {}),
      ...(opts.country ? { country: opts.country } : {}),
      now: opts.now,
    });
    return { order, bookId, checkoutKey, guestCart: ownerCart };
  }

  async function startPayment(
    order: OrderDocument,
    checkoutKey: string,
    provider: Provider = 'paystack',
  ) {
    const { reference } = await payments.initiate({
      orderNumber: order.orderNumber,
      provider,
      actor: null,
      checkoutKey,
    });
    return reference;
  }

  const paid = (
    reference: string,
    amount: number,
    currency: Currency = 'NGN',
  ): ProviderResult => ({
    reference,
    status: 'succeeded',
    amount: money(amount, currency),
    providerTransactionId: `tx-${reference}`,
    providerChargeId: `ch-${reference}`,
    failureReason: null,
  });

  const webhook = (
    envelope: WebhookEnvelope,
    provider: Provider = 'paystack',
  ) =>
    payments.handleWebhook(provider, Buffer.from(JSON.stringify(envelope)), {
      sig: 'ok',
    });

  const printStock = async (bookId: string) =>
    (await models.book.findById(bookId).lean())!.formats.find(
      (f) => f.type === 'print',
    )!.print!;
  const freshOrder = async (id: Types.ObjectId) =>
    (await models.order.findById(id).lean())!;

  // ---------------------------------------------------------------- initiate

  describe('initiate', () => {
    it('creates an attempt for the exact order total, with our reference', async () => {
      const { order, checkoutKey } = await placeOrder();
      const reference = await startPayment(order, checkoutKey);
      expect(reference).toMatch(/^BSP-[a-f0-9]{32}$/);
      expect(paystack.initiated[0]).toMatchObject({
        reference,
        amount: { amount: 4_250_000, currency: 'NGN' },
      });
      expect(paystack.initiated[0].successUrl).toBe(
        `https://books.example.com/checkout/callback?reference=${reference}`,
      );
      expect(await models.payment.findOne({ reference }).lean()).toMatchObject({
        status: 'initiated',
        amount: 4_250_000,
        currency: 'NGN',
        provider: 'paystack',
      });
    });

    it('offers and allows Stripe only to buyers in an allowed country, and never for naira', async () => {
      const ids = (currency: 'USD' | 'NGN', country: string | null) =>
        payments.options(currency, country).providers.map((p) => p.id);
      expect(ids('USD', 'US')).toContain('stripe');
      expect(ids('USD', 'GB')).toContain('stripe');
      expect(ids('USD', 'NG')).not.toContain('stripe');
      expect(ids('USD', null)).not.toContain('stripe');
      expect(ids('NGN', 'US')).toEqual(['paystack', 'flutterwave']);

      // The order's own country decides, whatever the browser asks for.
      const nigerian = await placeOrder({
        currency: 'USD',
        ebookOnly: true,
        country: 'NG',
      });
      await expect(
        payments.initiate({
          orderNumber: nigerian.order.orderNumber,
          provider: 'stripe',
          actor: null,
          checkoutKey: nigerian.checkoutKey,
        }),
      ).rejects.toThrow(/Stripe can't take this payment \(USD, NG\)/);
      const american = await placeOrder({
        currency: 'USD',
        ebookOnly: true,
        country: 'us',
      });
      expect(american.order.country).toBe('US');
      await expect(
        payments.initiate({
          orderNumber: american.order.orderNumber,
          provider: 'stripe',
          actor: null,
          checkoutKey: american.checkoutKey,
        }),
      ).resolves.toMatchObject({ redirectUrl: expect.any(String) });
    });

    it('refuses an expired order, a provider that can’t take the currency, and the wrong guest key', async () => {
      const { order, checkoutKey } = await placeOrder();
      await expect(
        payments.initiate({
          orderNumber: order.orderNumber,
          provider: 'paystack',
          actor: null,
          checkoutKey: randomToken(24),
        }),
      ).rejects.toThrow(/not found/);
      stripe.enabled = false;
      flutterwave.enabled = false;
      const usd = await placeOrder({ currency: 'USD', ebookOnly: true });
      await expect(
        payments.initiate({
          orderNumber: usd.order.orderNumber,
          provider: 'stripe',
          actor: null,
          checkoutKey: usd.checkoutKey,
        }),
      ).rejects.toThrow(/can't take this payment|not available/);
      await expect(
        payments.initiate({
          orderNumber: order.orderNumber,
          provider: 'paystack',
          actor: null,
          checkoutKey,
          now: new Date(Date.now() + PAYMENT_WINDOW_MS + 1000),
        }),
      ).rejects.toThrow(/expired/);
    });

    it('closes the attempt and explains when the provider refuses or can’t be reached', async () => {
      const { order, checkoutKey } = await placeOrder();
      paystack.initiateError = new ProviderRejectedError(
        'Currency not supported by merchant',
      );
      await expect(startPayment(order, checkoutKey)).rejects.toThrow(
        /Currency not supported/,
      );
      paystack.initiateError = new OutcomeUnknownError('timeout');
      await expect(startPayment(order, checkoutKey)).rejects.toThrow(
        /couldn't reach Paystack/,
      );
      expect(await models.payment.countDocuments({ status: 'failed' })).toBe(2);
    });
  });

  // ---------------------------------------------------------------- settlement

  describe('settle', () => {
    it('success path: pays the order and applies every effect once, in one go', async () => {
      await moduleRef
        .get(CouponsService)
        .create({ code: 'SAVE10', kind: 'percent', percentOff: 10 }, owner);
      const { order, bookId, checkoutKey, guestCart } = await placeOrder({
        couponCode: 'SAVE10',
      });
      expect(await cart.items(guestCart)).toHaveLength(2);
      const reference = await startPayment(order, checkoutKey);
      await payments.settle(
        'paystack',
        paid(reference, order.total),
        'webhook',
      );

      const settledOrder = await freshOrder(order._id);
      expect(settledOrder).toMatchObject({
        status: 'paid',
        expiresAt: null,
        payment: { provider: 'paystack' },
        attention: { required: false },
      });
      expect(await models.payment.findOne({ reference }).lean()).toMatchObject({
        status: 'succeeded',
        verifiedAmount: order.total,
        verifiedCurrency: 'NGN',
      });
      expect(await printStock(bookId)).toMatchObject({
        stockOnHand: 4,
        stockReserved: 0,
      });
      expect(
        await models.redemption.findOne({ orderId: order._id }).lean(),
      ).toMatchObject({ status: 'redeemed' });
      expect(
        await models.entitlement
          .findOne({ bookId: new Types.ObjectId(bookId), userId: order.userId })
          .lean(),
      ).toMatchObject({ revokedAt: null });
      expect(mail.count('order.receipt')).toBe(1);
      expect(mail.count('order.new-sale')).toBe(1);
      expect(claimLinks).toEqual([order.email]);
      // The guest's cart no longer holds what they just bought.
      expect(await cart.items(guestCart)).toHaveLength(0);
      expect(
        await models.audit.countDocuments({ action: 'payment.settled' }),
      ).toBe(1);
    });

    it('empties the signed-in buyer cart of what they bought, keeping the rest', async () => {
      const bought = await book();
      const kept = await book();
      const user = await models.user.create({
        email: 'ada@example.com',
        name: 'Ada Obi',
        role: 'customer',
        accountStatus: 'active',
      });
      const actor: AccessTokenPayload = {
        sub: user._id.toString(),
        email: user.email,
        role: 'customer',
        mfa: false,
        sid: 's',
        typ: 'access',
      };
      const mine = { userId: actor.sub, guestId: null };
      await cart.add(
        mine,
        { bookId: bought, format: 'ebook', quantity: 1 },
        'NGN',
      );
      const { order } = await orders.place({
        owner: mine,
        actor,
        checkoutKey: randomToken(24),
        currency: 'NGN',
      });
      // Added after ordering: must survive the settlement.
      await cart.add(
        mine,
        { bookId: kept, format: 'ebook', quantity: 1 },
        'NGN',
      );
      const { reference } = await payments.initiate({
        orderNumber: order.orderNumber,
        provider: 'paystack',
        actor,
      });
      await payments.settle(
        'paystack',
        paid(reference, order.total),
        'webhook',
      );
      expect((await cart.items(mine)).map((i) => i.bookId)).toEqual([kept]);
    });

    it('a duplicate webhook has no second effect', async () => {
      const { order, bookId, checkoutKey } = await placeOrder();
      const reference = await startPayment(order, checkoutKey);
      const event: WebhookEnvelope = {
        kind: 'payment',
        eventId: 'evt-1',
        type: 'charge.success',
        result: paid(reference, order.total),
      };
      expect(await webhook(event)).toBe(true);
      expect(await webhook(event)).toBe(true);
      expect(await models.webhook.countDocuments()).toBe(1);
      expect(await printStock(bookId)).toMatchObject({
        stockOnHand: 4,
        stockReserved: 0,
      });
      expect(mail.count('order.receipt')).toBe(1);
    });

    it('a webhook racing the verify call settles exactly once', async () => {
      const { order, bookId, checkoutKey } = await placeOrder();
      const reference = await startPayment(order, checkoutKey);
      paystack.verifyResults.set(reference, paid(reference, order.total));
      const results = await Promise.all([
        payments.verifyReference(reference),
        webhook({
          kind: 'payment',
          eventId: 'evt-race',
          type: 'charge.success',
          result: paid(reference, order.total),
        }),
        payments.settle('paystack', paid(reference, order.total), 'reconcile'),
      ]);
      expect(results[0]).toMatchObject({
        status: 'paid',
        orderNumber: order.orderNumber,
      });
      expect(await printStock(bookId)).toMatchObject({
        stockOnHand: 4,
        stockReserved: 0,
      });
      expect(await models.entitlement.countDocuments()).toBe(1);
      expect(mail.count('order.receipt')).toBe(1);
      expect(
        await models.audit.countDocuments({ action: 'payment.settled' }),
      ).toBe(1);
    });

    it('two parallel settle() calls: exactly one success', async () => {
      const { order, bookId, checkoutKey } = await placeOrder();
      const reference = await startPayment(order, checkoutKey);
      await Promise.all(
        Array.from({ length: 5 }, () =>
          payments.settle('paystack', paid(reference, order.total), 'verify'),
        ),
      );
      expect(await printStock(bookId)).toMatchObject({
        stockOnHand: 4,
        stockReserved: 0,
      });
      expect(mail.count('order.receipt')).toBe(1);
    });

    it('amount mismatch: not paid, flagged, owner alerted', async () => {
      const { order, checkoutKey } = await placeOrder();
      const reference = await startPayment(order, checkoutKey);
      await payments.settle(
        'paystack',
        paid(reference, order.total - 100),
        'webhook',
      );
      expect((await freshOrder(order._id)).status).toBe('pending_payment');
      expect(await models.payment.findOne({ reference }).lean()).toMatchObject({
        status: 'initiated',
        reconciliationRequired: true,
        verifiedAmount: order.total - 100,
      });
      expect((await freshOrder(order._id)).attention).toMatchObject({
        required: true,
        reason: expect.stringMatching(/confirmed ₦42,499.00/),
      });
      expect(mail.count('order.payment-attention')).toBe(1);
      expect(mail.count('order.receipt')).toBe(0);
    });

    it('currency mismatch: not paid, flagged', async () => {
      const { order, checkoutKey } = await placeOrder();
      const reference = await startPayment(order, checkoutKey);
      await payments.settle(
        'paystack',
        paid(reference, order.total, 'USD'),
        'webhook',
      );
      expect((await freshOrder(order._id)).status).toBe('pending_payment');
      expect(
        (await models.payment.findOne({ reference }).lean())!
          .reconciliationRequired,
      ).toBe(true);
    });

    it('a success without a readable amount is never treated as paid', async () => {
      const { order, checkoutKey } = await placeOrder();
      const reference = await startPayment(order, checkoutKey);
      await payments.settle(
        'paystack',
        { ...paid(reference, 1), amount: null },
        'webhook',
      );
      expect((await freshOrder(order._id)).status).toBe('pending_payment');
    });

    it('ignores a provider mismatch and an unknown reference', async () => {
      const { order, checkoutKey } = await placeOrder();
      const reference = await startPayment(order, checkoutKey);
      await payments.settle('stripe', paid(reference, order.total), 'webhook');
      await payments.settle(
        'paystack',
        paid('BSP-unknown', order.total),
        'webhook',
      );
      expect((await freshOrder(order._id)).status).toBe('pending_payment');
      expect(mail.count('order.receipt')).toBe(0);
    });

    it('a failure never downgrades a success; a failure before success lets the buyer retry', async () => {
      const { order, checkoutKey } = await placeOrder();
      const first = await startPayment(order, checkoutKey);
      await payments.settle(
        'paystack',
        {
          ...paid(first, order.total),
          status: 'failed',
          failureReason: 'Declined',
        },
        'webhook',
      );
      expect(
        await models.payment.findOne({ reference: first }).lean(),
      ).toMatchObject({ status: 'failed', failureReason: 'Declined' });
      expect((await freshOrder(order._id)).status).toBe('pending_payment');

      const second = await startPayment(order, checkoutKey, 'flutterwave');
      await payments.settle(
        'flutterwave',
        paid(second, order.total),
        'webhook',
      );
      await payments.settle(
        'flutterwave',
        {
          ...paid(second, order.total),
          status: 'failed',
          failureReason: 'late',
        },
        'webhook',
      );
      expect(
        (await models.payment.findOne({ reference: second }).lean())!.status,
      ).toBe('succeeded');
      expect((await freshOrder(order._id)).status).toBe('paid');
    });

    it('late payment on an expired order: honoured and stock taken again', async () => {
      const now = new Date();
      const { order, bookId, checkoutKey } = await placeOrder({ now });
      const reference = await startPayment(order, checkoutKey);
      await models.payment.updateOne(
        { reference },
        { $set: { createdAt: new Date(now.getTime() - 20 * 60_000) } },
        { timestamps: false },
      );
      expect(
        await orders.expireDue(
          new Date(now.getTime() + PAYMENT_WINDOW_MS + 1000),
        ),
      ).toBe(1);
      expect(await printStock(bookId)).toMatchObject({
        stockOnHand: 5,
        stockReserved: 0,
      });

      await payments.settle(
        'paystack',
        paid(reference, order.total),
        'webhook',
      );
      expect(await freshOrder(order._id)).toMatchObject({
        status: 'paid',
        attention: { required: false },
      });
      expect(await printStock(bookId)).toMatchObject({
        stockOnHand: 4,
        stockReserved: 0,
      });
    });

    it('late payment on an expired order when the print copy sold out: paid and flagged', async () => {
      const now = new Date();
      const { order, bookId, checkoutKey } = await placeOrder({
        stock: 1,
        now,
      });
      const reference = await startPayment(order, checkoutKey);
      await models.payment.updateOne(
        { reference },
        { $set: { createdAt: new Date(now.getTime() - 20 * 60_000) } },
        { timestamps: false },
      );
      await orders.expireDue(
        new Date(now.getTime() + PAYMENT_WINDOW_MS + 1000),
      );
      await models.book.updateOne(
        { _id: bookId, 'formats.type': 'print' },
        { $set: { 'formats.$.print.stockOnHand': 0 } },
      );

      await payments.settle(
        'paystack',
        paid(reference, order.total),
        'webhook',
      );
      const late = await freshOrder(order._id);
      expect(late.status).toBe('paid');
      expect(late.attention).toMatchObject({
        required: true,
        reason: expect.stringMatching(/out of stock: ship later or refund/),
      });
      expect(await printStock(bookId)).toMatchObject({
        stockOnHand: 0,
        stockReserved: 0,
      });
      expect(mail.count('order.payment-attention')).toBe(1);
      expect(mail.count('order.receipt')).toBe(1);
    });

    it('the database refuses a second successful payment for one order; it is flagged for refund', async () => {
      const { order, checkoutKey } = await placeOrder({ ebookOnly: true });
      const first = await startPayment(order, checkoutKey);
      const second = await startPayment(order, checkoutKey, 'flutterwave');
      await payments.settle('paystack', paid(first, order.total), 'webhook');
      await payments.settle(
        'flutterwave',
        paid(second, order.total),
        'webhook',
      );
      expect(
        await models.payment.countDocuments({
          orderId: order._id,
          status: 'succeeded',
        }),
      ).toBe(1);
      expect(
        await models.payment.findOne({ reference: second }).lean(),
      ).toMatchObject({
        reconciliationRequired: true,
        reconciliationReason: expect.stringMatching(
          /second successful payment/,
        ),
      });
      expect(mail.count('order.receipt')).toBe(1);
      // A flagged payment is left for the owner: reconciliation neither re-checks nor abandons it.
      await payments.reconcile(new Date(Date.now() + 49 * 3_600_000));
      expect(
        (await models.payment.findOne({ reference: second }).lean())!.status,
      ).toBe('initiated');
    });

    it('an ebook bought twice by the same account is flagged, not granted twice', async () => {
      const { order, bookId, checkoutKey } = await placeOrder({
        ebookOnly: true,
      });
      await models.entitlement.create({
        userId: order.userId,
        bookId: new Types.ObjectId(bookId),
        orderId: new Types.ObjectId(),
        grantedAt: new Date(),
      });
      const reference = await startPayment(order, checkoutKey);
      await payments.settle(
        'paystack',
        paid(reference, order.total),
        'webhook',
      );
      expect(await freshOrder(order._id)).toMatchObject({
        status: 'paid',
        attention: {
          required: true,
          reason: expect.stringMatching(/already owned/),
        },
      });
      expect(await models.entitlement.countDocuments()).toBe(1);
    });
  });

  // ---------------------------------------------------------------- webhooks, reconciliation, expiry

  describe('webhooks and background jobs', () => {
    it('rejects a bad signature without touching anything', async () => {
      const { order, checkoutKey } = await placeOrder();
      const reference = await startPayment(order, checkoutKey);
      const body = Buffer.from(
        JSON.stringify({
          kind: 'payment',
          eventId: 'e',
          type: 't',
          result: paid(reference, order.total),
        }),
      );
      expect(
        await payments.handleWebhook('paystack', body, { sig: 'forged' }),
      ).toBe(false);
      expect(await models.webhook.countDocuments()).toBe(0);
      expect((await freshOrder(order._id)).status).toBe('pending_payment');
    });

    it('records a processing failure but still acknowledges (no 5xx to the provider)', async () => {
      const { order, checkoutKey } = await placeOrder();
      const reference = await startPayment(order, checkoutKey);
      const settle = vi
        .spyOn(payments, 'settle')
        .mockRejectedValueOnce(new Error('database hiccup'));
      expect(
        await webhook({
          kind: 'payment',
          eventId: 'evt-x',
          type: 'charge.success',
          result: paid(reference, order.total),
        }),
      ).toBe(true);
      settle.mockRestore();
      expect(
        await models.webhook.findOne({ eventId: 'evt-x' }).lean(),
      ).toMatchObject({ outcome: 'failed', error: 'database hiccup' });
    });

    it('reprocesses a redelivered event that failed before, but never one that succeeded', async () => {
      const { order, bookId, checkoutKey } = await placeOrder();
      const reference = await startPayment(order, checkoutKey);
      const event: WebhookEnvelope = {
        kind: 'payment',
        eventId: 'evt-retry',
        type: 'charge.success',
        result: paid(reference, order.total),
      };
      const settle = vi
        .spyOn(payments, 'settle')
        .mockRejectedValueOnce(new Error('database hiccup'));
      await webhook(event);
      expect((await freshOrder(order._id)).status).toBe('pending_payment');
      settle.mockRestore();
      // The provider redelivers: this time it goes through.
      await webhook(event);
      expect((await freshOrder(order._id)).status).toBe('paid');
      expect(
        await models.webhook.findOne({ eventId: 'evt-retry' }).lean(),
      ).toMatchObject({ outcome: 'processed', error: null });
      // Delivered yet again: a no-op.
      await webhook(event);
      expect(await printStock(bookId)).toMatchObject({
        stockOnHand: 4,
        stockReserved: 0,
      });
      expect(mail.count('order.receipt')).toBe(1);
    });

    it('reconciliation settles a payment whose webhook never came, and abandons very old attempts', async () => {
      const { order, checkoutKey } = await placeOrder();
      const reference = await startPayment(order, checkoutKey);
      paystack.verifyResults.set(reference, paid(reference, order.total));
      await payments.reconcile(new Date(Date.now() + 5 * 60_000)); // too recent: not checked yet
      expect((await freshOrder(order._id)).status).toBe('pending_payment');
      await payments.reconcile(new Date(Date.now() + 11 * 60_000));
      expect((await freshOrder(order._id)).status).toBe('paid');

      const other = await placeOrder();
      const stale = await startPayment(other.order, other.checkoutKey);
      await payments.reconcile(new Date(Date.now() + 49 * 3_600_000));
      expect(
        (await models.payment.findOne({ reference: stale }).lean())!.status,
      ).toBe('abandoned');
    });

    it('does not expire an order while its buyer is on the payment page (15-minute grace)', async () => {
      // Ordered 25 minutes ago (5 minutes of the window left); the buyer starts paying now.
      const { order, checkoutKey } = await placeOrder({
        now: new Date(Date.now() - 25 * 60_000),
      });
      await startPayment(order, checkoutKey);
      // The window ends while they are on the provider's page: not expired.
      expect(await orders.expireDue(new Date(Date.now() + 6 * 60_000))).toBe(0);
      expect((await freshOrder(order._id)).status).toBe('pending_payment');
      // Once the attempt is older than 15 minutes, the order expires as usual.
      expect(await orders.expireDue(new Date(Date.now() + 16 * 60_000))).toBe(
        1,
      );
    });

    it('records a dispute as needing attention', async () => {
      const { order, checkoutKey } = await placeOrder({ ebookOnly: true });
      const reference = await startPayment(order, checkoutKey);
      await payments.settle(
        'paystack',
        paid(reference, order.total),
        'webhook',
      );
      await webhook({
        kind: 'dispute',
        eventId: 'evt-d',
        type: 'charge.dispute.create',
        reference,
        providerTransactionId: null,
        reason: 'fraud',
      });
      expect((await freshOrder(order._id)).attention).toMatchObject({
        required: true,
        reason: expect.stringMatching(/dispute \(fraud\)/),
      });
    });
  });

  // ---------------------------------------------------------------- refunds

  describe('refunds', () => {
    async function paidOrder() {
      const placed = await placeOrder({ ebookOnly: true });
      const reference = await startPayment(placed.order, placed.checkoutKey);
      await payments.settle(
        'paystack',
        paid(reference, placed.order.total),
        'webhook',
      );
      return { ...placed, reference };
    }

    it('full refund: payment and order refunded, the ebook removed from the library', async () => {
      const { order, reference } = await paidOrder();
      expect(
        await payments.refund({
          orderNumber: order.orderNumber,
          amount: order.total,
          reason: 'Customer request',
          actor: owner,
        }),
      ).toMatchObject({ status: 'succeeded' });
      expect((await models.payment.findOne({ reference }).lean())!.status).toBe(
        'refunded',
      );
      expect(await freshOrder(order._id)).toMatchObject({
        status: 'refunded',
        refundedTotal: order.total,
      });
      expect(
        (await models.entitlement.findOne({ orderId: order._id }).lean())!
          .revokedAt,
      ).toBeInstanceOf(Date);
      expect(paystack.refunds[0]).toMatchObject({
        amount: order.total,
        idempotencyKey: expect.stringMatching(/^RF-/),
      });
    });

    it('partial refunds add up; going over what was paid is impossible, even concurrently', async () => {
      const { order, reference } = await paidOrder();
      await payments.refund({
        orderNumber: order.orderNumber,
        amount: 500_000,
        reason: 'Goodwill',
        actor: owner,
      });
      expect(await freshOrder(order._id)).toMatchObject({
        status: 'partially_refunded',
        refundedTotal: 500_000,
      });
      expect((await models.payment.findOne({ reference }).lean())!.status).toBe(
        'partially_refunded',
      );
      expect(
        (await models.entitlement.findOne({ orderId: order._id }).lean())!
          .revokedAt,
      ).toBeNull();

      await expect(
        payments.refund({
          orderNumber: order.orderNumber,
          amount: order.total,
          reason: 'x',
          actor: owner,
        }),
      ).rejects.toThrow(/more than can still be refunded/);
      const remaining = order.total - 500_000;
      const attempts = await Promise.allSettled(
        Array.from({ length: 3 }, () =>
          payments.refund({
            orderNumber: order.orderNumber,
            amount: remaining,
            reason: 'race',
            actor: owner,
          }),
        ),
      );
      expect(attempts.filter((a) => a.status === 'fulfilled')).toHaveLength(1);
      expect(await freshOrder(order._id)).toMatchObject({
        status: 'refunded',
        refundedTotal: order.total,
      });
    });

    it('a refusal by the provider gives the balance back', async () => {
      const { order } = await paidOrder();
      paystack.refundResult = {
        status: 'rejected',
        message: 'Insufficient balance',
      };
      await expect(
        payments.refund({
          orderNumber: order.orderNumber,
          amount: order.total,
          reason: 'x',
          actor: owner,
        }),
      ).rejects.toThrow(/Insufficient balance/);
      expect((await freshOrder(order._id)).status).toBe('paid');
      paystack.refundResult = { status: 'succeeded', providerRefundId: 're_2' };
      await expect(
        payments.refund({
          orderNumber: order.orderNumber,
          amount: order.total,
          reason: 'retry',
          actor: owner,
        }),
      ).resolves.toMatchObject({ status: 'succeeded' });
    });

    it('an unknown outcome is held, flagged and never retried automatically', async () => {
      const { order, reference } = await paidOrder();
      paystack.refundResult = new OutcomeUnknownError('timeout');
      expect(
        await payments.refund({
          orderNumber: order.orderNumber,
          amount: order.total,
          reason: 'x',
          actor: owner,
        }),
      ).toMatchObject({ status: 'outcome_unknown' });
      const payment = (await models.payment.findOne({ reference }).lean())!;
      expect(payment.refunds[0].status).toBe('outcome_unknown');
      expect(payment.reconciliationRequired).toBe(true);
      expect((await freshOrder(order._id)).attention.required).toBe(true);
      // The money might have moved: the balance stays held, so a second refund can't double it.
      await expect(
        payments.refund({
          orderNumber: order.orderNumber,
          amount: 1,
          reason: 'again',
          actor: owner,
        }),
      ).rejects.toThrow(/more than can still be refunded/);
      expect(paystack.refunds).toHaveLength(1);
    });

    it('treats an unexpected error during a refund as an unknown outcome, never as nothing', async () => {
      const { order, reference } = await paidOrder();
      paystack.refundResult = new TypeError(
        'cannot read properties of undefined',
      );
      expect(
        await payments.refund({
          orderNumber: order.orderNumber,
          amount: 100,
          reason: 'x',
          actor: owner,
        }),
      ).toMatchObject({ status: 'outcome_unknown' });
      expect(
        (await models.payment.findOne({ reference }).lean())!.refunds[0].status,
      ).toBe('outcome_unknown');
      expect((await freshOrder(order._id)).attention.required).toBe(true);
    });

    it('a pending refund is confirmed by the provider’s webhook', async () => {
      const { order, reference } = await paidOrder();
      paystack.refundResult = { status: 'pending', providerRefundId: 're_9' };
      await payments.refund({
        orderNumber: order.orderNumber,
        amount: 500_000,
        reason: 'x',
        actor: owner,
      });
      expect((await freshOrder(order._id)).status).toBe('paid');
      await webhook({
        kind: 'refund',
        eventId: 'evt-r',
        type: 'refund.processed',
        reference,
        providerTransactionId: null,
        providerRefundId: 're_9',
        amount: money(500_000, 'NGN'),
        cumulative: false,
        status: 'succeeded',
      });
      expect(await freshOrder(order._id)).toMatchObject({
        status: 'partially_refunded',
        refundedTotal: 500_000,
        attention: { required: false },
      });
    });

    it('a refund made outside the app is recorded and flagged', async () => {
      const { order, reference } = await paidOrder();
      await webhook({
        kind: 'refund',
        eventId: 'evt-ext',
        type: 'charge.refunded',
        reference,
        providerTransactionId: null,
        providerRefundId: null,
        amount: money(order.total, 'NGN'),
        cumulative: true,
        status: 'succeeded',
      });
      expect(await freshOrder(order._id)).toMatchObject({
        status: 'refunded',
        refundedTotal: order.total,
        attention: {
          required: true,
          reason: expect.stringMatching(/outside the app/),
        },
      });
      expect(
        (await models.entitlement.findOne({ orderId: order._id }).lean())!
          .revokedAt,
      ).toBeInstanceOf(Date);
    });

    it('refunds only paid orders', async () => {
      const { order } = await placeOrder();
      await expect(
        payments.refund({
          orderNumber: order.orderNumber,
          amount: 100,
          reason: 'x',
          actor: owner,
        }),
      ).rejects.toThrow(/No paid order/);
    });
  });
});
