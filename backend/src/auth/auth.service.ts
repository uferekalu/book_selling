import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import bcrypt from 'bcryptjs';
import { randomBytes } from 'node:crypto';
import { AuditService } from '../audit/audit.module.js';
import { describeDevice, type ClientInfo } from '../common/http/client-info.js';
import { MailService } from '../mail/mail.service.js';
import type { SecurityEvent } from '../mail/templates/auth.js';
import { toPublicUser, type PublicUser } from '../users/dto/user.dto.js';
import {
  STAFF_ROLES,
  type UserDocument,
} from '../users/schemas/user.schema.js';
import { UsersService } from '../users/users.service.js';
import { AuthTokenService, LINK_TTL_MS } from './auth-token.service.js';
import type { RegisterDto } from './dto/auth.dto.js';
import type {
  IssuedSession,
  MfaChallengePayload,
} from './interfaces/auth.types.js';
import { passwordProblem } from './password-policy.js';
import { SessionService } from './session.service.js';
import { TwoFactorService, type TwoFactorSetup } from './two-factor.service.js';

export const MAX_FAILED_LOGINS = 10;
export const LOCKOUT_MS = 15 * 60_000;
const MFA_CHALLENGE_TTL_SECONDS = 5 * 60;
/** Bump when the Terms of Sale or Privacy Policy change materially; stored per user as evidence. */
export const CURRENT_TERMS_VERSION = '2026-09-30';

const INVALID_CREDENTIALS = 'Incorrect email or password';

export type AuthResult =
  | { status: 'authenticated'; user: PublicUser; session: IssuedSession }
  | { status: 'mfa_required'; mfaToken: string };

export type RegisterResult =
  | { status: 'registered'; user: PublicUser; session: IssuedSession }
  | { status: 'claim_email_sent' };

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);
  private readonly frontendUrl: string;
  private readonly bcryptCost: number;
  /** Compared against when the email is unknown, so response time doesn't reveal account existence. */
  private dummyHash: Promise<string> | null = null;

  constructor(
    private readonly users: UsersService,
    private readonly sessions: SessionService,
    private readonly linkTokens: AuthTokenService,
    private readonly twoFactor: TwoFactorService,
    private readonly mail: MailService,
    private readonly audit: AuditService,
    private readonly jwt: JwtService,
    config: ConfigService,
  ) {
    this.frontendUrl = config
      .getOrThrow<string>('FRONTEND_URL')
      .replace(/\/+$/, '');
    this.bcryptCost = Number(config.get('BCRYPT_COST') ?? 12);
  }

  // ---------------------------------------------------------------- registration

  async register(
    dto: RegisterDto,
    client: ClientInfo,
  ): Promise<RegisterResult> {
    this.assertPasswordAllowed(dto.password, dto.email, dto.name);
    const existing = await this.users.findByEmail(dto.email);

    if (existing?.accountStatus === 'unclaimed') {
      // A guest bought with this email. Don't set a password from an unverified request (that
      // would hand the guest's library to whoever typed their address); email them a claim link.
      await this.sendClaimLink(existing);
      return { status: 'claim_email_sent' };
    }
    if (existing) {
      throw new ConflictException(
        'An account with this email already exists. Sign in, or reset your password.',
      );
    }

    const now = new Date();
    const user = await this.users.create({
      email: dto.email,
      name: dto.name,
      passwordHash: await bcrypt.hash(dto.password, this.bcryptCost),
      passwordChangedAt: now,
      marketingOptIn: dto.marketingOptIn === true,
      marketingConsentAt: dto.marketingOptIn === true ? now : null,
      termsVersion: CURRENT_TERMS_VERSION,
      termsAcceptedAt: now,
    });
    await this.sendVerificationLink(user);
    const session = await this.sessions.start(user, false, client);
    await this.users.findByIdAndTouchLogin(user._id.toString());
    return { status: 'registered', user: toPublicUser(user), session };
  }

  // ---------------------------------------------------------------- login

  async login(
    email: string,
    password: string,
    client: ClientInfo,
  ): Promise<AuthResult> {
    const user = await this.users.findByEmailWithSecrets(email);

    if (!user || !user.passwordHash) {
      await bcrypt.compare(password, await this.getDummyHash());
      throw new UnauthorizedException(INVALID_CREDENTIALS);
    }
    if (user.lockedUntil && user.lockedUntil > new Date()) {
      throw new HttpException(
        'Too many failed attempts. Try again in 15 minutes, or reset your password.',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
    if (!(await bcrypt.compare(password, user.passwordHash))) {
      await this.recordFailure(user);
      throw new UnauthorizedException(INVALID_CREDENTIALS);
    }
    this.assertCanSignIn(user);
    await this.users.resetFailures(user._id.toString());

    if (user.twoFactor?.enabled) {
      const payload: MfaChallengePayload = {
        sub: user._id.toString(),
        typ: 'mfa_challenge',
      };
      const mfaToken = await this.jwt.signAsync(payload, {
        expiresIn: MFA_CHALLENGE_TTL_SECONDS,
      });
      return { status: 'mfa_required', mfaToken };
    }
    return this.completeSignIn(user, false, client);
  }

  async loginWithSecondFactor(
    mfaToken: string,
    input: { code?: string; recoveryCode?: string },
    client: ClientInfo,
  ): Promise<AuthResult> {
    let payload: MfaChallengePayload;
    try {
      payload = await this.jwt.verifyAsync<MfaChallengePayload>(mfaToken);
    } catch {
      throw new UnauthorizedException(
        'This sign-in attempt has expired. Please enter your password again.',
      );
    }
    if (payload.typ !== 'mfa_challenge')
      throw new UnauthorizedException(INVALID_CREDENTIALS);

    const user = await this.users.findByIdWithSecrets(payload.sub);
    if (!user) throw new UnauthorizedException(INVALID_CREDENTIALS);
    if (user.lockedUntil && user.lockedUntil > new Date()) {
      throw new HttpException(
        'Too many failed attempts. Try again in 15 minutes.',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
    this.assertCanSignIn(user);
    if (!(await this.twoFactor.verify(user, input))) {
      // Codes are 6 digits: the shared lockout counter caps guessing at 10 attempts per 15 minutes.
      await this.recordFailure(user);
      throw new UnauthorizedException(
        "That code didn't work. Check your authenticator app, or use a recovery code.",
      );
    }
    await this.users.resetFailures(user._id.toString());
    if (input.recoveryCode) {
      await this.audit.record({
        actor: { id: user._id.toString(), role: user.role },
        action: 'auth.recovery_code_used',
        entityType: 'user',
        entityId: user._id.toString(),
        ip: client.ip,
      });
    }
    return this.completeSignIn(user, true, client);
  }

  private async completeSignIn(
    user: UserDocument,
    mfa: boolean,
    client: ClientInfo,
  ): Promise<AuthResult> {
    const userId = user._id.toString();
    const knownDevice = await this.sessions.hasSeenDevice(
      userId,
      client.userAgent,
    );
    const session = await this.sessions.start(user, mfa, client);
    await this.users.findByIdAndTouchLogin(userId);
    if (!knownDevice) {
      await this.sendSecurityNotice(
        user,
        'new_login',
        client,
        `new-login:${session.sessionId}`,
      );
    }
    return { status: 'authenticated', user: toPublicUser(user), session };
  }

  async refresh(
    rawToken: string,
    client: ClientInfo,
  ): Promise<{ user: PublicUser; session: IssuedSession }> {
    const { user, session } = await this.sessions.rotate(
      rawToken,
      client,
      (id) => this.users.findById(id),
    );
    return { user: toPublicUser(user), session };
  }

  // ---------------------------------------------------------------- email links

  async verifyEmail(token: string): Promise<PublicUser> {
    const userId = await this.linkTokens.consume(token, 'verify_email');
    if (!userId)
      throw new BadRequestException(
        'This link is invalid or has expired. Request a new one from your account.',
      );
    const user = await this.users.markEmailVerified(userId);
    await this.mail.enqueue({
      to: user.email,
      template: 'auth.welcome',
      dedupeKey: `welcome:${userId}`,
      data: {
        name: this.firstName(user),
        browseUrl: `${this.frontendUrl}/books`,
      },
    });
    return toPublicUser(user);
  }

  async resendVerification(userId: string): Promise<void> {
    const user = await this.users.getById(userId);
    if (user.emailVerifiedAt)
      throw new BadRequestException('Your email is already confirmed');
    await this.sendVerificationLink(user);
  }

  /** Always succeeds from the caller's view: whether the email exists is never revealed. */
  async forgotPassword(email: string): Promise<void> {
    const user = await this.users.findByEmail(email);
    if (!user || user.accountStatus === 'suspended') return;
    const { token, id } = await this.linkTokens.issue(
      user._id.toString(),
      'reset_password',
    );
    await this.mail.enqueue({
      to: user.email,
      template: 'auth.password-reset',
      dedupeKey: `auth-link:${id}`,
      data: {
        name: this.firstName(user),
        resetUrl: `${this.frontendUrl}/reset-password?token=${token}`,
        expiresInMinutes: LINK_TTL_MS.reset_password / 60_000,
      },
    });
  }

  /**
   * Sets a new password from an emailed link: a reset, or a guest claiming their account. The link
   * proves control of the inbox, so the email becomes verified and an unclaimed account active.
   * Every existing session ends. The person is signed straight in unless 2FA is on, because a
   * reset link must never bypass the second factor.
   */
  async setPasswordFromLink(
    purpose: 'reset_password' | 'claim_account',
    token: string,
    password: string,
    client: ClientInfo,
  ): Promise<AuthResult | { status: 'password_set' }> {
    const userId = await this.linkTokens.consume(token, purpose);
    if (!userId)
      throw new BadRequestException(
        'This link is invalid or has expired. Request a new one.',
      );
    const user = await this.users.getById(userId);
    if (user.accountStatus === 'suspended')
      throw new ForbiddenException(
        'This account is suspended. Contact support.',
      );
    this.assertPasswordAllowed(password, user.email, user.name);

    const updated = await this.users.setPassword(
      userId,
      await bcrypt.hash(password, this.bcryptCost),
      { claim: true },
    );
    await this.linkTokens.invalidateAll(userId, [
      'reset_password',
      'claim_account',
    ]);
    await this.sessions.revokeAllForUser(userId, 'password_changed');
    await this.sendSecurityNotice(
      updated,
      'password_changed',
      client,
      `password-changed:${userId}:${Date.now()}`,
    );

    if (updated.twoFactor?.enabled) return { status: 'password_set' };
    return this.completeSignIn(updated, false, client);
  }

  async changePassword(
    userId: string,
    sessionId: string,
    currentPassword: string,
    newPassword: string,
    client: ClientInfo,
  ): Promise<void> {
    const user = await this.users.findByIdWithSecrets(userId);
    if (
      !user?.passwordHash ||
      !(await bcrypt.compare(currentPassword, user.passwordHash))
    ) {
      throw new BadRequestException('Your current password is incorrect');
    }
    if (currentPassword === newPassword)
      throw new BadRequestException(
        'Choose a password you are not already using',
      );
    this.assertPasswordAllowed(newPassword, user.email, user.name);
    await this.users.setPassword(
      userId,
      await bcrypt.hash(newPassword, this.bcryptCost),
      { claim: false },
    );
    // Other devices are signed out; this one stays signed in.
    await this.sessions.revokeAllForUser(userId, 'password_changed', sessionId);
    await this.sendSecurityNotice(
      user,
      'password_changed',
      client,
      `password-changed:${userId}:${Date.now()}`,
    );
  }

  // ---------------------------------------------------------------- two-step verification

  async beginTwoFactorSetup(
    userId: string,
    password: string,
  ): Promise<TwoFactorSetup> {
    const user = await this.requirePassword(userId, password);
    return this.twoFactor.beginSetup(user);
  }

  /** Turns 2FA on and upgrades the current session to `mfa`. Returns the one-time recovery codes. */
  async enableTwoFactor(
    userId: string,
    sessionId: string,
    code: string,
    client: ClientInfo,
  ): Promise<{ recoveryCodes: string[]; accessToken: string }> {
    const user = await this.users.findByIdWithSecrets(userId);
    if (!user) throw new UnauthorizedException();
    const recoveryCodes = await this.twoFactor.confirmSetup(user, code);
    await this.sessions.markMfa(sessionId);
    const refreshed = await this.users.getById(userId);
    await this.audit.record({
      actor: { id: userId, role: user.role },
      action: 'auth.two_factor_enabled',
      entityType: 'user',
      entityId: userId,
      ip: client.ip,
    });
    await this.sendSecurityNotice(
      refreshed,
      'two_factor_enabled',
      client,
      `2fa-on:${userId}:${Date.now()}`,
    );
    return {
      recoveryCodes,
      accessToken: await this.sessions.signAccessToken(
        refreshed,
        sessionId,
        true,
      ),
    };
  }

  async disableTwoFactor(
    userId: string,
    password: string,
    code: string,
    client: ClientInfo,
  ): Promise<void> {
    const user = await this.requirePassword(userId, password);
    if (STAFF_ROLES.includes(user.role)) {
      throw new ForbiddenException(
        'Two-step verification is required for staff accounts and cannot be turned off',
      );
    }
    if (!(await this.twoFactor.verify(user, { code })))
      throw new BadRequestException("That code didn't match");
    await this.twoFactor.disable(user);
    await this.audit.record({
      actor: { id: userId, role: user.role },
      action: 'auth.two_factor_disabled',
      entityType: 'user',
      entityId: userId,
      ip: client.ip,
    });
    await this.sendSecurityNotice(
      user,
      'two_factor_disabled',
      client,
      `2fa-off:${userId}:${Date.now()}`,
    );
  }

  async regenerateRecoveryCodes(
    userId: string,
    code: string,
  ): Promise<string[]> {
    const user = await this.users.findByIdWithSecrets(userId);
    if (!user || !(await this.twoFactor.verify(user, { code })))
      throw new BadRequestException("That code didn't match");
    return this.twoFactor.regenerateRecoveryCodes(user);
  }

  // ---------------------------------------------------------------- helpers

  private assertPasswordAllowed(password: string, email: string, name: string) {
    const problem = passwordProblem(password, { email, name });
    if (problem) throw new BadRequestException(problem);
  }

  private assertCanSignIn(user: UserDocument) {
    if (user.accountStatus === 'suspended') {
      throw new ForbiddenException(
        'This account is suspended. Contact support for help.',
      );
    }
  }

  private async requirePassword(
    userId: string,
    password: string,
  ): Promise<UserDocument> {
    const user = await this.users.findByIdWithSecrets(userId);
    if (
      !user?.passwordHash ||
      !(await bcrypt.compare(password, user.passwordHash))
    ) {
      throw new BadRequestException('Your password is incorrect');
    }
    return user;
  }

  private async recordFailure(user: UserDocument) {
    const locked = await this.users.recordFailedLogin(
      user._id.toString(),
      MAX_FAILED_LOGINS,
      LOCKOUT_MS,
    );
    if (locked)
      this.logger.warn(
        `Account ${user._id.toString()} locked after ${MAX_FAILED_LOGINS} failed attempts`,
      );
  }

  private getDummyHash(): Promise<string> {
    this.dummyHash ??= bcrypt.hash(
      randomBytes(16).toString('hex'),
      this.bcryptCost,
    );
    return this.dummyHash;
  }

  private firstName(user: UserDocument): string {
    return user.name.split(/\s+/)[0] || user.name;
  }

  private async sendVerificationLink(user: UserDocument) {
    const { token, id } = await this.linkTokens.issue(
      user._id.toString(),
      'verify_email',
    );
    await this.mail.enqueue({
      to: user.email,
      template: 'auth.verify-email',
      dedupeKey: `auth-link:${id}`,
      data: {
        name: this.firstName(user),
        verifyUrl: `${this.frontendUrl}/verify-email?token=${token}`,
        expiresInHours: LINK_TTL_MS.verify_email / 3_600_000,
      },
    });
  }

  /** Also used by guest checkout (BS-7) after an order is placed on an unclaimed account. */
  async sendClaimLink(user: UserDocument, orderNumber?: string) {
    const { token, id } = await this.linkTokens.issue(
      user._id.toString(),
      'claim_account',
    );
    await this.mail.enqueue({
      to: user.email,
      template: 'auth.claim-account',
      dedupeKey: `auth-link:${id}`,
      data: {
        name: this.firstName(user),
        claimUrl: `${this.frontendUrl}/claim-account?token=${token}`,
        expiresInDays: LINK_TTL_MS.claim_account / 86_400_000,
        ...(orderNumber ? { orderNumber } : {}),
      },
    });
  }

  private async sendSecurityNotice(
    user: UserDocument,
    event: SecurityEvent,
    client: ClientInfo,
    dedupeKey: string,
  ) {
    await this.mail.enqueue({
      to: user.email,
      template: 'auth.security-notice',
      dedupeKey,
      data: {
        name: this.firstName(user),
        event,
        occurredAt: new Date().toISOString(),
        device: describeDevice(client.userAgent),
        secureAccountUrl: `${this.frontendUrl}/account/security`,
      },
    });
  }
}
