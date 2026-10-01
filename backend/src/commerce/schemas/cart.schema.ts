import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Types, type HydratedDocument } from 'mongoose';
import { CURRENCIES, type Currency } from '../../common/money/currency.js';
import {
  FORMAT_TYPES,
  type FormatType,
} from '../../catalog/schemas/book.schema.js';

export const MAX_CART_LINES = 30;
export const GUEST_CART_DAYS = 30;

@Schema({ _id: false })
export class CartItem {
  @Prop({ type: Types.ObjectId, required: true }) bookId: Types.ObjectId;
  @Prop({ type: String, enum: FORMAT_TYPES, required: true })
  format: FormatType;
  @Prop({ type: Number, required: true, min: 1, max: 50 }) quantity: number;
  @Prop({ type: Date, required: true }) addedAt: Date;
  /**
   * The price shown when the item was added, ONLY to tell the buyer "the price changed since you
   * added this". It is never used to charge: every cart read re-prices from the catalogue.
   */
  @Prop({ type: Number, default: null }) seenAmount: number | null;
  @Prop({ type: String, enum: CURRENCIES, default: null })
  seenCurrency: Currency | null;
}
const CartItemSchema = SchemaFactory.createForClass(CartItem);

/** One cart per signed-in user or per guest browser (ARCHITECTURE §4.3). Stores no prices. */
@Schema({ collection: 'carts', timestamps: true })
export class Cart {
  @Prop({ type: Types.ObjectId }) userId?: Types.ObjectId;
  /** Random id from the httpOnly `bs_cart` cookie. */
  @Prop({ type: String }) guestId?: string;
  @Prop({ type: [CartItemSchema], default: [] }) items: CartItem[];
  @Prop({ type: String, enum: CURRENCIES, default: 'USD' }) currency: Currency;
  /** Guests' carts expire (TTL); users' carts are kept. */
  @Prop({ type: Date, default: null }) expiresAt: Date | null;
}
export type CartDocument = HydratedDocument<Cart>;
export const CartSchema = SchemaFactory.createForClass(Cart);
CartSchema.index(
  { userId: 1 },
  { unique: true, partialFilterExpression: { userId: { $exists: true } } },
);
CartSchema.index(
  { guestId: 1 },
  { unique: true, partialFilterExpression: { guestId: { $exists: true } } },
);
CartSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
