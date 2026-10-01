import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Types, type HydratedDocument } from 'mongoose';

export const AUTH_TOKEN_PURPOSES = [
  'verify_email',
  'reset_password',
  'claim_account',
] as const;
export type AuthTokenPurpose = (typeof AUTH_TOKEN_PURPOSES)[number];

/**
 * Single-use tokens behind emailed links (ARCHITECTURE §4.1). Random, stored hashed, consumed
 * atomically, so a link works exactly once and a leaked database can't mint working links.
 */
@Schema({ collection: 'auth_tokens', timestamps: true })
export class AuthToken {
  @Prop({ type: Types.ObjectId, required: true, index: true })
  userId: Types.ObjectId;

  @Prop({ type: String, enum: AUTH_TOKEN_PURPOSES, required: true })
  purpose: AuthTokenPurpose;

  @Prop({ type: String, required: true, unique: true })
  tokenHash: string;

  @Prop({ type: Date, required: true })
  expiresAt: Date;

  @Prop({ type: Date, default: null })
  usedAt: Date | null;
}

export type AuthTokenDocument = HydratedDocument<AuthToken>;
export const AuthTokenSchema = SchemaFactory.createForClass(AuthToken);
AuthTokenSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
