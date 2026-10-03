import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Types, type HydratedDocument } from 'mongoose';

export const CONVERSATION_STATUSES = ['open', 'closed'] as const;
export type ConversationStatus = (typeof CONVERSATION_STATUSES)[number];
export const SENDER_ROLES = ['customer', 'staff'] as const;
export type SenderRole = (typeof SENDER_ROLES)[number];

@Schema({ _id: false, versionKey: false })
export class UnreadCounts {
  /** Staff messages the customer hasn't read. */
  @Prop({ type: Number, default: 0, min: 0 }) customer: number;
  /** Customer messages no staff member has read (owner and admins share one inbox). */
  @Prop({ type: Number, default: 0, min: 0 }) staff: number;
}
const UnreadCountsSchema = SchemaFactory.createForClass(UnreadCounts);

@Schema({ _id: false, versionKey: false })
export class PendingReminders {
  /** Outbox `dedupeKey` of the "you have a new message" email waiting for the customer. */
  @Prop({ type: String, default: null }) customer: string | null;
  @Prop({ type: String, default: null }) staff: string | null;
}
const PendingRemindersSchema = SchemaFactory.createForClass(PendingReminders);

/**
 * A thread between one customer and the store staff (ARCHITECTURE §12), optionally about an order
 * ("Question about this order") or a book ("Ask the author"). Unread counters change only through
 * `$inc` / conditional `$set` together with the message they count.
 */
@Schema({ collection: 'conversations', timestamps: true, versionKey: false })
export class Conversation {
  @Prop({ type: Types.ObjectId, required: true }) customerId: Types.ObjectId;
  @Prop({ type: String, required: true, trim: true, maxlength: 140 })
  subject: string;
  @Prop({ type: Types.ObjectId, default: null }) orderId: Types.ObjectId | null;
  /** Snapshot for display, so the inbox doesn't need a join. */
  @Prop({ type: String, default: null }) orderNumber: string | null;
  @Prop({ type: Types.ObjectId, default: null }) bookId: Types.ObjectId | null;
  @Prop({ type: String, default: null }) bookTitle: string | null;
  @Prop({ type: String, enum: CONVERSATION_STATUSES, default: 'open' })
  status: ConversationStatus;
  @Prop({ type: Date, required: true }) lastMessageAt: Date;
  @Prop({ type: String, required: true }) lastMessagePreview: string;
  @Prop({ type: String, enum: SENDER_ROLES, required: true })
  lastMessageBy: SenderRole;
  @Prop({ type: UnreadCountsSchema, default: () => ({}) })
  unread: UnreadCounts;
  /** Delayed emails to cancel when that side reads the thread (ARCHITECTURE §11). */
  @Prop({ type: PendingRemindersSchema, default: () => ({}) })
  reminders: PendingReminders;
  @Prop({ type: Date, default: null }) closedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}
export type ConversationDocument = HydratedDocument<Conversation>;
export const ConversationSchema = SchemaFactory.createForClass(Conversation);
ConversationSchema.index({ customerId: 1, lastMessageAt: -1 });
ConversationSchema.index({ status: 1, lastMessageAt: -1 });
ConversationSchema.index({ 'unread.staff': 1, lastMessageAt: -1 });
ConversationSchema.index({ orderId: 1 }, { sparse: true });
