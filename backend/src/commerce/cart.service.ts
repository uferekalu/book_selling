import {
  BadRequestException,
  ConflictException,
  Injectable,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Types, type Model } from 'mongoose';
import type { Currency } from '../common/money/currency.js';
import { randomToken } from '../common/crypto/tokens.js';
import { isObjectId } from '../common/utils/object-id.js';
import type { FormatType } from '../catalog/schemas/book.schema.js';
import type { QuoteLine } from './pricing.js';
import { PricingService } from './pricing.service.js';
import {
  Cart,
  GUEST_CART_DAYS,
  MAX_CART_LINES,
  type CartDocument,
  type CartItem,
} from './schemas/cart.schema.js';

export interface CartOwner {
  userId: string | null;
  guestId: string | null;
}

export interface CartLineView extends QuoteLine {
  /** The price when it was added, if different from now (same currency only). */
  priceWas: number | null;
}

export interface CartView {
  currency: Currency;
  lines: CartLineView[];
  subtotal: number;
  /** Copies of everything that can be bought now. */
  itemCount: number;
  /** Lines that need attention before checkout, in words. */
  problems: string[];
}

const DAY_MS = 86_400_000;
const MAX_QUANTITY = 50;

/** Carts for guests and signed-in buyers (ARCHITECTURE §4.3). Prices are never stored here. */
@Injectable()
export class CartService {
  constructor(
    @InjectModel(Cart.name) private readonly carts: Model<Cart>,
    private readonly pricing: PricingService,
  ) {}

  newGuestId(): string {
    return randomToken(24);
  }

  /**
   * The owner's cart, after folding in a guest cart when a guest has just signed in. Returns
   * null when there is none yet (nothing is created just by looking).
   */
  async find(owner: CartOwner): Promise<CartDocument | null> {
    if (owner.userId && owner.guestId)
      await this.merge(owner.guestId, owner.userId);
    if (owner.userId) {
      return this.carts
        .findOne({ userId: new Types.ObjectId(owner.userId) })
        .exec();
    }
    if (owner.guestId)
      return this.carts.findOne({ guestId: owner.guestId }).exec();
    return null;
  }

  async view(owner: CartOwner, currency: Currency): Promise<CartView> {
    const cart = await this.find(owner);
    return this.present(cart?.items ?? [], currency, owner.userId);
  }

  async add(
    owner: CartOwner,
    item: { bookId: string; format: FormatType; quantity: number },
    currency: Currency,
  ): Promise<CartView> {
    if (!isObjectId(item.bookId)) throw new BadRequestException('Unknown book');
    // Validate against the live catalogue (and the buyer's library) before storing anything.
    const check = await this.pricing.quote({
      currency,
      items: [{ ...item, quantity: 1 }],
      userId: owner.userId,
      email: null,
      shippingCountry: null,
      couponCode: null,
    });
    const line = check.lines[0];
    if (line.status === 'owned') {
      throw new ConflictException('This ebook is already in your library');
    }
    if (line.status === 'unavailable' || line.status === 'no_price') {
      throw new BadRequestException(
        line.message ?? 'This item is not available',
      );
    }
    if (line.status === 'out_of_stock') {
      throw new ConflictException('Sorry, the print edition is out of stock');
    }

    const cart =
      (await this.find(owner)) ?? new this.carts(this.ownerFields(owner));
    const existing = cart.items.find(
      (i) => i.bookId.toString() === item.bookId && i.format === item.format,
    );
    if (existing) {
      existing.quantity =
        item.format === 'ebook'
          ? 1
          : Math.min(MAX_QUANTITY, existing.quantity + item.quantity);
    } else {
      if (cart.items.length >= MAX_CART_LINES) {
        throw new BadRequestException('Your cart is full');
      }
      cart.items.push({
        bookId: new Types.ObjectId(item.bookId),
        format: item.format,
        quantity:
          item.format === 'ebook' ? 1 : Math.min(MAX_QUANTITY, item.quantity),
        addedAt: new Date(),
        seenAmount: line.unitAmount,
        seenCurrency: currency,
      });
    }
    this.touch(cart, owner, currency);
    await cart.save();
    return this.present(cart.items, currency, owner.userId);
  }

  async setQuantity(
    owner: CartOwner,
    item: { bookId: string; format: FormatType; quantity: number },
    currency: Currency,
  ): Promise<CartView> {
    const cart = await this.find(owner);
    const existing = cart?.items.find(
      (i) => i.bookId.toString() === item.bookId && i.format === item.format,
    );
    if (!cart || !existing) return this.view(owner, currency);
    if (item.quantity <= 0) {
      cart.items = cart.items.filter((i) => i !== existing);
    } else {
      existing.quantity =
        item.format === 'ebook' ? 1 : Math.min(MAX_QUANTITY, item.quantity);
    }
    this.touch(cart, owner, currency);
    await cart.save();
    return this.present(cart.items, currency, owner.userId);
  }

  remove(
    owner: CartOwner,
    bookId: string,
    format: FormatType,
    currency: Currency,
  ) {
    return this.setQuantity(owner, { bookId, format, quantity: 0 }, currency);
  }

  async clear(owner: CartOwner): Promise<void> {
    const cart = await this.find(owner);
    if (cart) {
      cart.items = [];
      await cart.save();
    }
  }

  /** Items for pricing (checkout and order placement). */
  async items(owner: CartOwner) {
    const cart = await this.find(owner);
    return (cart?.items ?? []).map((i) => ({
      bookId: i.bookId.toString(),
      format: i.format,
      quantity: i.quantity,
    }));
  }

  /** Moves a guest cart into the user's cart on sign-in, then deletes the guest cart. */
  async merge(guestId: string, userId: string): Promise<void> {
    const guest = await this.carts.findOneAndDelete({ guestId }).exec();
    if (!guest || guest.items.length === 0) return;
    const userObjectId = new Types.ObjectId(userId);
    const cart =
      (await this.carts.findOne({ userId: userObjectId }).exec()) ??
      new this.carts({
        userId: userObjectId,
        items: [],
        currency: guest.currency,
      });
    for (const item of guest.items) {
      const existing = cart.items.find(
        (i) => i.bookId.equals(item.bookId) && i.format === item.format,
      );
      if (existing) {
        if (item.format === 'print') {
          existing.quantity = Math.min(
            MAX_QUANTITY,
            existing.quantity + item.quantity,
          );
        }
      } else if (cart.items.length < MAX_CART_LINES) {
        cart.items.push(item);
      }
    }
    cart.expiresAt = null;
    await cart.save();
  }

  private ownerFields(owner: CartOwner) {
    return owner.userId
      ? { userId: new Types.ObjectId(owner.userId), items: [] as CartItem[] }
      : { guestId: owner.guestId ?? undefined, items: [] as CartItem[] };
  }

  private touch(cart: CartDocument, owner: CartOwner, currency: Currency) {
    cart.currency = currency;
    cart.expiresAt = owner.userId
      ? null
      : new Date(Date.now() + GUEST_CART_DAYS * DAY_MS);
  }

  private async present(
    items: CartItem[],
    currency: Currency,
    userId: string | null,
  ): Promise<CartView> {
    const quote = await this.pricing.quote({
      currency,
      items: items.map((i) => ({
        bookId: i.bookId.toString(),
        format: i.format,
        quantity: i.quantity,
      })),
      userId,
      email: null,
      shippingCountry: null,
      couponCode: null,
    });
    const lines = quote.lines.map((line, index) => {
      const stored = items[index];
      const changed =
        stored.seenCurrency === currency &&
        stored.seenAmount !== null &&
        line.unitAmount !== null &&
        stored.seenAmount !== line.unitAmount;
      return { ...line, priceWas: changed ? stored.seenAmount : null };
    });
    return {
      currency,
      lines,
      subtotal: quote.subtotal,
      itemCount: lines
        .filter((l) => l.status === 'ok')
        .reduce((n, l) => n + l.quantity, 0),
      problems: lines
        .filter((l) => l.status !== 'ok')
        .map((l) => `${l.title}: ${l.message}`),
    };
  }
}
