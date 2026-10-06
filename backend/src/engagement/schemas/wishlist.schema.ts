import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Types, type HydratedDocument } from 'mongoose';

export const WISHLIST_MAX = 200;

/** Books a customer saved for later (PRODUCT_RULES §12, BS-11). One document per customer. */
@Schema({ collection: 'wishlists', timestamps: true, versionKey: false })
export class Wishlist {
  @Prop({ type: Types.ObjectId, required: true, unique: true })
  userId: Types.ObjectId;
  /** Newest first. */
  @Prop({ type: [Types.ObjectId], default: [] }) bookIds: Types.ObjectId[];
}
export type WishlistDocument = HydratedDocument<Wishlist>;
export const WishlistSchema = SchemaFactory.createForClass(Wishlist);
