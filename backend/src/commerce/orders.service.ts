import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectConnection, InjectModel } from '@nestjs/mongoose';
import {
  Types,
  type ClientSession,
  type Connection,
  type Model,
} from 'mongoose';
import type { AccessTokenPayload } from '../auth/interfaces/auth.types.js';
import { hashToken } from '../common/crypto/tokens.js';
import type { Currency } from '../common/money/currency.js';
import { formatMoney, money } from '../common/money/money.js';
import { Book } from '../catalog/schemas/book.schema.js';
import { MailService } from '../mail/mail.service.js';
import { User } from '../users/schemas/user.schema.js';
import { normaliseEmail, UsersService } from '../users/users.service.js';
import { CartService, type CartOwner } from './cart.service.js';
import { CouponsService } from './coupons.service.js';
import { transition, type OrderEvent } from './order-state-machine.js';
import type { Quote } from './pricing.js';
import { PricingService } from './pricing.service.js';
import {
  Counter,
  Order,
  type OrderDocument,
  type OrderItem,
  type ShippingAddress,
} from './schemas/order.schema.js';

/** How long stock and the coupon are held for payment (PRODUCT_RULES §6). */
export const PAYMENT_WINDOW_MS = 30 * 60_000;
const DUPLICATE_KEY = 11000;

export interface PlaceOrderInput {
  owner: CartOwner;
  actor: AccessTokenPayload | null;
  /** The browser's random idempotency key (also the guest's proof of access). */
  checkoutKey: string;
  currency: Currency;
  email?: string;
  name?: string;
  shippingAddress?: ShippingAddress;
  couponCode?: string;
  returnPath?: string;
  now?: Date;
}

export class CheckoutProblemsException extends BadRequestException {
  constructor(problems: string[], message = 'Your order needs a change') {
    super({ message, problems, code: 'checkout_problems' });
  }
}

/** Only same-site relative paths, never `//host` or a full URL (no open redirect after paying). */
export function safeReturnPath(path: string | undefined): string | null {
  if (!path) return null;
  return /^\/(?!\/)[\w\-/.?=&%]*$/.test(path) && path.length <= 300
    ? path
    : null;
}

/** Orders: placement, viewing, cancelling and expiry (ARCHITECTURE §8.2–8.4). */
@Injectable()
export class OrdersService {
  private readonly logger = new Logger(OrdersService.name);
  private readonly frontendUrl: string;

  constructor(
    @InjectConnection() private readonly connection: Connection,
    @InjectModel(Order.name) private readonly orders: Model<Order>,
    @InjectModel(Counter.name) private readonly counters: Model<Counter>,
    @InjectModel(Book.name) private readonly books: Model<Book>,
    @InjectModel(User.name) private readonly users: Model<User>,
    private readonly usersService: UsersService,
    private readonly pricing: PricingService,
    private readonly coupons: CouponsService,
    private readonly cart: CartService,
    private readonly mail: MailService,
    config: ConfigService,
  ) {
    this.frontendUrl = (config.get<string>('FRONTEND_URL') ?? '').replace(
      /\/$/,
      '',
    );
  }

  // ---------------------------------------------------------------- placing

  async place(
    input: PlaceOrderInput,
  ): Promise<{ order: OrderDocument; created: boolean }> {
    if (!/^[A-Za-z0-9_-]{22,100}$/.test(input.checkoutKey)) {
      throw new BadRequestException(
        'A checkout key (Idempotency-Key header) is required',
      );
    }
    const keyHash = hashToken(input.checkoutKey);
    const existing = await this.byKey(keyHash);
    if (existing)
      return { order: this.assertSameBuyer(existing, input), created: false };

    const items = await this.cart.items(input.owner);
    if (items.length === 0)
      throw new CheckoutProblemsException(['Your cart is empty']);

    const now = input.now ?? new Date();
    try {
      const order = await this.inTransaction(async (session) => {
        const buyer = await this.buyer(input, session);
        const quote = await this.pricing.quote({
          currency: input.currency,
          items,
          userId: buyer._id.toString(),
          email: buyer.email,
          shippingCountry: input.shippingAddress?.country ?? null,
          couponCode: input.couponCode ?? null,
          now,
          session,
        });
        this.assertPlaceable(quote, input);

        // One open checkout per buyer: an older unpaid order is replaced (its holds released).
        const older = await this.orders
          .find({ userId: buyer._id, status: 'pending_payment' })
          .session(session)
          .exec();
        for (const order of older) {
          await this.close(
            order,
            'cancel',
            'system',
            'Replaced by a newer checkout',
            session,
          );
        }

        const orderId = new Types.ObjectId();
        for (const line of quote.lines.filter((l) => l.format === 'print')) {
          await this.reserveStock(line.bookId, line.quantity, session);
        }
        if (quote.coupon?.applied && quote.coupon.couponId) {
          const held = await this.coupons.reserve(
            quote.coupon.couponId,
            { orderId, email: buyer.email, userId: buyer._id },
            session,
          );
          if (!held)
            throw new CheckoutProblemsException([
              `${quote.coupon.code}: This code has just been fully used`,
            ]);
        }

        const year = now.getUTCFullYear();
        const counter = await this.counters
          .findOneAndUpdate(
            { _id: `order:${year}` },
            { $inc: { seq: 1 } },
            { upsert: true, returnDocument: 'after', session },
          )
          .exec();
        const orderNumber = `BS-${year}-${String(counter!.seq).padStart(6, '0')}`;

        const orderItems: OrderItem[] = quote.lines.map((line) => ({
          bookId: new Types.ObjectId(line.bookId),
          format: line.format,
          sku: line.sku!,
          titleSnapshot: line.title,
          coverSnapshot: line.cover,
          slugSnapshot: line.slug,
          unitAmount: line.unitAmount!,
          quantity: line.quantity,
          lineTotal: line.lineTotal,
        }));
        const [created] = await this.orders.create(
          [
            {
              _id: orderId,
              orderNumber,
              userId: buyer._id,
              email: buyer.email,
              customerName: buyer.name,
              currency: input.currency,
              items: orderItems,
              subtotal: quote.subtotal,
              discountTotal: quote.discountTotal,
              shippingTotal: quote.shippingTotal,
              taxTotal: quote.taxTotal,
              total: quote.total,
              coupon:
                quote.coupon?.applied && quote.coupon.couponId
                  ? {
                      code: quote.coupon.code,
                      couponId: new Types.ObjectId(quote.coupon.couponId),
                    }
                  : null,
              shippingAddress: quote.requiresShipping
                ? input.shippingAddress
                : null,
              shippingZoneId: quote.shipping.zoneId
                ? new Types.ObjectId(quote.shipping.zoneId)
                : null,
              shippingEstimate: quote.shipping.estimatedDays,
              status: 'pending_payment',
              shipment: {
                status: quote.requiresShipping ? 'pending' : 'not_required',
              },
              expiresAt: new Date(now.getTime() + PAYMENT_WINDOW_MS),
              checkoutKeyHash: keyHash,
              returnPath: safeReturnPath(input.returnPath),
              statusHistory: [
                {
                  status: 'pending_payment',
                  at: now,
                  by: 'customer',
                  note: '',
                },
              ],
            },
          ],
          { session },
        );
        return created;
      });
      return { order, created: true };
    } catch (error) {
      // Two identical requests at once: the loser hits the unique key and returns the winner's order.
      if ((error as { code?: number }).code === DUPLICATE_KEY) {
        const winner = await this.byKey(keyHash);
        if (winner)
          return { order: this.assertSameBuyer(winner, input), created: false };
      }
      throw error;
    }
  }

  private assertPlaceable(quote: Quote, input: PlaceOrderInput): void {
    const problems = [...quote.problems];
    if (input.couponCode?.trim() && quote.coupon && !quote.coupon.applied) {
      problems.push(`${quote.coupon.code}: ${quote.coupon.message}`);
    }
    if (quote.requiresShipping && !input.shippingAddress) {
      problems.push('Add a shipping address for your print copy');
    }
    if (problems.length) throw new CheckoutProblemsException(problems);
  }

  /** The signed-in buyer, or the guest's account (found or created unclaimed). */
  private async buyer(input: PlaceOrderInput, session: ClientSession) {
    if (input.actor) {
      const user = await this.users
        .findById(input.actor.sub)
        .session(session)
        .exec();
      if (!user) throw new ForbiddenException('Please sign in again');
      return user;
    }
    const email = input.email?.trim();
    const name = input.name?.trim();
    if (!email || !name) {
      throw new CheckoutProblemsException([
        'Enter your name and email so we can send your receipt',
      ]);
    }
    // An existing account with this email is used as is (we don't reveal that it exists): the
    // receipt tells them to sign in to see the order (ARCHITECTURE §8.2).
    return this.usersService.findOrCreateForGuest(email, name, session);
  }

  /** A retried key must come from the same buyer; anything else is refused, not merged. */
  private assertSameBuyer(
    order: OrderDocument,
    input: PlaceOrderInput,
  ): OrderDocument {
    const sameUser = input.actor && order.userId.toString() === input.actor.sub;
    const sameGuest =
      !input.actor &&
      input.email &&
      normaliseEmail(input.email) === order.email;
    if (!sameUser && !sameGuest) {
      throw new ConflictException(
        'This checkout key was already used. Please start again.',
      );
    }
    return order;
  }

  // ---------------------------------------------------------------- stock

  /**
   * Holds print copies, inside the order transaction. The update only matches the exact stock
   * values just read, so a concurrent checkout can't oversell; it fails instead.
   */
  private async reserveStock(
    bookId: string,
    quantity: number,
    session: ClientSession,
  ) {
    const book = await this.books
      .findById(bookId, { formats: 1, title: 1 })
      .session(session)
      .lean()
      .exec();
    const print = book?.formats.find((f) => f.type === 'print')?.print;
    if (!book || !print || print.stockOnHand - print.stockReserved < quantity) {
      throw new CheckoutProblemsException([
        `${book?.title ?? 'A book'}: Sorry, the print edition just sold out`,
      ]);
    }
    const held = await this.books
      .updateOne(
        {
          _id: book._id,
          formats: {
            $elemMatch: {
              type: 'print',
              'print.stockOnHand': print.stockOnHand,
              'print.stockReserved': print.stockReserved,
            },
          },
        },
        { $inc: { 'formats.$.print.stockReserved': quantity } },
        { session },
      )
      .exec();
    if (held.modifiedCount !== 1) {
      throw new CheckoutProblemsException([
        `${book.title}: Stock changed while you were checking out; please try again`,
      ]);
    }
  }

  private async releaseStock(order: OrderDocument, session: ClientSession) {
    for (const item of order.items.filter((i) => i.format === 'print')) {
      await this.books
        .updateOne(
          {
            _id: item.bookId,
            formats: {
              $elemMatch: {
                type: 'print',
                'print.stockReserved': { $gte: item.quantity },
              },
            },
          },
          { $inc: { 'formats.$.print.stockReserved': -item.quantity } },
          { session },
        )
        .exec();
    }
  }

  // ---------------------------------------------------------------- closing (cancel / expire)

  /**
   * Moves an unpaid order to `cancelled` or `expired` and releases its holds. The status change
   * is a conditional update, so the holds are released exactly once even if two actors race.
   */
  private async close(
    order: OrderDocument,
    event: Extract<OrderEvent, 'cancel' | 'expire'>,
    by: string,
    note: string,
    session: ClientSession,
  ): Promise<boolean> {
    const to = transition('pending_payment', event);
    const now = new Date();
    const updated = await this.orders
      .updateOne(
        { _id: order._id, status: 'pending_payment' },
        {
          $set: { status: to, expiresAt: null },
          $push: { statusHistory: { status: to, at: now, by, note } },
        },
        { session },
      )
      .exec();
    if (updated.modifiedCount !== 1) return false;
    await this.releaseStock(order, session);
    await this.coupons.release(order._id, session);
    return true;
  }

  async cancel(order: OrderDocument, by: string): Promise<OrderDocument> {
    if (order.status !== 'pending_payment') {
      throw new ConflictException('Only an unpaid order can be cancelled');
    }
    await this.inTransaction((session) =>
      this.close(order, 'cancel', by, 'Cancelled by the customer', session),
    );
    return (await this.orders.findById(order._id).exec())!;
  }

  /**
   * Expires unpaid orders past their window (run every minute by OrderExpiryJob) and sends one
   * "complete your order" email each. BS-8 adds: skip orders with a payment attempt started in
   * the last 15 minutes (the buyer may still be on the provider's page).
   */
  async expireDue(now: Date = new Date(), limit = 50): Promise<number> {
    const due = await this.orders
      .find({ status: 'pending_payment', expiresAt: { $lt: now } })
      .sort({ expiresAt: 1 })
      .limit(limit)
      .exec();
    let expired = 0;
    for (const order of due) {
      // The status change and the reminder are one unit: both happen, or neither (no lost or
      // doubled email if the job crashes in between).
      const done = await this.inTransaction(async (session) => {
        const closed = await this.close(
          order,
          'expire',
          'system',
          'Payment window ended',
          session,
        );
        if (closed) await this.queueCompleteYourOrder(order, session);
        return closed;
      });
      if (done) expired += 1;
    }
    return expired;
  }

  private async queueCompleteYourOrder(
    order: OrderDocument,
    session: ClientSession,
  ): Promise<void> {
    await this.mail.enqueue(
      {
        to: order.email,
        template: 'order.complete-your-order',
        dedupeKey: `order-complete-your-order:${order._id.toString()}`,
        data: {
          name: order.customerName.split(' ')[0] || order.customerName,
          orderNumber: order.orderNumber,
          items: order.items.map(
            (i) =>
              `${i.titleSnapshot} (${i.format === 'ebook' ? 'ebook' : `print × ${i.quantity}`})`,
          ),
          total: formatMoney(money(order.total, order.currency)),
          cartUrl: `${this.frontendUrl}/cart`,
        },
      },
      session,
    );
    await this.orders
      .updateOne(
        { _id: order._id },
        { $set: { completeOrderEmailSent: true } },
        { session },
      )
      .exec();
  }

  // ---------------------------------------------------------------- reading

  listForUser(userId: string): Promise<OrderDocument[]> {
    return this.orders
      .find({ userId: new Types.ObjectId(userId) })
      .sort({ createdAt: -1 })
      .limit(100)
      .exec();
  }

  async forUser(orderNumber: string, userId: string): Promise<OrderDocument> {
    const order = await this.orders.findOne({ orderNumber }).exec();
    // Someone else's order looks exactly like a missing one.
    if (!order || order.userId.toString() !== userId)
      throw new NotFoundException('Order not found');
    return order;
  }

  /** A guest's order, proven by the checkout key from their browser. */
  async forGuest(
    orderNumber: string,
    checkoutKey: string,
  ): Promise<OrderDocument> {
    const order = await this.orders
      .findOne({ orderNumber, checkoutKeyHash: hashToken(checkoutKey) })
      .exec();
    if (!order) throw new NotFoundException('Order not found');
    return order;
  }

  // ---------------------------------------------------------------- helpers

  private byKey(keyHash: string) {
    return this.orders.findOne({ checkoutKeyHash: keyHash }).exec();
  }

  private async inTransaction<T>(
    work: (session: ClientSession) => Promise<T>,
  ): Promise<T> {
    const session = await this.connection.startSession();
    try {
      return await session.withTransaction(() => work(session));
    } catch (error) {
      const message = (error as Error).message ?? '';
      if (/Transaction numbers are only allowed|replica set/i.test(message)) {
        this.logger.error(
          'MongoDB is not a replica set; checkout needs transactions (DEPLOYMENT §2).',
        );
        throw new ServiceUnavailableException(
          'Checkout is temporarily unavailable. Please try again shortly.',
        );
      }
      throw error;
    } finally {
      await session.endSession();
    }
  }
}
