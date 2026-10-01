import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Types, type HydratedDocument } from 'mongoose';
import { CURRENCIES, type Currency } from '../../common/money/currency.js';
import {
  FORMAT_TYPES,
  type FormatType,
} from '../../catalog/schemas/book.schema.js';

export const COUPON_KINDS = ['percent', 'fixed'] as const;
export type CouponKind = (typeof COUPON_KINDS)[number];

@Schema({ _id: false })
export class CouponAmount {
  @Prop({ type: String, enum: CURRENCIES, required: true }) currency: Currency;
  @Prop({ type: Number, required: true, min: 0 }) amount: number;
}
const CouponAmountSchema = SchemaFactory.createForClass(CouponAmount);

/** Discount codes (ARCHITECTURE §4.3, PRODUCT_RULES §6). One per order. */
@Schema({ collection: 'coupons', timestamps: true })
export class Coupon {
  @Prop({
    type: String,
    required: true,
    unique: true,
    uppercase: true,
    trim: true,
  })
  code: string;
  @Prop({ type: String, default: '', maxlength: 200 }) description: string;
  @Prop({ type: String, enum: COUPON_KINDS, required: true }) kind: CouponKind;
  /** Whole percent, 1–100 (kind `percent`). */
  @Prop({ type: Number, default: null, min: 1, max: 100 })
  percentOff: number | null;
  /** Amount off per currency (kind `fixed`); a currency without an entry can't use the coupon. */
  @Prop({ type: [CouponAmountSchema], default: [] }) amountsOff: CouponAmount[];
  @Prop({ type: [CouponAmountSchema], default: [] })
  minSubtotals: CouponAmount[];
  /** Empty lists mean "everything". */
  @Prop({
    type: {
      bookIds: { type: [Types.ObjectId], default: [] },
      formats: { type: [String], enum: FORMAT_TYPES, default: [] },
    },
    _id: false,
    default: () => ({ bookIds: [], formats: [] }),
  })
  appliesTo: { bookIds: Types.ObjectId[]; formats: FormatType[] };
  @Prop({ type: Date, default: null }) startsAt: Date | null;
  @Prop({ type: Date, default: null }) endsAt: Date | null;
  @Prop({ type: Number, default: null, min: 1 }) maxRedemptions: number | null;
  @Prop({ type: Number, default: null, min: 1 }) perCustomerLimit:
    number | null;
  /** Held (reserved) plus used redemptions; released holds decrement it. */
  @Prop({ type: Number, default: 0, min: 0 }) redemptionCount: number;
  @Prop({ type: Boolean, default: true }) active: boolean;
}
export type CouponDocument = HydratedDocument<Coupon>;
export const CouponSchema = SchemaFactory.createForClass(Coupon);

export const REDEMPTION_STATUSES = [
  'reserved',
  'redeemed',
  'released',
] as const;
export type RedemptionStatus = (typeof REDEMPTION_STATUSES)[number];

@Schema({ collection: 'coupon_redemptions', timestamps: true })
export class CouponRedemption {
  @Prop({ type: Types.ObjectId, required: true, index: true })
  couponId: Types.ObjectId;
  @Prop({ type: Types.ObjectId, required: true, unique: true })
  orderId: Types.ObjectId;
  @Prop({ type: String, required: true, lowercase: true }) email: string;
  @Prop({ type: Types.ObjectId, default: null }) userId: Types.ObjectId | null;
  @Prop({ type: String, enum: REDEMPTION_STATUSES, required: true })
  status: RedemptionStatus;
}
export type CouponRedemptionDocument = HydratedDocument<CouponRedemption>;
export const CouponRedemptionSchema =
  SchemaFactory.createForClass(CouponRedemption);
CouponRedemptionSchema.index({ couponId: 1, email: 1, status: 1 });
