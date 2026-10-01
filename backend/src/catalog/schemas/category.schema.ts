import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import type { HydratedDocument } from 'mongoose';

@Schema({ collection: 'categories', timestamps: true })
export class Category {
  @Prop({ type: String, required: true, trim: true, maxlength: 80 })
  name: string;
  @Prop({ type: String, required: true, unique: true }) slug: string;
  @Prop({ type: String, default: '', trim: true, maxlength: 400 })
  description: string;
  /** Lower first. */
  @Prop({ type: Number, default: 0 }) sortOrder: number;
}

export type CategoryDocument = HydratedDocument<Category>;
export const CategorySchema = SchemaFactory.createForClass(Category);
CategorySchema.index({ sortOrder: 1, name: 1 });
