import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Types, type HydratedDocument } from 'mongoose';

export const NOTIFICATION_TYPES = [
  'message',
  'contact',
  'order_paid',
  'order_shipped',
  'order_delivered',
  'refund',
  'new_sale',
] as const;
export type NotificationType = (typeof NOTIFICATION_TYPES)[number];

/** The in-app bell (ARCHITECTURE §12). Kept 180 days. */
@Schema({
  collection: 'notifications',
  timestamps: { createdAt: true, updatedAt: false },
  versionKey: false,
})
export class Notification {
  @Prop({ type: Types.ObjectId, required: true }) userId: Types.ObjectId;
  @Prop({ type: String, enum: NOTIFICATION_TYPES, required: true })
  type: NotificationType;
  @Prop({ type: String, required: true, maxlength: 140 }) title: string;
  @Prop({ type: String, default: '', maxlength: 300 }) body: string;
  /** A path inside the site, e.g. `/account/messages/<id>`. Never an external URL. */
  @Prop({ type: String, required: true }) link: string;
  /** One notification per event and user, e.g. `order-paid:<orderId>`. */
  @Prop({ type: String, required: true }) dedupeKey: string;
  @Prop({ type: Date, default: null }) readAt: Date | null;
  createdAt: Date;
}
export type NotificationDocument = HydratedDocument<Notification>;
export const NotificationSchema = SchemaFactory.createForClass(Notification);
NotificationSchema.index({ userId: 1, dedupeKey: 1 }, { unique: true });
NotificationSchema.index({ userId: 1, createdAt: -1 });
NotificationSchema.index({ userId: 1, readAt: 1 });
NotificationSchema.index(
  { createdAt: 1 },
  { expireAfterSeconds: 180 * 24 * 3600 },
);
