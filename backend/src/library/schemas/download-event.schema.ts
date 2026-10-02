import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Types, type HydratedDocument } from 'mongoose';

/**
 * One ebook download link issued (PRODUCT_RULES §8): the rate limit (10 per hour per book) and the
 * abuse alert count these. Kept 400 days.
 */
@Schema({ collection: 'download_events', versionKey: false })
export class DownloadEvent {
  @Prop({ type: Types.ObjectId, required: true }) userId: Types.ObjectId;
  @Prop({ type: Types.ObjectId, required: true }) bookId: Types.ObjectId;
  @Prop({ type: Types.ObjectId, required: true }) entitlementId: Types.ObjectId;
  @Prop({ type: Date, required: true }) at: Date;
}
export type DownloadEventDocument = HydratedDocument<DownloadEvent>;
export const DownloadEventSchema = SchemaFactory.createForClass(DownloadEvent);
DownloadEventSchema.index({ userId: 1, bookId: 1, at: -1 });
DownloadEventSchema.index({ at: 1 }, { expireAfterSeconds: 400 * 24 * 3600 });
