import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Types, type HydratedDocument } from 'mongoose';

export const MANUSCRIPT_UPLOAD_STATUSES = ['uploading', 'uploaded'] as const;
export type ManuscriptUploadStatus =
  (typeof MANUSCRIPT_UPLOAD_STATUSES)[number];

/**
 * A book PDF on its way into R2 (ARCHITECTURE §10.0). The record exists from "start" until the
 * file is attached to the book; one left behind for a day was abandoned, and the cleanup job
 * aborts the upload and deletes whatever reached R2.
 */
@Schema({ collection: 'manuscript_uploads', timestamps: true })
export class ManuscriptUpload {
  @Prop({ type: Types.ObjectId, required: true, index: true })
  bookId: Types.ObjectId;
  @Prop({ type: String, required: true, unique: true }) key: string;
  @Prop({ type: String, required: true }) uploadId: string;
  /** The size the browser declared; the parts must add up to exactly this. */
  @Prop({ type: Number, required: true, min: 1 }) bytes: number;
  @Prop({ type: Number, required: true, min: 1 }) partCount: number;
  @Prop({ type: String, enum: MANUSCRIPT_UPLOAD_STATUSES, required: true })
  status: ManuscriptUploadStatus;
  @Prop({ type: String, required: true }) startedBy: string;
  createdAt: Date;
}
export type ManuscriptUploadDocument = HydratedDocument<ManuscriptUpload>;
export const ManuscriptUploadSchema =
  SchemaFactory.createForClass(ManuscriptUpload);
ManuscriptUploadSchema.index({ createdAt: 1 });
