import { ConfigModule } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { MongooseModule, getModelToken } from '@nestjs/mongoose';
import { Test, type TestingModule } from '@nestjs/testing';
import bcrypt from 'bcryptjs';
import type { MongoMemoryReplSet } from 'mongodb-memory-server';
import type { Model } from 'mongoose';
import { Secret, TOTP } from 'otpauth';
import { startMongo } from '../../test/mongo.js';
import { TEST_JWT_SECRET, TEST_TWO_FACTOR_KEY } from '../../test/test-env.js';
import { AuditModule } from '../audit/audit.module.js';
import type { ClientInfo } from '../common/http/client-info.js';
import { EmailOutbox } from '../mail/schemas/email-outbox.schema.js';
import { User } from '../users/schemas/user.schema.js';
import { UsersService } from '../users/users.service.js';
import { AuthModule } from './auth.module.js';
import {
  AuthService,
  MAX_FAILED_LOGINS,
  type AuthResult,
} from './auth.service.js';
import type { AccessTokenPayload } from './interfaces/auth.types.js';
import { RefreshToken } from './schemas/refresh-token.schema.js';
import { SessionService } from './session.service.js';

const ANDROID: ClientInfo = {
  ip: '102.89.1.1',
  userAgent:
    'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0 Mobile Safari/537.36',
};
const WINDOWS: ClientInfo = {
  ip: '81.2.69.160',
  userAgent:
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0 Safari/537.36',
};
const PASSWORD = 'lathe-gearbox-torque-42';

describe('AuthService', () => {
  let mongod: MongoMemoryReplSet;
  let moduleRef: TestingModule;
  let auth: AuthService;
  let sessions: SessionService;
  let usersService: UsersService;
  let jwt: JwtService;
  let users: Model<User>;
  let outbox: Model<EmailOutbox>;
  let refreshTokens: Model<RefreshToken>;

  beforeAll(async () => {
    mongod = await startMongo();
    moduleRef = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({
          isGlobal: true,
          ignoreEnvFile: true,
          load: [
            () => ({
              NODE_ENV: 'test',
              FRONTEND_URL: 'https://books.example.com',
              JWT_ACCESS_SECRET: TEST_JWT_SECRET,
              TWO_FACTOR_ENCRYPTION_KEY: TEST_TWO_FACTOR_KEY,
              JWT_ACCESS_TTL_SECONDS: 900,
              REFRESH_TOKEN_TTL_DAYS: 30,
              BCRYPT_COST: 4,
            }),
          ],
        }),
        MongooseModule.forRoot(mongod.getUri()),
        AuditModule,
        AuthModule,
      ],
    }).compile();
    auth = moduleRef.get(AuthService);
    sessions = moduleRef.get(SessionService);
    usersService = moduleRef.get(UsersService);
    jwt = moduleRef.get(JwtService);
    users = moduleRef.get(getModelToken(User.name));
    outbox = moduleRef.get(getModelToken(EmailOutbox.name));
    refreshTokens = moduleRef.get(getModelToken(RefreshToken.name));
    await Promise.all([
      users.syncIndexes(),
      outbox.syncIndexes(),
      refreshTokens.syncIndexes(),
    ]);
  }, 90_000);

  afterAll(async () => {
    await moduleRef?.close();
    await mongod?.stop();
  });

  beforeEach(async () => {
    const collections = await users.db.listCollections();
    await Promise.all(
      collections.map((c) => users.db.collection(c.name).deleteMany({})),
    );
  });

  // ---------------------------------------------------------------- helpers

  const register = (
    email = 'ada@example.com',
    password = PASSWORD,
    client = ANDROID,
  ) =>
    auth.register(
      {
        name: 'Ada Okafor',
        email,
        password,
        acceptTerms: true,
        marketingOptIn: false,
      },
      client,
    );

  async function registered(email = 'ada@example.com') {
    const result = await register(email);
    if (result.status !== 'registered')
      throw new Error('expected a new account');
    return result;
  }

  const emails = (template: string) =>
    outbox.find({ template }).sort({ createdAt: 1 }).lean().exec();

  /** Extracts the token from the most recent link email of a template. */
  async function linkToken(template: string, field: string): Promise<string> {
    const rows = await emails(template);
    const data = rows.at(-1)?.data as Record<string, string> | undefined;
    if (!data) throw new Error(`no ${template} email was queued`);
    const url = data[field];
    return new URL(url).searchParams.get('token')!;
  }

  const decode = (token: string) => jwt.verify<AccessTokenPayload>(token);

  function authenticated(result: AuthResult | { status: string }) {
    if (result.status !== 'authenticated')
      throw new Error(`expected authenticated, got ${result.status}`);
    return result as Extract<AuthResult, { status: 'authenticated' }>;
  }

  async function enableTwoFactor(userId: string, sessionId: string) {
    const setup = await auth.beginTwoFactorSetup(userId, PASSWORD);
    const secret = Secret.fromBase32(setup.manualKey.replace(/\s/g, ''));
    const code = TOTP.generate({ secret, period: 30 });
    const { recoveryCodes, accessToken } = await auth.enableTwoFactor(
      userId,
      sessionId,
      code,
      ANDROID,
    );
    return { secret, recoveryCodes, accessToken };
  }

  // ---------------------------------------------------------------- registration

  describe('register', () => {
    it('creates an active account, hashes the password, records consent and emails a verification link', async () => {
      const { user, session } = await registered();
      expect(user).toMatchObject({
        email: 'ada@example.com',
        role: 'customer',
        accountStatus: 'active',
        emailVerified: false,
      });

      const stored = await users
        .findOne({ email: 'ada@example.com' })
        .select('+passwordHash')
        .lean();
      expect(stored?.passwordHash).not.toContain(PASSWORD);
      expect(await bcrypt.compare(PASSWORD, stored!.passwordHash!)).toBe(true);
      expect(stored?.termsAcceptedAt).toBeInstanceOf(Date);
      expect(stored?.termsVersion).toBeTruthy();

      expect(decode(session.accessToken)).toMatchObject({
        sub: user.id,
        role: 'customer',
        mfa: false,
        typ: 'access',
      });
      const [verify] = await emails('auth.verify-email');
      expect((verify.data as { verifyUrl: string }).verifyUrl).toMatch(
        /^https:\/\/books\.example\.com\/verify-email\?token=/,
      );
    });

    it('rejects weak passwords with a helpful message', async () => {
      await expect(register('ada@example.com', 'password123')).rejects.toThrow(
        /too common/,
      );
      await expect(register('ada@example.com', 'short')).rejects.toThrow(
        /at least 10/,
      );
    });

    it('refuses a second account for a claimed email', async () => {
      await registered();
      await expect(register('ADA@example.com')).rejects.toThrow(
        /already exists/,
      );
    });

    it('never sets a password on a guest account from an unverified request: it emails a claim link', async () => {
      await usersService.findOrCreateForGuest(
        'guest@example.com',
        'Guest Buyer',
      );
      const result = await register('guest@example.com');
      expect(result).toEqual({ status: 'claim_email_sent' });
      const stored = await users
        .findOne({ email: 'guest@example.com' })
        .select('+passwordHash')
        .lean();
      expect(stored?.passwordHash).toBeNull();
      expect(stored?.accountStatus).toBe('unclaimed');
      expect(await emails('auth.claim-account')).toHaveLength(1);
    });
  });

  // ---------------------------------------------------------------- login

  describe('login', () => {
    it('signs in with the right password', async () => {
      await registered();
      const result = authenticated(
        await auth.login('Ada@Example.com', PASSWORD, ANDROID),
      );
      expect(result.user.email).toBe('ada@example.com');
      expect(result.session.refreshToken).toMatch(/^[A-Za-z0-9_-]{43}$/);
    });

    it('gives the same answer for a wrong password, an unknown email and an unclaimed account', async () => {
      await registered();
      await usersService.findOrCreateForGuest('guest@example.com', 'Guest');
      const messages = await Promise.all([
        auth
          .login('ada@example.com', 'wrong-password-123', ANDROID)
          .catch((e: Error) => e.message),
        auth
          .login('nobody@example.com', PASSWORD, ANDROID)
          .catch((e: Error) => e.message),
        auth
          .login('guest@example.com', PASSWORD, ANDROID)
          .catch((e: Error) => e.message),
      ]);
      expect(new Set(messages)).toEqual(
        new Set(['Incorrect email or password']),
      );
    });

    it('locks the account after repeated failures, even for the right password, then unlocks after a reset', async () => {
      await registered();
      for (let i = 0; i < MAX_FAILED_LOGINS; i += 1) {
        await auth
          .login('ada@example.com', `wrong-password-${i}`, ANDROID)
          .catch(() => undefined);
      }
      await expect(
        auth.login('ada@example.com', PASSWORD, ANDROID),
      ).rejects.toThrow(/Too many failed attempts/);

      await auth.forgotPassword('ada@example.com');
      const token = await linkToken('auth.password-reset', 'resetUrl');
      await auth.setPasswordFromLink(
        'reset_password',
        token,
        'new-bearing-press-77',
        ANDROID,
      );
      authenticated(
        await auth.login('ada@example.com', 'new-bearing-press-77', ANDROID),
      );
    });

    it('resets the failure counter after a successful sign-in', async () => {
      await registered();
      for (let i = 0; i < MAX_FAILED_LOGINS - 1; i += 1) {
        await auth
          .login('ada@example.com', `wrong-password-${i}`, ANDROID)
          .catch(() => undefined);
      }
      authenticated(await auth.login('ada@example.com', PASSWORD, ANDROID));
      await auth
        .login('ada@example.com', 'wrong-password-x', ANDROID)
        .catch(() => undefined);
      authenticated(await auth.login('ada@example.com', PASSWORD, ANDROID));
    });

    it('refuses a suspended account', async () => {
      await registered();
      await users.updateOne(
        { email: 'ada@example.com' },
        { accountStatus: 'suspended' },
      );
      await expect(
        auth.login('ada@example.com', PASSWORD, ANDROID),
      ).rejects.toThrow(/suspended/);
    });

    it('emails a security notice for a sign-in from a new kind of device only', async () => {
      await registered();
      authenticated(await auth.login('ada@example.com', PASSWORD, ANDROID));
      expect(await emails('auth.security-notice')).toHaveLength(0);
      authenticated(await auth.login('ada@example.com', PASSWORD, WINDOWS));
      const notices = await emails('auth.security-notice');
      expect(notices).toHaveLength(1);
      expect(notices[0].data).toMatchObject({
        event: 'new_login',
        device: 'Chrome on Windows',
      });
    });
  });

  // ---------------------------------------------------------------- refresh rotation

  describe('refresh', () => {
    it('rotates: the new token works and the session keeps its id', async () => {
      const { session } = await registered();
      const first = await auth.refresh(session.refreshToken, ANDROID);
      expect(first.session.refreshToken).not.toBe(session.refreshToken);
      expect(first.session.sessionId).toBe(session.sessionId);
      const second = await auth.refresh(first.session.refreshToken, ANDROID);
      expect(second.user.email).toBe('ada@example.com');
    });

    it('treats a reused token inside the grace window as a harmless race (two tabs)', async () => {
      const { session } = await registered();
      const [a, b] = await Promise.all([
        auth.refresh(session.refreshToken, ANDROID),
        auth.refresh(session.refreshToken, ANDROID),
      ]);
      expect(a.session.sessionId).toBe(b.session.sessionId);
      await auth.refresh(a.session.refreshToken, ANDROID);
      await auth.refresh(b.session.refreshToken, ANDROID);
    });

    it('revokes the whole session when an old token is replayed after the grace window (theft)', async () => {
      const { session } = await registered();
      const next = await auth.refresh(session.refreshToken, ANDROID);
      await refreshTokens.updateOne(
        { revokedReason: 'rotated' },
        { revokedAt: new Date(Date.now() - 60_000) },
      );

      await expect(auth.refresh(session.refreshToken, ANDROID)).rejects.toThrow(
        /session has ended/,
      );
      // The attacker's replay also kills the legitimate holder's newer token.
      await expect(
        auth.refresh(next.session.refreshToken, ANDROID),
      ).rejects.toThrow(/session has ended/);
      expect(
        await refreshTokens.countDocuments({ revokedReason: 'reuse_detected' }),
      ).toBeGreaterThan(0);
    });

    it('rejects unknown and logged-out tokens', async () => {
      const { session } = await registered();
      await expect(auth.refresh('not-a-real-token', ANDROID)).rejects.toThrow(
        /session has ended/,
      );
      await sessions.revokeByToken(session.refreshToken);
      await expect(auth.refresh(session.refreshToken, ANDROID)).rejects.toThrow(
        /session has ended/,
      );
    });

    it('ends the session when the account is suspended', async () => {
      const { session } = await registered();
      await users.updateOne(
        { email: 'ada@example.com' },
        { accountStatus: 'suspended' },
      );
      await expect(auth.refresh(session.refreshToken, ANDROID)).rejects.toThrow(
        /session has ended/,
      );
    });

    it('lists sessions per device and revokes one', async () => {
      const { user, session } = await registered();
      const other = authenticated(
        await auth.login('ada@example.com', PASSWORD, WINDOWS),
      );
      const list = await sessions.list(user.id, session.sessionId);
      expect(list).toHaveLength(2);
      expect(list.find((s) => s.current)?.device).toBe('Chrome on Android');
      expect(await sessions.revokeOwn(user.id, other.session.sessionId)).toBe(
        true,
      );
      await expect(
        auth.refresh(other.session.refreshToken, WINDOWS),
      ).rejects.toThrow();
      expect(await sessions.revokeOwn('0'.repeat(24), session.sessionId)).toBe(
        false,
      );
    });
  });

  // ---------------------------------------------------------------- email links

  describe('email links', () => {
    it('verifies the email once and sends a single welcome email', async () => {
      await registered();
      const token = await linkToken('auth.verify-email', 'verifyUrl');
      expect((await auth.verifyEmail(token)).emailVerified).toBe(true);
      await expect(auth.verifyEmail(token)).rejects.toThrow(
        /invalid or has expired/,
      );
      expect(await emails('auth.welcome')).toHaveLength(1);
    });

    it('does not reveal whether an email has an account', async () => {
      await expect(
        auth.forgotPassword('nobody@example.com'),
      ).resolves.toBeUndefined();
      expect(await outbox.countDocuments()).toBe(0);
    });

    it('resets the password: single-use link, other sessions end, email becomes verified, signed in', async () => {
      const { session } = await registered();
      await auth.forgotPassword('ada@example.com');
      const token = await linkToken('auth.password-reset', 'resetUrl');
      const result = authenticated(
        await auth.setPasswordFromLink(
          'reset_password',
          token,
          'new-bearing-press-77',
          ANDROID,
        ),
      );
      expect(result.user.emailVerified).toBe(true);
      await expect(
        auth.refresh(session.refreshToken, ANDROID),
      ).rejects.toThrow();
      await expect(
        auth.setPasswordFromLink(
          'reset_password',
          token,
          'another-pass-99x',
          ANDROID,
        ),
      ).rejects.toThrow(/invalid/);
      expect(
        (await emails('auth.security-notice')).map(
          (e) => (e.data as { event: string }).event,
        ),
      ).toContain('password_changed');
    });

    it('only the newest reset link works', async () => {
      await registered();
      await auth.forgotPassword('ada@example.com');
      const older = await linkToken('auth.password-reset', 'resetUrl');
      await auth.forgotPassword('ada@example.com');
      await expect(
        auth.setPasswordFromLink(
          'reset_password',
          older,
          'new-bearing-press-77',
          ANDROID,
        ),
      ).rejects.toThrow(/invalid/);
    });

    it('lets a guest claim their account through the emailed link', async () => {
      const guest = await usersService.findOrCreateForGuest(
        'guest@example.com',
        'Guest Buyer',
      );
      await auth.sendClaimLink(guest, 'BS-2026-000001');
      const token = await linkToken('auth.claim-account', 'claimUrl');
      const result = authenticated(
        await auth.setPasswordFromLink(
          'claim_account',
          token,
          'new-bearing-press-77',
          ANDROID,
        ),
      );
      expect(result.user).toMatchObject({
        accountStatus: 'active',
        emailVerified: true,
      });
      authenticated(
        await auth.login('guest@example.com', 'new-bearing-press-77', ANDROID),
      );
    });
  });

  describe('changePassword', () => {
    it('requires the current password and keeps only this session', async () => {
      const { user, session } = await registered();
      const other = authenticated(
        await auth.login('ada@example.com', PASSWORD, WINDOWS),
      );
      await expect(
        auth.changePassword(
          user.id,
          session.sessionId,
          'wrong-current-pass',
          'new-bearing-press-77',
          ANDROID,
        ),
      ).rejects.toThrow(/incorrect/);

      await auth.changePassword(
        user.id,
        session.sessionId,
        PASSWORD,
        'new-bearing-press-77',
        ANDROID,
      );
      await expect(
        auth.refresh(other.session.refreshToken, WINDOWS),
      ).rejects.toThrow();
      await auth.refresh(session.refreshToken, ANDROID);
    });
  });

  // ---------------------------------------------------------------- two-step verification

  describe('two-step verification', () => {
    it('requires a code after the password once enabled, and upgrades the session to mfa', async () => {
      const { user, session } = await registered();
      const { secret, recoveryCodes, accessToken } = await enableTwoFactor(
        user.id,
        session.sessionId,
      );
      expect(recoveryCodes).toHaveLength(10);
      expect(decode(accessToken).mfa).toBe(true);
      // The current session's refreshed tokens stay mfa-verified.
      const refreshed = await auth.refresh(session.refreshToken, ANDROID);
      expect(decode(refreshed.session.accessToken).mfa).toBe(true);

      const challenge = await auth.login('ada@example.com', PASSWORD, ANDROID);
      expect(challenge.status).toBe('mfa_required');
      const mfaToken = (challenge as { mfaToken: string }).mfaToken;
      await expect(
        auth.loginWithSecondFactor(mfaToken, { code: '000000' }, ANDROID),
      ).rejects.toThrow(/didn't work/);

      // The code used to enable 2FA can't be replayed; wait for a fresh step by checking the next one.
      const code = TOTP.generate({
        secret,
        period: 30,
        timestamp: Date.now() + 30_000,
      });
      const signedIn = authenticated(
        await auth.loginWithSecondFactor(mfaToken, { code }, ANDROID),
      );
      expect(decode(signedIn.session.accessToken).mfa).toBe(true);
      await expect(
        auth.loginWithSecondFactor(mfaToken, { code }, ANDROID),
      ).rejects.toThrow(/didn't work/);
    });

    it('accepts each recovery code exactly once', async () => {
      const { user, session } = await registered();
      const { recoveryCodes } = await enableTwoFactor(
        user.id,
        session.sessionId,
      );
      const challenge = (await auth.login(
        'ada@example.com',
        PASSWORD,
        ANDROID,
      )) as { mfaToken: string };
      authenticated(
        await auth.loginWithSecondFactor(
          challenge.mfaToken,
          { recoveryCode: recoveryCodes[0].toLowerCase() },
          ANDROID,
        ),
      );
      await expect(
        auth.loginWithSecondFactor(
          challenge.mfaToken,
          { recoveryCode: recoveryCodes[0] },
          ANDROID,
        ),
      ).rejects.toThrow();
    });

    it('rejects a challenge token used as an access token and vice versa', async () => {
      const { user, session } = await registered();
      await enableTwoFactor(user.id, session.sessionId);
      const challenge = (await auth.login(
        'ada@example.com',
        PASSWORD,
        ANDROID,
      )) as { mfaToken: string };
      expect(jwt.verify<{ typ: string }>(challenge.mfaToken).typ).toBe(
        'mfa_challenge',
      );
      await expect(
        auth.loginWithSecondFactor(
          session.accessToken,
          { code: '123456' },
          ANDROID,
        ),
      ).rejects.toThrow();
    });

    it('does not let a reset link bypass the second factor', async () => {
      const { user, session } = await registered();
      await enableTwoFactor(user.id, session.sessionId);
      await auth.forgotPassword('ada@example.com');
      const token = await linkToken('auth.password-reset', 'resetUrl');
      expect(
        await auth.setPasswordFromLink(
          'reset_password',
          token,
          'new-bearing-press-77',
          ANDROID,
        ),
      ).toEqual({ status: 'password_set' });
    });

    it('can be turned off by a customer but never by staff', async () => {
      const { user, session } = await registered();
      const { secret } = await enableTwoFactor(user.id, session.sessionId);
      await users.updateOne({ _id: user.id }, { role: 'admin' });
      const code = () =>
        TOTP.generate({ secret, period: 30, timestamp: Date.now() + 30_000 });
      await expect(
        auth.disableTwoFactor(user.id, PASSWORD, code(), ANDROID),
      ).rejects.toThrow(/required for staff/);

      await users.updateOne({ _id: user.id }, { role: 'customer' });
      await auth.disableTwoFactor(user.id, PASSWORD, code(), ANDROID);
      authenticated(await auth.login('ada@example.com', PASSWORD, ANDROID));
    });

    it('encrypts the seed at rest', async () => {
      const { user, session } = await registered();
      const setup = await auth.beginTwoFactorSetup(user.id, PASSWORD);
      await auth.enableTwoFactor(
        user.id,
        session.sessionId,
        TOTP.generate({
          secret: Secret.fromBase32(setup.manualKey.replace(/\s/g, '')),
          period: 30,
        }),
        ANDROID,
      );
      const stored = await users
        .findById(user.id)
        .select('+twoFactor.secretSealed')
        .lean();
      expect(stored?.twoFactor.secretSealed).toMatch(/^v1\./);
      expect(stored?.twoFactor.secretSealed).not.toContain(
        setup.manualKey.replace(/\s/g, ''),
      );
    });
  });
});
