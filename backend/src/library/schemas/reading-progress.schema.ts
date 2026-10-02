import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Types, type HydratedDocument } from 'mongoose';

/**
 * Where an owner is in a book (ARCHITECTURE §10.2), so they resume on any device. `maxPage` is
 * the furthest page reached: the refund rule asks whether an ebook was "read beyond the preview".
 */
@Schema({ collection: 'reading_progress', timestamps: true })
export class ReadingProgress {
  @Prop({ type: Types.ObjectId, required: true }) userId: Types.ObjectId;
  @Prop({ type: Types.ObjectId, required: true }) bookId: Types.ObjectId;
  @Prop({ type: Number, required: true, min: 1 }) page: number;
  @Prop({ type: Number, required: true, min: 1 }) maxPage: number;
  updatedAt: Date;
}
export type ReadingProgressDocument = HydratedDocument<ReadingProgress>;
export const ReadingProgressSchema =
  SchemaFactory.createForClass(ReadingProgress);
ReadingProgressSchema.index({ userId: 1, bookId: 1 }, { unique: true });
