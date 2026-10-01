import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Types, type HydratedDocument } from 'mongoose';
import { CURRENCIES, type Currency } from '../../common/money/currency.js';
import {
  add,
  equals,
  money,
  multiply,
  subtract,
  sum,
} from '../../common/money/money.js';
import {
  FORMAT_TYPES,
  type FormatType,
} from '../../catalog/schemas/book.schema.js';

export const ORDER_STATUSES = [
  'pending_payment',
  'paid',
  'fulfilled',
  'expired',
  'cancelled',
  'partially_refunded',
  'refunded',
] as const;
export type OrderStatus = (typeof ORDER_STATUSES)[number];

export const SHIPMENT_STATUSES = [
  'not_required',
  'pending',
  'processing',
  'shipped',
  'delivered',
] as const;
export type ShipmentStatus = (typeof SHIPMENT_STATUSES)[number];

@Schema({ _id: false })
export class OrderItem {
  @Prop({ type: Types.ObjectId, required: true }) bookId: Types.ObjectId;
  @Prop({ type: String, enum: FORMAT_TYPES, required: true })
  format: FormatType;
  @Prop({ type: String, required: true }) sku: string;
  @Prop({ type: String, required: true }) titleSnapshot: string;
  @Prop({ type: String, default: null }) coverSnapshot: string | null;
  @Prop({ type: String, required: true }) slugSnapshot: string;
  @Prop({ type: Number, required: true, min: 1 }) unitAmount: number;
  @Prop({ type: Number, required: true, min: 1 }) quantity: number;
  @Prop({ type: Number, required: true, min: 1 }) lineTotal: number;
}
const OrderItemSchema = SchemaFactory.createForClass(OrderItem);

@Schema({ _id: false })
export class ShippingAddress {
  @Prop({ type: String, required: true }) fullName: string;
  @Prop({ type: String, required: true }) phone: string;
  @Prop({ type: String, required: true }) line1: string;
  @Prop({ type: String, default: '' }) line2: string;
  @Prop({ type: String, required: true }) city: string;
  @Prop({ type: String, default: '' }) state: string;
  @Prop({ type: String, default: '' }) postalCode: string;
  @Prop({ type: String, required: true }) country: string;
}
const ShippingAddressSchema = SchemaFactory.createForClass(ShippingAddress);

@Schema({ _id: false })
export class Shipment {
  @Prop({ type: String, enum: SHIPMENT_STATUSES, required: true })
  status: ShipmentStatus;
  @Prop({ type: String, default: null }) carrier: string | null;
  @Prop({ type: String, default: null }) trackingNumber: string | null;
  @Prop({ type: String, default: null }) trackingUrl: string | null;
  @Prop({ type: Date, default: null }) shippedAt: Date | null;
  @Prop({ type: Date, default: null }) deliveredAt: Date | null;
}
const ShipmentSchema = SchemaFactory.createForClass(Shipment);

@Schema({ _id: false })
export class StatusChange {
  @Prop({ type: String, enum: ORDER_STATUSES, required: true })
  status: OrderStatus;
  @Prop({ type: Date, required: true }) at: Date;
  /** 'customer' | 'system' | 'admin:<userId>' | 'provider:<name>' */
  @Prop({ type: String, required: true }) by: string;
  @Prop({ type: String, default: '' }) note: string;
}
const StatusChangeSchema = SchemaFactory.createForClass(StatusChange);

/**
 * An order (ARCHITECTURE §4.3). Money fields are integer minor units in `currency`, and
 * `total = subtotal − discountTotal + shippingTotal + taxTotal` is asserted before every save.
 * Status changes only through `order-state-machine.ts` with conditional updates.
 */
@Schema({ collection: 'orders', timestamps: true })
export class Order {
  @Prop({ type: String, required: true, unique: true }) orderNumber: string;
  @Prop({ type: Types.ObjectId, required: true }) userId: Types.ObjectId;
  @Prop({ type: String, required: true, lowercase: true }) email: string;
  @Prop({ type: String, required: true }) customerName: string;
  @Prop({ type: String, enum: CURRENCIES, required: true }) currency: Currency;
  @Prop({ type: [OrderItemSchema], required: true }) items: OrderItem[];

  @Prop({ type: Number, required: true, min: 0 }) subtotal: number;
  @Prop({ type: Number, required: true, min: 0 }) discountTotal: number;
  @Prop({ type: Number, required: true, min: 0 }) shippingTotal: number;
  @Prop({ type: Number, required: true, min: 0 }) taxTotal: number;
  @Prop({ type: Number, required: true, min: 1 }) total: number;

  @Prop({
    type: { code: String, couponId: Types.ObjectId },
    _id: false,
    default: null,
  })
  coupon: { code: string; couponId: Types.ObjectId } | null;
  @Prop({ type: ShippingAddressSchema, default: null })
  shippingAddress: ShippingAddress | null;
  @Prop({ type: Types.ObjectId, default: null })
  shippingZoneId: Types.ObjectId | null;
  @Prop({ type: { min: Number, max: Number }, _id: false, default: null })
  shippingEstimate: { min: number; max: number } | null;

  @Prop({ type: String, enum: ORDER_STATUSES, required: true })
  status: OrderStatus;
  @Prop({ type: ShipmentSchema, required: true }) shipment: Shipment;
  @Prop({
    type: { provider: String, paymentId: Types.ObjectId, paidAt: Date },
    _id: false,
    default: null,
  })
  payment: { provider: string; paymentId: Types.ObjectId; paidAt: Date } | null;
  @Prop({ type: Number, default: 0, min: 0 }) refundedTotal: number;

  /** While `pending_payment`: stock and coupon are held until then. */
  @Prop({ type: Date, default: null }) expiresAt: Date | null;
  /**
   * SHA-256 of the client's idempotency key for "place order" (unique: a retry returns the same
   * order). The key itself is a 128-bit random secret the browser keeps, which is also how a guest
   * proves access to their order: it is sent in request bodies, never URLs, so it is never logged.
   */
  @Prop({ type: String, required: true, unique: true, select: false })
  checkoutKeyHash: string;
  /** Relative path to return to after payment (e.g. the reader page where they stopped). */
  @Prop({ type: String, default: null }) returnPath: string | null;
  @Prop({ type: Boolean, default: false }) completeOrderEmailSent: boolean;
  /** The guest cart the order came from, so settlement can empty it (never sent to a browser). */
  @Prop({ type: String, default: null, select: false })
  guestCartId: string | null;

  @Prop({ type: [StatusChangeSchema], default: [] })
  statusHistory: StatusChange[];
  @Prop({
    type: { required: Boolean, reason: String },
    _id: false,
    default: () => ({ required: false, reason: '' }),
  })
  attention: { required: boolean; reason: string };
}
export type OrderDocument = HydratedDocument<Order>;
export const OrderSchema = SchemaFactory.createForClass(Order);
OrderSchema.index({ userId: 1, createdAt: -1 });
OrderSchema.index(
  { status: 1, expiresAt: 1 },
  { partialFilterExpression: { status: 'pending_payment' } },
);
OrderSchema.index(
  { 'attention.required': 1 },
  { partialFilterExpression: { 'attention.required': true } },
);

/** The money invariant, checked before every save of an order (arithmetic via common/money). */
export function orderTotalsProblem(
  order: Pick<
    Order,
    | 'currency'
    | 'items'
    | 'subtotal'
    | 'discountTotal'
    | 'shippingTotal'
    | 'taxTotal'
    | 'total'
  >,
): string | null {
  const values = [
    order.subtotal,
    order.discountTotal,
    order.shippingTotal,
    order.taxTotal,
    order.total,
  ];
  if (!values.every((v) => Number.isSafeInteger(v) && v >= 0)) {
    return 'Order amounts must be non-negative integers';
  }
  try {
    const m = (amount: number) => money(amount, order.currency);
    for (const item of order.items) {
      if (
        !equals(multiply(m(item.unitAmount), item.quantity), m(item.lineTotal))
      ) {
        return `Line total mismatch for ${item.sku}`;
      }
    }
    const subtotal = sum(
      order.items.map((i) => m(i.lineTotal)),
      order.currency,
    );
    if (!equals(subtotal, m(order.subtotal)))
      return 'Subtotal does not match the items';
    if (order.discountTotal > order.subtotal)
      return 'Discount exceeds subtotal';
    const total = add(
      add(
        subtract(m(order.subtotal), m(order.discountTotal)),
        m(order.shippingTotal),
      ),
      m(order.taxTotal),
    );
    if (!equals(total, m(order.total))) return 'Total does not match its parts';
  } catch (error) {
    return (error as Error).message;
  }
  return null;
}

OrderSchema.pre('validate', function assertTotals() {
  const problem = orderTotalsProblem(this);
  if (problem) throw new Error(`Order totals invalid: ${problem}`);
});

@Schema({ collection: 'counters', versionKey: false })
export class Counter {
  @Prop({ type: String, required: true }) _id: string;
  @Prop({ type: Number, required: true, default: 0 }) seq: number;
}
export const CounterSchema = SchemaFactory.createForClass(Counter);
