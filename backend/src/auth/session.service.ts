import { Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { InjectModel } from '@nestjs/mongoose';
import { randomUUID } from 'node:crypto';
import { Types, type Model } from 'mongoose';
import { hashToken, randomToken } from '../common/crypto/tokens.js';
import { describeDevice, type ClientInfo } from '../common/http/client-info.js';
import type { UserDocument } from '../users/schemas/user.schema.js';
import type {
  AccessTokenPayload,
  IssuedSession,
} from './interfaces/auth.types.js';
import {
  RefreshToken,
  type RefreshTokenDocument,
  type RevokeReason,
} from './schemas/refresh-token.schema.js';

/**
 * A rotated refresh token presented again within this window is treated as a benign race (two
 * tabs refreshing at once, a retried request), not theft. Outside it, reuse revokes the whole
 * session. The same idea as Auth0's "reuse interval". Without it, reloading two tabs together
 * logs the user out everywhere.
 */
export const REFRESH_REUSE_GRACE_MS = 30_000;

export interface SessionSummary {
  id: string;
  device: string;
  ip: string;
  lastActiveAt: string;
  createdAt: string;
  current: boolean;
}

export const INVALID_SESSION = 'Your session has ended. Please sign in again.';

@Injectable()
export class SessionService {
  private readonly logger = new Logger(SessionService.name);
  private readonly accessTtlSeconds: number;
  private readonly refreshTtlMs: number;

  constructor(
    @InjectModel(RefreshToken.name)
    private readonly tokens: Model<RefreshToken>,
    private readonly jwt: JwtService,
    config: ConfigService,
  ) {
    this.accessTtlSeconds = config.get<number>('JWT_ACCESS_TTL_SECONDS') ?? 900;
    this.refreshTtlMs =
      (config.get<number>('REFRESH_TOKEN_TTL_DAYS') ?? 30) * 24 * 60 * 60_000;
  }

  signAccessToken(
    user: UserDocument,
    sessionId: string,
    mfa: boolean,
  ): Promise<string> {
    const payload: AccessTokenPayload = {
      sub: user._id.toString(),
      email: user.email,
      role: user.role,
      mfa,
      sid: sessionId,
      typ: 'access',
    };
    return this.jwt.signAsync(payload, { expiresIn: this.accessTtlSeconds });
  }

  /** Starts a new session (a new token family) for a freshly authenticated user. */
  async start(
    user: UserDocument,
    mfa: boolean,
    client: ClientInfo,
  ): Promise<IssuedSession> {
    return this.issue(user, randomUUID(), mfa, client);
  }

  /**
   * Exchanges a refresh token for a new pair. The old token is revoked atomically, so only one of
   * two concurrent requests wins the rotation; the other falls into the grace-window path.
   */
  async rotate(
    rawToken: string,
    client: ClientInfo,
    loadUser: (userId: string) => Promise<UserDocument | null>,
  ): Promise<{ user: UserDocument; session: IssuedSession }> {
    const now = new Date();
    const tokenHash = hashToken(rawToken);
    const claimed = await this.tokens
      .findOneAndUpdate(
        { tokenHash, revokedAt: null, expiresAt: { $gt: now } },
        { $set: { revokedAt: now, revokedReason: 'rotated' } },
        { returnDocument: 'after' },
      )
      .exec();

    const token = claimed ?? (await this.handleUnclaimable(tokenHash, now));
    const user = await loadUser(token.userId.toString());
    if (!user || user.accountStatus !== 'active') {
      await this.revokeFamily(token.familyId, 'suspended');
      throw new UnauthorizedException(INVALID_SESSION);
    }
    const session = await this.issue(user, token.familyId, token.mfa, client);
    return { user, session };
  }

  /**
   * The token couldn't be claimed: unknown, expired, revoked by logout, or already rotated.
   * Returns the token only when it is a same-family race inside the grace window.
   */
  private async handleUnclaimable(
    tokenHash: string,
    now: Date,
  ): Promise<RefreshTokenDocument> {
    const existing = await this.tokens.findOne({ tokenHash }).exec();
    if (
      !existing ||
      existing.expiresAt <= now ||
      existing.revokedReason !== 'rotated'
    ) {
      throw new UnauthorizedException(INVALID_SESSION);
    }
    const age = now.getTime() - (existing.revokedAt?.getTime() ?? 0);
    // "Was this session deliberately ended?" (logout, theft, password change), not "does it have
    // a live token right now". The concurrent winner may not have saved its new token yet, and
    // treating that gap as theft logged two-tab users out (caught by the race test in BS-4).
    const familyEnded = await this.tokens
      .exists({
        familyId: existing.familyId,
        revokedReason: { $nin: ['rotated', null] },
      })
      .exec();
    if (age <= REFRESH_REUSE_GRACE_MS && !familyEnded) return existing;

    // A token rotated a while ago is being replayed: most likely stolen. End that session.
    await this.revokeFamily(existing.familyId, 'reuse_detected');
    this.logger.warn(
      `Refresh token reuse detected for user ${existing.userId.toString()}; session ${existing.familyId} revoked`,
    );
    throw new UnauthorizedException(INVALID_SESSION);
  }

  private async issue(
    user: UserDocument,
    familyId: string,
    mfa: boolean,
    client: ClientInfo,
  ): Promise<IssuedSession> {
    const refreshToken = randomToken();
    const refreshExpiresAt = new Date(Date.now() + this.refreshTtlMs);
    await this.tokens.create({
      userId: user._id,
      familyId,
      tokenHash: hashToken(refreshToken),
      mfa,
      expiresAt: refreshExpiresAt,
      userAgent: client.userAgent,
      ip: client.ip,
    });
    const accessToken = await this.signAccessToken(user, familyId, mfa);
    return { accessToken, refreshToken, refreshExpiresAt, sessionId: familyId };
  }

  /** Marks the current session as having passed two-step verification (after enrolling). */
  async markMfa(sessionId: string): Promise<void> {
    await this.tokens
      .updateMany(
        { familyId: sessionId, revokedAt: null },
        { $set: { mfa: true } },
      )
      .exec();
  }

  async revokeByToken(rawToken: string): Promise<void> {
    const token = await this.tokens
      .findOne({ tokenHash: hashToken(rawToken) })
      .exec();
    if (token) await this.revokeFamily(token.familyId, 'logout');
  }

  async revokeFamily(familyId: string, reason: RevokeReason): Promise<void> {
    await this.tokens
      .updateMany(
        { familyId, revokedAt: null },
        { $set: { revokedAt: new Date(), revokedReason: reason } },
      )
      .exec();
  }

  /** Signs the user out everywhere, optionally keeping one session (e.g. after a password change). */
  async revokeAllForUser(
    userId: string,
    reason: RevokeReason,
    keepSessionId?: string,
  ): Promise<void> {
    await this.tokens
      .updateMany(
        {
          userId: new Types.ObjectId(userId),
          revokedAt: null,
          ...(keepSessionId ? { familyId: { $ne: keepSessionId } } : {}),
        },
        { $set: { revokedAt: new Date(), revokedReason: reason } },
      )
      .exec();
  }

  async list(
    userId: string,
    currentSessionId: string,
  ): Promise<SessionSummary[]> {
    const active = await this.tokens
      .find({
        userId: new Types.ObjectId(userId),
        revokedAt: null,
        expiresAt: { $gt: new Date() },
      })
      .sort({ createdAt: -1 })
      .lean()
      .exec();
    const firstSeen = await this.tokens
      .aggregate<{ _id: string; createdAt: Date }>([
        { $match: { familyId: { $in: active.map((t) => t.familyId) } } },
        { $group: { _id: '$familyId', createdAt: { $min: '$createdAt' } } },
      ])
      .exec();
    const started = new Map(firstSeen.map((row) => [row._id, row.createdAt]));
    return active.map((token) => {
      const { createdAt } = token as unknown as { createdAt: Date };
      return {
        id: token.familyId,
        device: describeDevice(token.userAgent),
        ip: token.ip,
        lastActiveAt: createdAt.toISOString(),
        createdAt: (started.get(token.familyId) ?? createdAt).toISOString(),
        current: token.familyId === currentSessionId,
      };
    });
  }

  /** Revokes one of the user's own sessions. Returns false if it isn't theirs or is already gone. */
  async revokeOwn(userId: string, sessionId: string): Promise<boolean> {
    const result = await this.tokens
      .updateMany(
        {
          userId: new Types.ObjectId(userId),
          familyId: sessionId,
          revokedAt: null,
        },
        { $set: { revokedAt: new Date(), revokedReason: 'revoked_by_user' } },
      )
      .exec();
    return result.modifiedCount > 0;
  }

  /** Whether this user has signed in from a similar device before (for "new sign-in" emails). */
  async hasSeenDevice(userId: string, userAgent: string): Promise<boolean> {
    const device = describeDevice(userAgent);
    const previous = await this.tokens
      .find({ userId: new Types.ObjectId(userId) }, { userAgent: 1 })
      .sort({ createdAt: -1 })
      .limit(200)
      .lean()
      .exec();
    if (previous.length === 0) return true; // first ever sign-in: nothing to compare against
    return previous.some((token) => describeDevice(token.userAgent) === device);
  }
}
