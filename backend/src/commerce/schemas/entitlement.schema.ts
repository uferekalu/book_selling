import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Types, type HydratedDocument } from 'mongoose';

/**
 * An ebook in a customer's library (ARCHITECTURE §4.4). Granted on settlement (BS-8); read and
 * downloaded in BS-9. Defined here because checkout must refuse ebooks the buyer already owns.
 */
@Schema({ collection: 'entitlements', timestamps: true })
export class Entitlement {
  @Prop({ type: Types.ObjectId, required: true }) userId: Types.ObjectId;
  @Prop({ type: Types.ObjectId, required: true }) bookId: Types.ObjectId;
  @Prop({ type: Types.ObjectId, required: true }) orderId: Types.ObjectId;
  @Prop({ type: Date, required: true }) grantedAt: Date;
  @Prop({ type: Date, default: null }) revokedAt: Date | null;
  @Prop({ type: Number, default: 0 }) downloadCount: number;
  @Prop({ type: Date, default: null }) lastDownloadedAt: Date | null;
}
export type EntitlementDocument = HydratedDocument<Entitlement>;
export const EntitlementSchema = SchemaFactory.createForClass(Entitlement);
// Buying the same ebook twice is blocked at checkout; this index is the backstop.
EntitlementSchema.index({ userId: 1, bookId: 1 }, { unique: true });
