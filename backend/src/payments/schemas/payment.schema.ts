import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Types, type HydratedDocument } from 'mongoose';
import { CURRENCIES, type Currency } from '../../common/money/currency.js';

export const PROVIDERS = ['stripe', 'paystack', 'flutterwave'] as const;
export type Provider = (typeof PROVIDERS)[number];

export const PAYMENT_STATUSES = [
  'initiated',
  'succeeded',
  'failed',
  'abandoned',
  'partially_refunded',
  'refunded',
] as const;
export type PaymentStatus = (typeof PAYMENT_STATUSES)[number];
/** Statuses meaning "money was received" (the unique index allows one per order). */
export const SETTLED_STATUSES: PaymentStatus[] = [
  'succeeded',
  'partially_refunded',
  'refunded',
];

export const REFUND_STATUSES = [
  'pending',
  'succeeded',
  'failed',
  'outcome_unknown',
] as const;
export type RefundStatus = (typeof REFUND_STATUSES)[number];

@Schema({ _id: false })
export class Refund {
  /** Our id for the refund, also the provider idempotency key. */
  @Prop({ type: String, required: true }) refundId: string;
  @Prop({ type: String, default: null }) providerRefundId: string | null;
  @Prop({ type: Number, required: true, min: 1 }) amount: number;
  @Prop({ type: String, enum: REFUND_STATUSES, required: true })
  status: RefundStatus;
  @Prop({ type: String, required: true }) reason: string;
  /** 'admin:<id>' for ours; 'provider' for a refund made outside the app. */
  @Prop({ type: String, required: true }) requestedBy: string;
  @Prop({ type: Date, required: true }) createdAt: Date;
  @Prop({ type: Date, default: null }) resolvedAt: Date | null;
  @Prop({ type: String, default: null }) failureReason: string | null;
}
const RefundSchema = SchemaFactory.createForClass(Refund);

/**
 * One payment ATTEMPT for an order (ARCHITECTURE §4.3). An order can have several (a failed card,
 * a switched provider); at most one ever reaches a settled status (partial unique index).
 */
@Schema({ collection: 'payments', timestamps: true })
export class Payment {
  @Prop({ type: Types.ObjectId, required: true, index: true })
  orderId: Types.ObjectId;
  @Prop({ type: String, enum: PROVIDERS, required: true }) provider: Provider;
  /** We generate it (`BSP_` + random), unique; sent to the provider as their reference. */
  @Prop({ type: String, required: true, unique: true }) reference: string;
  /** The provider's own id (Stripe Checkout Session / Paystack id / Flutterwave id). */
  @Prop({ type: String, default: null }) providerTransactionId: string | null;
  /** Stripe only: the PaymentIntent, needed for refunds. */
  @Prop({ type: String, default: null }) providerChargeId: string | null;
  @Prop({ type: Number, required: true, min: 1 }) amount: number;
  @Prop({ type: String, enum: CURRENCIES, required: true }) currency: Currency;
  @Prop({ type: String, enum: PAYMENT_STATUSES, required: true })
  status: PaymentStatus;
  @Prop({ type: Number, default: null }) verifiedAmount: number | null;
  @Prop({ type: String, enum: CURRENCIES, default: null })
  verifiedCurrency: Currency | null;
  @Prop({ type: [RefundSchema], default: [] }) refunds: Refund[];
  @Prop({ type: Boolean, default: false }) reconciliationRequired: boolean;
  @Prop({ type: String, default: null }) reconciliationReason: string | null;
  @Prop({ type: Date, default: null }) lastVerifiedAt: Date | null;
  @Prop({ type: String, default: null }) failureReason: string | null;
  @Prop({ type: Date, default: null }) succeededAt: Date | null;
}
export type PaymentDocument = HydratedDocument<Payment>;
export const PaymentSchema = SchemaFactory.createForClass(Payment);
PaymentSchema.index(
  { providerTransactionId: 1 },
  {
    unique: true,
    partialFilterExpression: { providerTransactionId: { $type: 'string' } },
  },
);
PaymentSchema.index({ status: 1, createdAt: 1 });
// The database itself refuses a second successful payment for one order (ARCHITECTURE §4.3).
PaymentSchema.index(
  { orderId: 1 },
  {
    unique: true,
    name: 'one_settled_payment_per_order',
    partialFilterExpression: { status: { $in: SETTLED_STATUSES } },
  },
);
PaymentSchema.index(
  { reconciliationRequired: 1 },
  { partialFilterExpression: { reconciliationRequired: true } },
);

/** Every webhook delivery we accepted (signature valid); redelivery is a no-op (unique index). */
@Schema({ collection: 'webhook_events', versionKey: false })
export class WebhookEvent {
  @Prop({ type: String, enum: PROVIDERS, required: true }) provider: Provider;
  /** The provider's event id, or a SHA-256 of the raw body when it has none. */
  @Prop({ type: String, required: true }) eventId: string;
  @Prop({ type: String, required: true }) type: string;
  @Prop({ type: String, default: null }) reference: string | null;
  @Prop({ type: Date, required: true }) receivedAt: Date;
  @Prop({ type: Date, default: null }) processedAt: Date | null;
  @Prop({
    type: String,
    enum: ['processed', 'ignored', 'failed', null],
    default: null,
  })
  outcome: 'processed' | 'ignored' | 'failed' | null;
  @Prop({ type: String, default: null }) error: string | null;
}
export type WebhookEventDocument = HydratedDocument<WebhookEvent>;
export const WebhookEventSchema = SchemaFactory.createForClass(WebhookEvent);
WebhookEventSchema.index({ provider: 1, eventId: 1 }, { unique: true });
WebhookEventSchema.index(
  { receivedAt: 1 },
  { expireAfterSeconds: 400 * 24 * 3600 },
);
