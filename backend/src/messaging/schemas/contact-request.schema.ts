import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Types, type HydratedDocument } from 'mongoose';

export const CONTACT_STATUSES = ['new', 'replied', 'closed'] as const;
export type ContactStatus = (typeof CONTACT_STATUSES)[number];

@Schema({ _id: false, versionKey: false })
export class ContactReply {
  @Prop({ type: Types.ObjectId, required: true }) staffId: Types.ObjectId;
  @Prop({ type: String, required: true }) staffName: string;
  @Prop({ type: String, required: true }) body: string;
  @Prop({ type: Date, required: true }) at: Date;
}
const ContactReplySchema = SchemaFactory.createForClass(ContactReply);

/**
 * A message from a visitor who isn't signed in (the contact form, ARCHITECTURE §12). Staff answer
 * by email; the replies are kept here so the inbox shows the whole exchange.
 */
@Schema({ collection: 'contact_requests', timestamps: true, versionKey: false })
export class ContactRequest {
  @Prop({ type: String, required: true, trim: true, maxlength: 100 })
  name: string;
  @Prop({ type: String, required: true, lowercase: true, trim: true })
  email: string;
  @Prop({ type: String, required: true, trim: true, maxlength: 140 })
  subject: string;
  @Prop({ type: String, required: true, maxlength: 5000 }) body: string;
  @Prop({ type: String, enum: CONTACT_STATUSES, default: 'new' })
  status: ContactStatus;
  @Prop({ type: [ContactReplySchema], default: [] }) replies: ContactReply[];
  /** Hashed client IP, for spotting abuse without storing the address itself. */
  @Prop({ type: String, default: null }) ipHash: string | null;
  createdAt: Date;
  updatedAt: Date;
}
export type ContactRequestDocument = HydratedDocument<ContactRequest>;
export const ContactRequestSchema =
  SchemaFactory.createForClass(ContactRequest);
ContactRequestSchema.index({ status: 1, createdAt: -1 });
ContactRequestSchema.index({ email: 1, createdAt: -1 });
