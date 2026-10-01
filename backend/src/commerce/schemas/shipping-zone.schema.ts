import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import type { HydratedDocument } from 'mongoose';
import { CURRENCIES, type Currency } from '../../common/money/currency.js';

/** "Everywhere else": the zone used for any country not listed in another zone. */
export const REST_OF_WORLD = '*';

@Schema({ _id: false })
export class ShippingRate {
  @Prop({ type: String, enum: CURRENCIES, required: true }) currency: Currency;
  /** Minor units for the first print copy, then each additional copy. */
  @Prop({ type: Number, required: true, min: 0 }) firstItem: number;
  @Prop({ type: Number, required: true, min: 0 }) additionalItem: number;
}
const ShippingRateSchema = SchemaFactory.createForClass(ShippingRate);

/** Where print copies can be shipped and what it costs (ARCHITECTURE §4.3). */
@Schema({ collection: 'shipping_zones', timestamps: true })
export class ShippingZone {
  @Prop({ type: String, required: true, trim: true, maxlength: 80 })
  name: string;
  /** ISO 3166-1 alpha-2 codes, or ['*'] for the rest of the world. A country is in one zone. */
  @Prop({ type: [String], default: [], index: true }) countries: string[];
  @Prop({ type: [ShippingRateSchema], default: [] }) rates: ShippingRate[];
  @Prop({
    type: { min: Number, max: Number },
    _id: false,
    default: () => ({ min: 3, max: 7 }),
  })
  estimatedDays: { min: number; max: number };
  @Prop({ type: Boolean, default: true }) active: boolean;
}
export type ShippingZoneDocument = HydratedDocument<ShippingZone>;
export const ShippingZoneSchema = SchemaFactory.createForClass(ShippingZone);
