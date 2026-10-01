import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Types, type HydratedDocument } from 'mongoose';

export const REVOKE_REASONS = [
  'rotated',
  'logout',
  'reuse_detected',
  'password_changed',
  'revoked_by_user',
  'suspended',
] as const;
export type RevokeReason = (typeof REVOKE_REASONS)[number];

/**
 * One document per refresh token (ARCHITECTURE §5). Every rotation creates a new document in the
 * same `familyId`; a family is one signed-in device ("session"). Only a SHA-256 hash is stored.
 */
@Schema({ collection: 'refresh_tokens', timestamps: true })
export class RefreshToken {
  @Prop({ type: Types.ObjectId, required: true, index: true })
  userId: Types.ObjectId;

  @Prop({ type: String, required: true, index: true })
  familyId: string;

  @Prop({ type: String, required: true, unique: true })
  tokenHash: string;

  /** Whether this session passed two-step verification; carried into every refreshed access token. */
  @Prop({ type: Boolean, default: false })
  mfa: boolean;

  @Prop({ type: Date, required: true })
  expiresAt: Date;

  @Prop({ type: Date, default: null })
  revokedAt: Date | null;

  @Prop({ type: String, enum: [...REVOKE_REASONS, null], default: null })
  revokedReason: RevokeReason | null;

  @Prop({ type: String, default: '' })
  userAgent: string;

  @Prop({ type: String, default: '' })
  ip: string;
}

export type RefreshTokenDocument = HydratedDocument<RefreshToken>;
export const RefreshTokenSchema = SchemaFactory.createForClass(RefreshToken);
// Expired tokens are removed automatically.
RefreshTokenSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
RefreshTokenSchema.index({ userId: 1, revokedAt: 1 });
