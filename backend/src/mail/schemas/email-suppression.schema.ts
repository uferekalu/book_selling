import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import type { HydratedDocument } from 'mongoose';

export const SUPPRESSION_REASONS = ['bounce', 'complaint', 'manual'] as const;
export type SuppressionReason = (typeof SUPPRESSION_REASONS)[number];

/**
 * Addresses we must not send non-critical email to: hard bounces and spam complaints. Continuing
 * to send to them damages the sending domain's reputation, which then hurts delivery of every
 * receipt to every customer.
 */
@Schema({ collection: 'email_suppressions', timestamps: true })
export class EmailSuppression {
  @Prop({
    type: String,
    required: true,
    unique: true,
    lowercase: true,
    trim: true,
  })
  email: string;

  @Prop({ type: String, enum: SUPPRESSION_REASONS, required: true })
  reason: SuppressionReason;

  @Prop({ type: String, default: null })
  detail: string | null;
}

export type EmailSuppressionDocument = HydratedDocument<EmailSuppression>;
export const EmailSuppressionSchema =
  SchemaFactory.createForClass(EmailSuppression);
