import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import type { HydratedDocument } from 'mongoose';
import { StoredImage, StoredImageSchema } from './image.schema.js';

@Schema({ _id: false })
export class AuthorLinks {
  @Prop({ type: String, default: null }) website: string | null;
  @Prop({ type: String, default: null }) linkedin: string | null;
  @Prop({ type: String, default: null }) googleScholar: string | null;
  @Prop({ type: String, default: null }) researchGate: string | null;
}
const AuthorLinksSchema = SchemaFactory.createForClass(AuthorLinks);

@Schema({ collection: 'authors', timestamps: true })
export class Author {
  @Prop({ type: String, required: true, trim: true, maxlength: 120 })
  name: string;
  @Prop({ type: String, required: true, unique: true }) slug: string;
  /** e.g. "Professor of Mechanical Engineering". */
  @Prop({ type: String, default: '', trim: true, maxlength: 160 })
  title: string;
  @Prop({ type: String, default: '' }) bioMarkdown: string;
  @Prop({ type: String, default: '' }) bioHtml: string;
  @Prop({ type: StoredImageSchema, default: null }) photo: StoredImage | null;
  @Prop({ type: [String], default: [] }) affiliations: string[];
  @Prop({ type: AuthorLinksSchema, default: () => ({}) }) links: AuthorLinks;
}

export type AuthorDocument = HydratedDocument<Author>;
export const AuthorSchema = SchemaFactory.createForClass(Author);
