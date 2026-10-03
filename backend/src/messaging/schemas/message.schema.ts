import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Types, type HydratedDocument } from 'mongoose';
import { SENDER_ROLES, type SenderRole } from './conversation.schema.js';

export const MESSAGE_MAX_LENGTH = 5000;

/** One message in a conversation. Plain text only; the frontend never renders it as HTML. */
@Schema({
  collection: 'messages',
  timestamps: { createdAt: true, updatedAt: false },
  versionKey: false,
})
export class Message {
  @Prop({ type: Types.ObjectId, required: true })
  conversationId: Types.ObjectId;
  @Prop({ type: Types.ObjectId, required: true }) senderId: Types.ObjectId;
  @Prop({ type: String, enum: SENDER_ROLES, required: true })
  senderRole: SenderRole;
  /** Display name at send time ("Dr. Okafor" for staff, the customer's name otherwise). */
  @Prop({ type: String, required: true }) senderName: string;
  @Prop({ type: String, required: true, maxlength: MESSAGE_MAX_LENGTH })
  body: string;
  /** When the other side read it (read receipts). */
  @Prop({ type: Date, default: null }) readAt: Date | null;
  createdAt: Date;
}
export type MessageDocument = HydratedDocument<Message>;
export const MessageSchema = SchemaFactory.createForClass(Message);
// Pages go newest-first by `_id` (ids are created by the API in send order), so "load older"
// is a plain range query with no ties.
MessageSchema.index({ conversationId: 1, _id: -1 });
// Marking a thread read: the other side's unread messages.
MessageSchema.index({ conversationId: 1, senderRole: 1, readAt: 1 });
