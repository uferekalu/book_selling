import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Types, type HydratedDocument } from 'mongoose';

export const REVIEW_STATUSES = ['published', 'hidden'] as const;
export type ReviewStatus = (typeof REVIEW_STATUSES)[number];
export const REVIEW_BODY_MAX = 4000;

/**
 * A buyer's review of a book (PRODUCT_RULES §12, BS-11). One per buyer and book. Only people who
 * paid for the book can write one; staff can hide an abusive review but never edit it.
 */
@Schema({ collection: 'reviews', timestamps: true, versionKey: false })
export class Review {
  @Prop({ type: Types.ObjectId, required: true }) bookId: Types.ObjectId;
  @Prop({ type: Types.ObjectId, required: true }) userId: Types.ObjectId;
  /** "Ada O.": first name and last initial, set when written (never the email). */
  @Prop({ type: String, required: true, maxlength: 60 }) authorName: string;
  @Prop({ type: Number, required: true, min: 1, max: 5 }) rating: number;
  @Prop({ type: String, default: '', maxlength: 120 }) title: string;
  /** Plain text; the frontend never renders it as HTML. */
  @Prop({ type: String, default: '', maxlength: REVIEW_BODY_MAX }) body: string;
  /** Always true today (only buyers can review); kept so imported reviews could say otherwise. */
  @Prop({ type: Boolean, default: true }) verifiedPurchase: boolean;
  @Prop({ type: String, enum: REVIEW_STATUSES, default: 'published' })
  status: ReviewStatus;
  @Prop({ type: String, default: null, maxlength: 300 }) hiddenReason:
    string | null;
  createdAt: Date;
  updatedAt: Date;
}
export type ReviewDocument = HydratedDocument<Review>;
export const ReviewSchema = SchemaFactory.createForClass(Review);
ReviewSchema.index({ bookId: 1, userId: 1 }, { unique: true });
ReviewSchema.index({ bookId: 1, status: 1, createdAt: -1 });
ReviewSchema.index({ status: 1, createdAt: -1 });
