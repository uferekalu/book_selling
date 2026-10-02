import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectConnection, InjectModel } from '@nestjs/mongoose';
import { randomBytes } from 'node:crypto';
import {
  Types,
  type ClientSession,
  type Connection,
  type Model,
} from 'mongoose';
import { AuditService } from '../audit/audit.module.js';
import type { AccessTokenPayload } from '../auth/interfaces/auth.types.js';
import { AuthService } from '../auth/auth.service.js';
import { hashToken } from '../common/crypto/tokens.js';
import type { Currency } from '../common/money/currency.js';
import { formatMoney, money, subtract, sum } from '../common/money/money.js';
import { Book } from '../catalog/schemas/book.schema.js';
import { fromStatuses, transition } from '../commerce/order-state-machine.js';
import { Cart } from '../commerce/schemas/cart.schema.js';
import { Coupon, CouponRedemption } from '../commerce/schemas/coupon.schema.js';
import { Entitlement } from '../commerce/schemas/entitlement.schema.js';
import { Order, type OrderDocument } from '../commerce/schemas/order.schema.js';
import { MailService } from '../mail/mail.service.js';
import { User } from '../users/schemas/user.schema.js';
import { countryName } from './countries.js';
import {
  OutcomeUnknownError,
  ProviderRejectedError,
  type PaymentAdapter,
  type ProviderResult,
  type WebhookEnvelope,
} from './adapters/payment-adapter.js';
import {
  parseCountryList,
  PROVIDER_LABEL,
  providersFor,
} from './provider-resolver.js';
import {
  Payment,
  SETTLED_STATUSES,
  WebhookEvent,
  type PaymentDocument,
  type Provider,
} from './schemas/payment.schema.js';

export const PAYMENT_ADAPTERS = Symbol('PAYMENT_ADAPTERS');
const DUPLICATE_KEY = 11000;
const MAX_ATTEMPTS_PER_ORDER = 10;

export type PublicPaymentStatus = 'paid' | 'pending' | 'failed';

/**
 * Payments (ARCHITECTURE §8.5, §9). `settle()` is the ONLY code that marks money as received,
 * and only after a server-side confirmation whose amount and currency exactly match the order.
 */
@Injectable()
export class PaymentsService {
  private readonly logger = new Logger(PaymentsService.name);
  private readonly adapters: Map<Provider, PaymentAdapter>;
  private readonly frontendUrl: string;
  private readonly brand: string;
  private readonly ownerEmail: string | null;
  /** Buyer countries where Stripe may be used (`STRIPE_COUNTRIES`, BS-22). */
  private readonly stripeCountries: ReadonlySet<string>;

  constructor(
    @InjectConnection() private readonly connection: Connection,
    @InjectModel(Payment.name) private readonly payments: Model<Payment>,
    @InjectModel(WebhookEvent.name)
    private readonly webhookEvents: Model<WebhookEvent>,
    @InjectModel(Order.name) private readonly orders: Model<Order>,
    @InjectModel(Book.name) private readonly books: Model<Book>,
    @InjectModel(Cart.name) private readonly carts: Model<Cart>,
    @InjectModel(Coupon.name) private readonly coupons: Model<Coupon>,
    @InjectModel(CouponRedemption.name)
    private readonly redemptions: Model<CouponRedemption>,
    @InjectModel(Entitlement.name)
    private readonly entitlements: Model<Entitlement>,
    @InjectModel(User.name) private readonly users: Model<User>,
    private readonly mail: MailService,
    private readonly audit: AuditService,
    private readonly auth: AuthService,
    @Inject(PAYMENT_ADAPTERS) adapters: PaymentAdapter[],
    config: ConfigService,
  ) {
    this.adapters = new Map(adapters.map((a) => [a.provider, a]));
    this.frontendUrl = (config.get<string>('FRONTEND_URL') ?? '').replace(
      /\/$/,
      '',
    );
    this.brand = config.get<string>('BRAND_NAME') || 'Engineering Books';
    this.ownerEmail = config.get<string>('OWNER_ALERT_EMAIL') || null;
    this.stripeCountries = parseCountryList(
      config.get<string>('STRIPE_COUNTRIES'),
    );
  }

  enabled(): Set<Provider> {
    return new Set(
      [...this.adapters.values()]
        .filter((a) => a.enabled)
        .map((a) => a.provider),
    );
  }

  /** Providers for a currency and the buyer's country (Stripe only where it is allowed). */
  options(currency: Currency, country: string | null = null) {
    const providers = providersFor(currency, this.enabled(), {
      country,
      stripeCountries: this.stripeCountries,
    });
    return {
      currency,
      providers: providers.map((id) => ({ id, label: PROVIDER_LABEL[id] })),
      default: providers[0] ?? null,
    };
  }

  private adapter(provider: Provider): PaymentAdapter {
    const adapter = this.adapters.get(provider);
    if (!adapter?.enabled)
      throw new BadRequestException(
        `${PROVIDER_LABEL[provider]} is not available`,
      );
    return adapter;
  }

  // ---------------------------------------------------------------- initiate

  async initiate(input: {
    orderNumber: string;
    provider: Provider;
    actor: AccessTokenPayload | null;
    checkoutKey?: string;
    now?: Date;
  }): Promise<{ redirectUrl: string; reference: string }> {
    const now = input.now ?? new Date();
    const order = await this.findOrder(
      input.orderNumber,
      input.actor,
      input.checkoutKey,
    );
    if (
      order.status !== 'pending_payment' ||
      !order.expiresAt ||
      order.expiresAt <= now
    ) {
      throw new ConflictException(
        order.status === 'paid' || order.status === 'fulfilled'
          ? 'This order is already paid'
          : 'This order has expired. Your books are still in your cart; please check out again.',
      );
    }
    if (
      !providersFor(order.currency, this.enabled(), {
        // The country the buyer gave at checkout, never what the browser says now.
        country: order.country ?? null,
        stripeCountries: this.stripeCountries,
      }).includes(input.provider)
    ) {
      throw new BadRequestException(
        `${PROVIDER_LABEL[input.provider]} can't take this payment (${order.currency}${order.country ? `, ${order.country}` : ''})`,
      );
    }
    if (
      (await this.payments.countDocuments({ orderId: order._id })) >=
      MAX_ATTEMPTS_PER_ORDER
    ) {
      throw new ConflictException(
        'Too many payment attempts for this order. Please check out again.',
      );
    }

    // Our own reference: unique, unguessable, and within every provider's allowed characters.
    const reference = `BSP-${randomBytes(16).toString('hex')}`;
    const payment = await this.payments.create({
      orderId: order._id,
      provider: input.provider,
      reference,
      amount: order.total,
      currency: order.currency,
      status: 'initiated',
    });
    const callback = `${this.frontendUrl}/checkout/callback?reference=${reference}`;
    try {
      const result = await this.adapter(input.provider).initiate({
        reference,
        amount: money(order.total, order.currency),
        customer: { email: order.email, name: order.customerName },
        orderNumber: order.orderNumber,
        description: `${this.brand} order ${order.orderNumber}`,
        successUrl: callback,
        cancelUrl: `${callback}&cancelled=1`,
      });
      if (result.providerTransactionId) {
        await this.payments
          .updateOne(
            { _id: payment._id },
            { $set: { providerTransactionId: result.providerTransactionId } },
          )
          .exec();
      }
      this.logger.log(
        `Payment ${reference} started: ${order.orderNumber} via ${input.provider}`,
      );
      return { redirectUrl: result.redirectUrl, reference };
    } catch (error) {
      // Starting a payment moves no money, so a failure here is safe to close and retry.
      await this.payments
        .updateOne(
          { _id: payment._id, status: 'initiated' },
          {
            $set: { status: 'failed', failureReason: (error as Error).message },
          },
        )
        .exec();
      if (error instanceof ProviderRejectedError)
        throw new BadRequestException(error.message);
      this.logger.error(
        `Payment ${reference} could not start: ${(error as Error).message}`,
      );
      throw new ServiceUnavailableException(
        `We couldn't reach ${PROVIDER_LABEL[input.provider]}. Please try again or choose another payment method.`,
      );
    }
  }

  // ---------------------------------------------------------------- verify on return

  /** After the buyer returns from the provider: ask the provider directly, settle, report. */
  async verifyReference(reference: string): Promise<{
    status: PublicPaymentStatus;
    orderNumber: string;
    orderStatus: string;
    returnPath: string | null;
    provider: Provider;
  }> {
    const payment = await this.payments.findOne({ reference }).exec();
    if (!payment) throw new NotFoundException('Payment not found');
    if (payment.status === 'initiated' || payment.status === 'failed') {
      try {
        const result = await this.adapter(payment.provider).verify(
          payment.reference,
          payment.providerTransactionId,
        );
        await this.settle(payment.provider, result, 'verify');
      } catch (error) {
        // Unknown for now: the webhook or the reconciliation job will settle it.
        this.logger.warn(
          `Verify of ${reference} inconclusive: ${(error as Error).message}`,
        );
      }
    }
    const fresh = (await this.payments.findById(payment._id).exec())!;
    const order = (await this.orders.findById(fresh.orderId).exec())!;
    const status: PublicPaymentStatus = SETTLED_STATUSES.includes(fresh.status)
      ? 'paid'
      : fresh.status === 'initiated'
        ? 'pending'
        : 'failed';
    return {
      status,
      orderNumber: order.orderNumber,
      orderStatus: order.status,
      returnPath: order.returnPath,
      provider: fresh.provider,
    };
  }

  // ---------------------------------------------------------------- webhooks

  /** Returns false only for a bad signature (401). Everything else is acknowledged (2xx). */
  async handleWebhook(
    provider: Provider,
    rawBody: Buffer,
    headers: Record<string, string | string[] | undefined>,
  ): Promise<boolean> {
    const adapter = this.adapters.get(provider);
    if (!adapter?.enabled) return false;
    let envelope: WebhookEnvelope | null;
    try {
      envelope = await adapter.parseWebhook(rawBody, headers);
    } catch (error) {
      // Signature was fine but re-verification failed (Flutterwave): acknowledge; reconcile later.
      this.logger.warn(
        `${provider} webhook could not be read: ${(error as Error).message}`,
      );
      return true;
    }
    if (!envelope) return false;

    const reference =
      envelope.kind === 'payment'
        ? envelope.result.reference
        : envelope.kind === 'ignored'
          ? null
          : envelope.reference;
    let event: { _id: Types.ObjectId } | null;
    try {
      event = await this.webhookEvents.create({
        provider,
        eventId: envelope.eventId,
        type: envelope.type,
        reference,
        receivedAt: new Date(),
      });
    } catch (error) {
      if ((error as { code?: number }).code !== DUPLICATE_KEY) throw error;
      // A redelivery. Processed before: a no-op. Failed before, or stuck unfinished for 10
      // minutes (the process died mid-way): claim it atomically and process it again, so a
      // refund or dispute event is never lost.
      event = await this.webhookEvents
        .findOneAndUpdate(
          {
            provider,
            eventId: envelope.eventId,
            $or: [
              { outcome: 'failed' },
              {
                processedAt: null,
                receivedAt: { $lt: new Date(Date.now() - 10 * 60_000) },
              },
            ],
          },
          {
            $set: {
              outcome: null,
              error: null,
              processedAt: null,
              receivedAt: new Date(),
            },
          },
        )
        .exec();
      if (!event) return true;
    }

    try {
      if (envelope.kind === 'payment')
        await this.settle(provider, envelope.result, 'webhook');
      else if (envelope.kind === 'refund')
        await this.applyProviderRefund(provider, envelope);
      else if (envelope.kind === 'dispute')
        await this.flagDispute(provider, envelope);
      await this.webhookEvents
        .updateOne(
          { _id: event._id },
          {
            $set: {
              processedAt: new Date(),
              outcome: envelope.kind === 'ignored' ? 'ignored' : 'processed',
            },
          },
        )
        .exec();
    } catch (error) {
      this.logger.error(
        `${provider} webhook ${envelope.eventId} failed: ${(error as Error).message}`,
      );
      await this.webhookEvents
        .updateOne(
          { _id: event._id },
          {
            $set: {
              processedAt: new Date(),
              outcome: 'failed',
              error: (error as Error).message,
            },
          },
        )
        .exec();
    }
    return true;
  }

  // ---------------------------------------------------------------- settlement

  /**
   * THE function that marks money as received (ARCHITECTURE §8.5). Safe to call any number of
   * times from verify, webhooks and reconciliation: whichever arrives first settles; the rest are
   * no-ops.
   */
  async settle(
    provider: Provider,
    result: ProviderResult,
    source: string,
  ): Promise<void> {
    const payment = await this.payments
      .findOne({ reference: result.reference })
      .exec();
    if (!payment) {
      this.logger.warn(
        `Ignored ${source} result for unknown reference ${result.reference}`,
      );
      return;
    }
    if (payment.provider !== provider) {
      this.logger.warn(
        `Ignored ${source} result for ${payment.reference}: provider ${provider} ≠ ${payment.provider}`,
      );
      return;
    }
    await this.payments
      .updateOne(
        { _id: payment._id },
        {
          $set: {
            lastVerifiedAt: new Date(),
            ...(result.providerTransactionId && !payment.providerTransactionId
              ? { providerTransactionId: result.providerTransactionId }
              : {}),
            ...(result.providerChargeId
              ? { providerChargeId: result.providerChargeId }
              : {}),
          },
        },
      )
      .exec();

    if (result.status === 'pending') return;
    if (result.status === 'failed') {
      // Never downgrades a success: only an attempt still `initiated` can fail.
      await this.payments
        .updateOne(
          { _id: payment._id, status: 'initiated' },
          {
            $set: {
              status: 'failed',
              failureReason: result.failureReason ?? 'Payment failed',
            },
          },
        )
        .exec();
      return;
    }

    // ---- succeeded: the money must match EXACTLY, or nothing is marked paid.
    const verified = result.amount;
    if (
      !verified ||
      verified.amount !== payment.amount ||
      verified.currency !== payment.currency
    ) {
      const reason = verified
        ? `The provider confirmed ${formatMoney(verified)} but the payment was for ${formatMoney(money(payment.amount, payment.currency))}.`
        : 'The provider confirmed a payment without a readable amount.';
      await this.flagPayment(payment, reason, verified);
      return;
    }

    let attentionReasons: string[] = [];
    let settledOrder: OrderDocument | null = null;
    try {
      const outcome = await this.inTransaction(async (session) => {
        attentionReasons = [];
        const claimed = await this.payments
          .findOneAndUpdate(
            {
              _id: payment._id,
              status: { $in: ['initiated', 'failed', 'abandoned'] },
            },
            {
              $set: {
                status: 'succeeded',
                verifiedAmount: verified.amount,
                verifiedCurrency: verified.currency,
                succeededAt: new Date(),
                failureReason: null,
                ...(result.providerTransactionId
                  ? { providerTransactionId: result.providerTransactionId }
                  : {}),
                ...(result.providerChargeId
                  ? { providerChargeId: result.providerChargeId }
                  : {}),
              },
            },
            { session, returnDocument: 'after' },
          )
          .exec();
        if (!claimed) return null; // already settled by another path: nothing to do

        const before = await this.orders
          .findOneAndUpdate(
            { _id: payment.orderId, status: { $in: fromStatuses('pay') } },
            {
              $set: {
                status: transition('pending_payment', 'pay'),
                expiresAt: null,
                payment: {
                  provider,
                  paymentId: payment._id,
                  paidAt: new Date(),
                },
              },
              $push: {
                statusHistory: {
                  status: 'paid',
                  at: new Date(),
                  by: `provider:${provider}`,
                  note: '',
                },
              },
            },
            { session, returnDocument: 'before' },
          )
          // Plus the private guest cart id (everything else is selected as usual).
          .select('+guestCartId')
          .exec();
        if (!before) throw new OrderNotPayableError(payment.orderId);

        const heldStock = before.status === 'pending_payment';
        attentionReasons.push(
          ...(await this.commitStock(before, heldStock, session)),
        );
        await this.redeemCoupon(before, heldStock, session);
        attentionReasons.push(...(await this.grantEbooks(before, session)));
        await this.clearPurchasedFromCart(before, session);
        if (attentionReasons.length) {
          await this.orders
            .updateOne(
              { _id: before._id },
              {
                $set: {
                  attention: {
                    required: true,
                    reason: attentionReasons.join(' '),
                  },
                },
              },
              { session },
            )
            .exec();
        }
        await this.queueSettlementEmails(
          before,
          provider,
          attentionReasons,
          session,
        );
        return before;
      });
      settledOrder = outcome;
    } catch (error) {
      if (
        isSecondPaymentError(error) ||
        error instanceof OrderNotPayableError
      ) {
        // A second successful payment for an order already paid: refused by the database index.
        await this.flagPayment(
          payment,
          'A second successful payment arrived for an order that is already paid. Refund this payment in the provider dashboard.',
          verified,
        );
        return;
      }
      throw error;
    }

    if (settledOrder) {
      // After the commit, so the audit log only ever records settlements that happened.
      await this.audit.record({
        actor: null,
        action: 'payment.settled',
        entityType: 'order',
        entityId: settledOrder._id.toString(),
        changes: {
          reference: payment.reference,
          provider,
          source,
          amount: verified.amount,
          currency: verified.currency,
          attention: attentionReasons,
        },
      });
      this.logger.log(
        `Order ${settledOrder.orderNumber} paid (${payment.reference}, ${provider}, ${source})`,
      );
      await this.sendClaimLinkIfGuest(settledOrder);
    }
  }

  /** Commit held print stock; for an order paid after expiry, take it again or flag it. */
  private async commitStock(
    order: OrderDocument,
    held: boolean,
    session: ClientSession,
  ): Promise<string[]> {
    const problems: string[] = [];
    for (const item of order.items.filter((i) => i.format === 'print')) {
      if (held) {
        const done = await this.books
          .updateOne(
            {
              _id: item.bookId,
              formats: {
                $elemMatch: {
                  type: 'print',
                  'print.stockReserved': { $gte: item.quantity },
                  'print.stockOnHand': { $gte: item.quantity },
                },
              },
            },
            {
              $inc: {
                'formats.$.print.stockReserved': -item.quantity,
                'formats.$.print.stockOnHand': -item.quantity,
              },
            },
            { session },
          )
          .exec();
        if (done.modifiedCount !== 1)
          problems.push(
            `Stock for "${item.titleSnapshot}" could not be committed; check the count.`,
          );
        continue;
      }
      // Paid after expiry: the hold was released, so take from what is free now.
      const book = await this.books
        .findById(item.bookId, { formats: 1 })
        .session(session)
        .lean()
        .exec();
      const print = book?.formats.find((f) => f.type === 'print')?.print;
      const free = print ? print.stockOnHand - print.stockReserved : 0;
      const taken =
        print && free >= item.quantity
          ? await this.books
              .updateOne(
                {
                  _id: item.bookId,
                  formats: {
                    $elemMatch: {
                      type: 'print',
                      'print.stockOnHand': print.stockOnHand,
                      'print.stockReserved': print.stockReserved,
                    },
                  },
                },
                { $inc: { 'formats.$.print.stockOnHand': -item.quantity } },
                { session },
              )
              .exec()
          : null;
      if (taken?.modifiedCount !== 1) {
        problems.push(
          `Paid after the order expired and "${item.titleSnapshot}" (print × ${item.quantity}) is now out of stock: ship later or refund.`,
        );
      }
    }
    return problems;
  }

  private async redeemCoupon(
    order: OrderDocument,
    held: boolean,
    session: ClientSession,
  ) {
    if (!order.coupon) return;
    const redemption = await this.redemptions
      .findOneAndUpdate(
        {
          orderId: order._id,
          status: held ? 'reserved' : { $in: ['reserved', 'released'] },
        },
        { $set: { status: 'redeemed' } },
        { session, returnDocument: 'before' },
      )
      .exec();
    // A hold released at expiry gave its use back; the payment honours the discount, so take it again.
    if (redemption?.status === 'released') {
      await this.coupons
        .updateOne(
          { _id: redemption.couponId },
          { $inc: { redemptionCount: 1 } },
          { session },
        )
        .exec();
    }
  }

  private async grantEbooks(
    order: OrderDocument,
    session: ClientSession,
  ): Promise<string[]> {
    const problems: string[] = [];
    for (const item of order.items.filter((i) => i.format === 'ebook')) {
      const existing = await this.entitlements
        .findOne({ userId: order.userId, bookId: item.bookId })
        .session(session)
        .exec();
      if (!existing) {
        await this.entitlements.create(
          [
            {
              userId: order.userId,
              bookId: item.bookId,
              orderId: order._id,
              grantedAt: new Date(),
            },
          ],
          { session },
        );
      } else if (existing.revokedAt) {
        await this.entitlements
          .updateOne(
            { _id: existing._id },
            {
              $set: {
                revokedAt: null,
                orderId: order._id,
                grantedAt: new Date(),
              },
            },
            { session },
          )
          .exec();
      } else if (!existing.orderId.equals(order._id)) {
        problems.push(
          `The buyer already owned the ebook "${item.titleSnapshot}" (order bought it twice): consider refunding it.`,
        );
      }
    }
    return problems;
  }

  /** Removes what was bought from the buyer's account cart and from the guest cart it came from. */
  private async clearPurchasedFromCart(
    order: OrderDocument,
    session: ClientSession,
  ) {
    const carts: Array<Record<string, unknown>> = [{ userId: order.userId }];
    if (order.guestCartId) carts.push({ guestId: order.guestCartId });
    for (const cart of carts) {
      // One plain $pull per bought line (no $or, which Mongoose's update casting can drop).
      for (const item of order.items) {
        await this.carts
          .updateOne(
            cart,
            { $pull: { items: { bookId: item.bookId, format: item.format } } },
            { session },
          )
          .exec();
      }
    }
  }

  private async queueSettlementEmails(
    order: OrderDocument,
    provider: Provider,
    attention: string[],
    session: ClientSession,
  ) {
    const m = (amount: number) => formatMoney(money(amount, order.currency));
    const user = await this.users
      .findById(order.userId, { accountStatus: 1 })
      .session(session)
      .lean()
      .exec();
    await this.mail.enqueue(
      {
        to: order.email,
        template: 'order.receipt',
        dedupeKey: `order-receipt:${order._id.toString()}`,
        data: {
          name: order.customerName.split(' ')[0] || order.customerName,
          orderNumber: order.orderNumber,
          paidAt:
            new Intl.DateTimeFormat('en-GB', {
              dateStyle: 'long',
              timeStyle: 'short',
              timeZone: 'UTC',
            }).format(new Date()) + ' UTC',
          paymentMethod: PROVIDER_LABEL[provider],
          items: order.items.map((i) => ({
            title: i.titleSnapshot,
            detail:
              i.format === 'ebook' ? 'Ebook (PDF)' : `Print × ${i.quantity}`,
            amount: m(i.lineTotal),
          })),
          subtotal: m(order.subtotal),
          discount: order.discountTotal > 0 ? m(order.discountTotal) : null,
          shipping: order.shippingAddress ? m(order.shippingTotal) : null,
          total: m(order.total),
          hasEbook: order.items.some((i) => i.format === 'ebook'),
          hasPrint: order.items.some((i) => i.format === 'print'),
          shippingTo: order.shippingAddress
            ? `${order.shippingAddress.city}, ${countryName(order.shippingAddress.country)}`
            : null,
          orderUrl: `${this.frontendUrl}/account/orders/${order.orderNumber}`,
          libraryUrl: order.items.some((i) => i.format === 'ebook')
            ? `${this.frontendUrl}/account/library`
            : null,
          claimPending: user?.accountStatus === 'unclaimed',
        },
        // The PDF invoice is built when the email is sent (InvoiceService).
        attachments: [{ kind: 'invoice', ref: order._id.toString() }],
      },
      session,
    );
    if (this.ownerEmail) {
      await this.mail.enqueue(
        {
          to: this.ownerEmail,
          template: 'order.new-sale',
          dedupeKey: `order-new-sale:${order._id.toString()}`,
          data: {
            orderNumber: order.orderNumber,
            customer: `${order.customerName} (${order.email})`,
            total: m(order.total),
            items: order.items.map(
              (i) =>
                `${i.titleSnapshot} (${i.format === 'ebook' ? 'ebook' : `print × ${i.quantity}`})`,
            ),
            adminUrl: `${this.frontendUrl}/admin/orders/${order.orderNumber}`,
          },
        },
        session,
      );
      if (attention.length) {
        await this.alertOwner(
          order,
          attention.join(' '),
          `settle:${order._id.toString()}`,
          session,
        );
      }
    }
  }

  private async sendClaimLinkIfGuest(order: OrderDocument) {
    try {
      const user = await this.users.findById(order.userId).exec();
      if (user?.accountStatus === 'unclaimed')
        await this.auth.sendClaimLink(user, order.orderNumber);
    } catch (error) {
      this.logger.warn(
        `Claim link for ${order.orderNumber} not sent: ${(error as Error).message}`,
      );
    }
  }

  /** Money arrived but can't be applied automatically: record, flag the order, alert the owner. */
  private async flagPayment(
    payment: PaymentDocument,
    reason: string,
    verified: { amount: number; currency: Currency } | null,
  ) {
    this.logger.error(
      `Payment ${payment.reference} needs reconciliation: ${reason}`,
    );
    await this.payments
      .updateOne(
        { _id: payment._id },
        {
          $set: {
            reconciliationRequired: true,
            reconciliationReason: reason,
            ...(verified
              ? {
                  verifiedAmount: verified.amount,
                  verifiedCurrency: verified.currency,
                }
              : {}),
          },
        },
      )
      .exec();
    const order = await this.orders
      .findOneAndUpdate(
        { _id: payment.orderId },
        { $set: { attention: { required: true, reason } } },
        { returnDocument: 'after' },
      )
      .exec();
    if (order)
      await this.alertOwner(order, reason, `payment:${payment.reference}`);
  }

  private async alertOwner(
    order: OrderDocument,
    reason: string,
    key: string,
    session?: ClientSession,
  ) {
    if (!this.ownerEmail) return;
    await this.mail.enqueue(
      {
        to: this.ownerEmail,
        template: 'order.payment-attention',
        dedupeKey: `order-attention:${key}`,
        data: {
          orderNumber: order.orderNumber,
          reason,
          adminUrl: `${this.frontendUrl}/admin/orders/${order.orderNumber}`,
        },
      },
      session,
    );
  }

  // ---------------------------------------------------------------- reconciliation

  /**
   * Every 5 minutes: payments still `initiated` for 10 minutes to 48 hours are checked with the
   * provider and settled (rescues a lost webhook). Older ones are closed as abandoned.
   */
  async reconcile(now: Date = new Date(), limit = 50): Promise<number> {
    const due = await this.payments
      .find({
        status: 'initiated',
        // A flagged payment (amount mismatch, second payment) waits for the owner, not for us.
        reconciliationRequired: { $ne: true },
        createdAt: {
          $lt: new Date(now.getTime() - 10 * 60_000),
          $gt: new Date(now.getTime() - 48 * 3_600_000),
        },
      })
      .sort({ createdAt: 1 })
      .limit(limit)
      .exec();
    let checked = 0;
    for (const payment of due) {
      const adapter = this.adapters.get(payment.provider);
      if (!adapter?.enabled) continue;
      try {
        await this.settle(
          payment.provider,
          await adapter.verify(
            payment.reference,
            payment.providerTransactionId,
          ),
          'reconcile',
        );
        checked += 1;
      } catch (error) {
        this.logger.warn(
          `Reconcile of ${payment.reference} inconclusive: ${(error as Error).message}`,
        );
      }
    }
    await this.payments
      .updateMany(
        {
          status: 'initiated',
          reconciliationRequired: { $ne: true },
          createdAt: { $lte: new Date(now.getTime() - 48 * 3_600_000) },
        },
        {
          $set: {
            status: 'abandoned',
            failureReason: 'Not completed within 48 hours',
          },
        },
      )
      .exec();
    return checked;
  }

  // ---------------------------------------------------------------- refunds

  /**
   * Two-phase refund (ARCHITECTURE §8.7): claim the refundable balance atomically (so it can never
   * be exceeded), call the provider with our refund id as idempotency key, then record the outcome.
   * An unknown outcome is NEVER retried automatically.
   */
  async refund(input: {
    orderNumber: string;
    amount: number;
    reason: string;
    actor: AccessTokenPayload;
  }) {
    const order = await this.orders
      .findOne({ orderNumber: input.orderNumber })
      .exec();
    if (!order?.payment)
      throw new NotFoundException('No paid order with that number');
    if (!Number.isSafeInteger(input.amount) || input.amount <= 0)
      throw new BadRequestException('Enter an amount to refund');
    const refundId = `RF-${randomBytes(12).toString('hex')}`;
    const claimed = await this.payments
      .findOneAndUpdate(
        {
          _id: order.payment.paymentId,
          status: { $in: ['succeeded', 'partially_refunded'] },
          $expr: {
            $gte: [
              {
                $subtract: [
                  '$amount',
                  {
                    $sum: {
                      $map: {
                        input: {
                          $filter: {
                            input: '$refunds',
                            cond: {
                              $in: [
                                '$$this.status',
                                ['pending', 'succeeded', 'outcome_unknown'],
                              ],
                            },
                          },
                        },
                        in: '$$this.amount',
                      },
                    },
                  },
                ],
              },
              input.amount,
            ],
          },
        },
        {
          $push: {
            refunds: {
              refundId,
              amount: input.amount,
              status: 'pending',
              reason: input.reason,
              requestedBy: `admin:${input.actor.sub}`,
              createdAt: new Date(),
            },
          },
        },
        { returnDocument: 'after' },
      )
      .exec();
    if (!claimed) {
      throw new ConflictException(
        'That is more than can still be refunded on this order (check pending refunds)',
      );
    }
    await this.audit.record({
      actor: { id: input.actor.sub, role: input.actor.role },
      action: 'refund.requested',
      entityType: 'order',
      entityId: order._id.toString(),
      changes: {
        refundId,
        amount: input.amount,
        currency: claimed.currency,
        reason: input.reason,
      },
    });

    try {
      const result = await this.adapter(claimed.provider).refund({
        reference: claimed.reference,
        providerTransactionId: claimed.providerTransactionId,
        providerChargeId: claimed.providerChargeId,
        amount: money(input.amount, claimed.currency),
        idempotencyKey: refundId,
        reason: input.reason,
      });
      if (result.status === 'rejected') {
        await this.setRefund(claimed._id, refundId, {
          status: 'failed',
          failureReason: result.message,
          resolvedAt: new Date(),
        });
        throw new BadRequestException(
          `The provider refused the refund: ${result.message}`,
        );
      }
      if (result.status === 'succeeded') {
        await this.finalizeRefund(
          claimed._id,
          refundId,
          result.providerRefundId,
        );
        return { refundId, status: 'succeeded' as const };
      }
      await this.setRefund(claimed._id, refundId, {
        providerRefundId: result.providerRefundId,
      });
      return { refundId, status: 'pending' as const };
    } catch (error) {
      // Our own "refused" answer passes through. ANY other error (a timeout, a 5xx, or something
      // unexpected) means we can't know whether money moved: never assume, never retry.
      if (error instanceof BadRequestException) throw error;
      if (!(error instanceof OutcomeUnknownError)) {
        this.logger.error(
          `Refund ${refundId} hit an unexpected error: ${(error as Error).message}`,
        );
      }
      const reason = `Refund ${refundId} of ${formatMoney(money(input.amount, claimed.currency))}: the provider did not confirm. Check its dashboard before doing anything; it is not retried automatically.`;
      await this.setRefund(claimed._id, refundId, {
        status: 'outcome_unknown',
      });
      await this.flagPayment(claimed, reason, null);
      return { refundId, status: 'outcome_unknown' as const };
    }
  }

  private async setRefund(
    paymentId: Types.ObjectId,
    refundId: string,
    set: Record<string, unknown>,
  ) {
    const $set = Object.fromEntries(
      Object.entries(set).map(([k, v]) => [`refunds.$.${k}`, v]),
    );
    await this.payments
      .updateOne({ _id: paymentId, 'refunds.refundId': refundId }, { $set })
      .exec();
  }

  /** A refund confirmed by the provider: payment, order status and totals, entitlements. */
  private async finalizeRefund(
    paymentId: Types.ObjectId,
    refundId: string,
    providerRefundId: string | null,
  ) {
    await this.inTransaction(async (session) => {
      const payment = await this.payments
        .findOneAndUpdate(
          {
            _id: paymentId,
            refunds: {
              $elemMatch: {
                refundId,
                status: { $in: ['pending', 'outcome_unknown'] },
              },
            },
          },
          {
            $set: {
              'refunds.$.status': 'succeeded',
              'refunds.$.resolvedAt': new Date(),
              ...(providerRefundId
                ? { 'refunds.$.providerRefundId': providerRefundId }
                : {}),
            },
          },
          { session, returnDocument: 'after' },
        )
        .exec();
      if (!payment) return; // already finalized
      await this.applyRefundTotals(payment, session);
      await this.queueRefundEmail(payment, refundId, session);
    });
  }

  /** Tells the buyer about a confirmed refund, once per refund (PRODUCT_RULES §10). */
  private async queueRefundEmail(
    payment: PaymentDocument,
    refundId: string,
    session: ClientSession,
  ) {
    const refund = payment.refunds.find((r) => r.refundId === refundId);
    const order = await this.orders
      .findById(payment.orderId)
      .session(session)
      .exec();
    if (!refund || !order) return;
    const full = order.status === 'refunded';
    await this.mail.enqueue(
      {
        to: order.email,
        template: 'order.refund-issued',
        dedupeKey: `refund-issued:${refundId}`,
        data: {
          name: order.customerName.split(' ')[0] || order.customerName,
          orderNumber: order.orderNumber,
          amount: formatMoney(money(refund.amount, payment.currency)),
          kind: full ? 'Full refund' : 'Partial refund',
          paymentMethod: PROVIDER_LABEL[payment.provider],
          // A full refund removes the order's ebooks from the library (§8.7).
          ebooksRemoved: full
            ? order.items
                .filter((i) => i.format === 'ebook')
                .map((i) => i.titleSnapshot)
            : [],
          orderUrl: `${this.frontendUrl}/account/orders/${order.orderNumber}`,
        },
      },
      session,
    );
  }

  /** Recomputes payment and order refund state from the succeeded refunds (idempotent). */
  private async applyRefundTotals(
    payment: PaymentDocument,
    session: ClientSession,
  ) {
    const refunded = sum(
      payment.refunds
        .filter((r) => r.status === 'succeeded')
        .map((r) => money(r.amount, payment.currency)),
      payment.currency,
    ).amount;
    const full = refunded >= payment.amount;
    await this.payments
      .updateOne(
        { _id: payment._id },
        { $set: { status: full ? 'refunded' : 'partially_refunded' } },
        { session },
      )
      .exec();
    const order = await this.orders
      .findById(payment.orderId)
      .session(session)
      .exec();
    if (!order) return;
    const event = full ? 'refund_full' : 'refund_partial';
    const next = fromStatuses(event).includes(order.status)
      ? transition(order.status, event)
      : order.status;
    await this.orders
      .updateOne(
        { _id: order._id },
        {
          $set: { refundedTotal: refunded, status: next },
          ...(next !== order.status
            ? {
                $push: {
                  statusHistory: {
                    status: next,
                    at: new Date(),
                    by: 'system',
                    note: `Refunded ${formatMoney(money(refunded, order.currency))}`,
                  },
                },
              }
            : {}),
        },
        { session },
      )
      .exec();
    if (full) {
      // A full refund removes the ebooks this order granted (ARCHITECTURE §8.7).
      await this.entitlements
        .updateMany(
          { orderId: order._id, revokedAt: null },
          { $set: { revokedAt: new Date() } },
          { session },
        )
        .exec();
    }
  }

  /** Provider-side refund events: confirm our pending refunds, or record one made outside the app. */
  private async applyProviderRefund(
    provider: Provider,
    event: Extract<WebhookEnvelope, { kind: 'refund' }>,
  ) {
    const payment = await this.findPayment(
      provider,
      event.reference,
      event.providerTransactionId,
    );
    if (!payment) return;
    if (event.status === 'failed') {
      const target = payment.refunds.find(
        (r) =>
          r.providerRefundId &&
          r.providerRefundId === event.providerRefundId &&
          r.status === 'pending',
      );
      if (target)
        await this.setRefund(payment._id, target.refundId, {
          status: 'failed',
          failureReason: 'Failed at the provider',
          resolvedAt: new Date(),
        });
      return;
    }
    if (!event.amount || event.amount.currency !== payment.currency) return;

    const succeeded = sum(
      payment.refunds
        .filter((r) => r.status === 'succeeded')
        .map((r) => money(r.amount, payment.currency)),
      payment.currency,
    );
    const open = payment.refunds.filter(
      (r) => r.status === 'pending' || r.status === 'outcome_unknown',
    );
    let unexplained: number;
    if (event.cumulative) {
      // The provider's running total, minus what we already recorded as refunded.
      let left = subtract(event.amount, succeeded);
      for (const refund of open) {
        const amount = money(refund.amount, payment.currency);
        if (amount.amount <= left.amount) {
          await this.finalizeRefund(payment._id, refund.refundId, null);
          left = subtract(left, amount);
        }
      }
      unexplained = left.amount;
    } else {
      const match =
        open.find(
          (r) =>
            event.providerRefundId &&
            r.providerRefundId === event.providerRefundId,
        ) ?? open.find((r) => r.amount === event.amount!.amount);
      if (match) {
        await this.finalizeRefund(
          payment._id,
          match.refundId,
          event.providerRefundId,
        );
        unexplained = 0;
      } else {
        unexplained = event.amount.amount;
      }
    }
    if (unexplained > 0) {
      // Refunded in the provider's dashboard (or a chargeback): record it and tell the owner.
      const refundId = `RF-EXT-${randomBytes(8).toString('hex')}`;
      await this.payments
        .updateOne(
          { _id: payment._id },
          {
            $push: {
              refunds: {
                refundId,
                providerRefundId: event.providerRefundId,
                amount: unexplained,
                status: 'pending',
                reason: 'Refunded outside the app',
                requestedBy: 'provider',
                createdAt: new Date(),
              },
            },
          },
        )
        .exec();
      await this.finalizeRefund(payment._id, refundId, event.providerRefundId);
      await this.flagPayment(
        payment,
        `${formatMoney(money(unexplained, payment.currency))} was refunded outside the app (in the provider dashboard or by the bank). It is now recorded; check whether ebooks or shipping need action.`,
        null,
      );
    }
  }

  private async flagDispute(
    provider: Provider,
    event: Extract<WebhookEnvelope, { kind: 'dispute' }>,
  ) {
    const payment = await this.findPayment(
      provider,
      event.reference,
      event.providerTransactionId,
    );
    if (!payment) return;
    await this.flagPayment(
      payment,
      `The buyer's bank opened a dispute (${event.reason}). Respond in the ${PROVIDER_LABEL[provider]} dashboard before the deadline.`,
      null,
    );
  }

  private findPayment(
    provider: Provider,
    reference: string | null,
    providerTransactionId: string | null,
  ) {
    const or: Array<Record<string, string>> = [];
    if (reference) or.push({ reference });
    if (providerTransactionId)
      or.push(
        { providerTransactionId },
        { providerChargeId: providerTransactionId },
      );
    if (!or.length) return Promise.resolve(null);
    return this.payments.findOne({ provider, $or: or }).exec();
  }

  // ---------------------------------------------------------------- reading

  /** Payments of an order, for the admin order page. */
  async forOrder(orderId: Types.ObjectId) {
    const payments = await this.payments
      .find({ orderId })
      .sort({ createdAt: -1 })
      .exec();
    return payments.map((p) => ({
      reference: p.reference,
      provider: p.provider,
      status: p.status,
      amount: p.amount,
      currency: p.currency,
      verifiedAmount: p.verifiedAmount,
      failureReason: p.failureReason,
      reconciliationRequired: p.reconciliationRequired,
      reconciliationReason: p.reconciliationReason,
      createdAt: (p as unknown as { createdAt: Date }).createdAt.toISOString(),
      succeededAt: p.succeededAt?.toISOString() ?? null,
      refunds: p.refunds.map((r) => ({
        refundId: r.refundId,
        amount: r.amount,
        status: r.status,
        reason: r.reason,
        requestedBy: r.requestedBy.startsWith('admin:')
          ? 'admin'
          : r.requestedBy,
        createdAt: r.createdAt.toISOString(),
        failureReason: r.failureReason,
      })),
    }));
  }

  private async findOrder(
    orderNumber: string,
    actor: AccessTokenPayload | null,
    checkoutKey?: string,
  ) {
    const order = await this.orders
      .findOne({ orderNumber })
      .select('+checkoutKeyHash')
      .exec();
    const allowed =
      order &&
      (actor
        ? order.userId.toString() === actor.sub
        : !!checkoutKey && order.checkoutKeyHash === hashToken(checkoutKey));
    if (!order || !allowed) throw new NotFoundException('Order not found');
    return order;
  }

  private async inTransaction<T>(
    work: (session: ClientSession) => Promise<T>,
  ): Promise<T> {
    const session = await this.connection.startSession();
    try {
      return await session.withTransaction(() => work(session));
    } finally {
      await session.endSession();
    }
  }
}

/**
 * Only the "one settled payment per order" index means a double payment. Any other duplicate key
 * (for example two settlements racing on an ebook entitlement) is rethrown and retried later by
 * reconciliation, never misreported as a second payment.
 */
export function isSecondPaymentError(error: unknown): boolean {
  const e = error as { code?: number; errmsg?: string; message?: string };
  // MongoDB names the violated index in the message ("… index: one_settled_payment_per_order …").
  return (
    e.code === DUPLICATE_KEY &&
    `${e.errmsg ?? ''} ${e.message ?? ''}`.includes(
      'one_settled_payment_per_order',
    )
  );
}

class OrderNotPayableError extends Error {
  constructor(orderId: Types.ObjectId) {
    super(`Order ${orderId.toString()} is not in a payable state`);
  }
}
