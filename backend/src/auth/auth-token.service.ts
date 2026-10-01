import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Types, type Model } from 'mongoose';
import { hashToken, randomToken } from '../common/crypto/tokens.js';
import {
  AuthToken,
  type AuthTokenPurpose,
} from './schemas/auth-token.schema.js';

export const LINK_TTL_MS: Record<AuthTokenPurpose, number> = {
  verify_email: 24 * 60 * 60_000,
  reset_password: 60 * 60_000,
  claim_account: 7 * 24 * 60 * 60_000,
};

/** Single-use, expiring tokens for emailed links (verify email, reset password, claim account). */
@Injectable()
export class AuthTokenService {
  constructor(
    @InjectModel(AuthToken.name) private readonly tokens: Model<AuthToken>,
  ) {}

  /**
   * Issues a new link token. Older unused tokens for the same purpose are invalidated, so only
   * the most recent email's link works.
   */
  async issue(
    userId: string,
    purpose: AuthTokenPurpose,
  ): Promise<{ token: string; id: string }> {
    const now = new Date();
    await this.tokens
      .updateMany(
        { userId: new Types.ObjectId(userId), purpose, usedAt: null },
        { $set: { usedAt: now } },
      )
      .exec();
    const token = randomToken();
    const doc = await this.tokens.create({
      userId: new Types.ObjectId(userId),
      purpose,
      tokenHash: hashToken(token),
      expiresAt: new Date(now.getTime() + LINK_TTL_MS[purpose]),
    });
    return { token, id: doc._id.toString() };
  }

  /** Atomically consumes a token. Returns the user id, or null if invalid, expired or used. */
  async consume(
    token: string,
    purpose: AuthTokenPurpose,
  ): Promise<string | null> {
    if (!token || token.length > 200) return null;
    const now = new Date();
    const doc = await this.tokens
      .findOneAndUpdate(
        {
          tokenHash: hashToken(token),
          purpose,
          usedAt: null,
          expiresAt: { $gt: now },
        },
        { $set: { usedAt: now } },
      )
      .exec();
    return doc ? doc.userId.toString() : null;
  }

  async invalidateAll(
    userId: string,
    purposes: AuthTokenPurpose[],
  ): Promise<void> {
    await this.tokens
      .updateMany(
        {
          userId: new Types.ObjectId(userId),
          purpose: { $in: purposes },
          usedAt: null,
        },
        { $set: { usedAt: new Date() } },
      )
      .exec();
  }
}
