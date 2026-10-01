import { BadRequestException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectModel } from '@nestjs/mongoose';
import { randomBytes } from 'node:crypto';
import type { Model } from 'mongoose';
import { Secret, TOTP } from 'otpauth';
import QRCode from 'qrcode';
import { SecretBox } from '../common/crypto/secret-box.js';
import { hashToken } from '../common/crypto/tokens.js';
import { User, type UserDocument } from '../users/schemas/user.schema.js';

const PERIOD_SECONDS = 30;
const RECOVERY_CODE_COUNT = 10;

export interface TwoFactorSetup {
  /** `otpauth://` URI, encoded in the QR code. */
  otpauthUrl: string;
  /** QR code as an inline SVG string, rendered by the frontend. */
  qrCodeSvg: string;
  /** The same secret in base32, for typing into an authenticator app by hand. */
  manualKey: string;
}

/** Formats a recovery code for display: `ABCD-EFGH-JK`. */
function newRecoveryCode(): string {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no 0/O or 1/I lookalikes
  const bytes = randomBytes(10);
  const chars = Array.from(bytes, (b) => alphabet[b % alphabet.length]).join(
    '',
  );
  return `${chars.slice(0, 4)}-${chars.slice(4, 8)}-${chars.slice(8, 10)}`;
}

export function normaliseRecoveryCode(code: string): string {
  return code.toUpperCase().replace(/[^A-Z0-9]/g, '');
}

/**
 * TOTP two-step verification (RFC 6238, the codes shown by Google Authenticator, 1Password, Authy):
 * - the seed is encrypted at rest (AES-256-GCM, TWO_FACTOR_ENCRYPTION_KEY);
 * - a code is accepted in a ±30s window, but each time step only once (no replay);
 * - ten single-use recovery codes, stored hashed, cover a lost phone.
 */
@Injectable()
export class TwoFactorService {
  private readonly box: SecretBox;
  private readonly issuer: string;

  constructor(
    @InjectModel(User.name) private readonly users: Model<User>,
    config: ConfigService,
  ) {
    this.box = new SecretBox(
      config.getOrThrow<string>('TWO_FACTOR_ENCRYPTION_KEY'),
    );
    this.issuer = config.get<string>('BRAND_NAME') ?? 'Engineering Books';
  }

  async beginSetup(user: UserDocument): Promise<TwoFactorSetup> {
    if (user.twoFactor?.enabled)
      throw new BadRequestException('Two-step verification is already on');
    const secret = new Secret({ size: 20 });
    const totp = new TOTP({
      issuer: this.issuer,
      label: user.email,
      secret,
      period: PERIOD_SECONDS,
    });
    await this.users
      .updateOne(
        { _id: user._id },
        {
          $set: {
            'twoFactor.pendingSecretSealed': this.box.seal(secret.base32),
          },
        },
      )
      .exec();
    const otpauthUrl = totp.toString();
    const qrCodeSvg = await QRCode.toString(otpauthUrl, {
      type: 'svg',
      margin: 1,
      errorCorrectionLevel: 'M',
    });
    return {
      otpauthUrl,
      qrCodeSvg,
      manualKey: secret.base32.replace(/(.{4})/g, '$1 ').trim(),
    };
  }

  /** Confirms setup with a first code. Returns the recovery codes, shown to the user once. */
  async confirmSetup(user: UserDocument, code: string): Promise<string[]> {
    const pending = user.twoFactor?.pendingSecretSealed;
    if (!pending)
      throw new BadRequestException('Start two-step verification setup first');
    const step = this.validate(this.box.open(pending), code, null);
    if (step === null)
      throw new BadRequestException(
        "That code didn't match. Check your authenticator app and try again",
      );

    const recoveryCodes = Array.from(
      { length: RECOVERY_CODE_COUNT },
      newRecoveryCode,
    );
    await this.users
      .updateOne(
        { _id: user._id },
        {
          $set: {
            'twoFactor.enabled': true,
            'twoFactor.secretSealed': pending,
            'twoFactor.pendingSecretSealed': null,
            'twoFactor.recoveryCodeHashes': recoveryCodes.map((c) =>
              hashToken(normaliseRecoveryCode(c)),
            ),
            'twoFactor.enabledAt': new Date(),
            'twoFactor.lastUsedStep': step,
          },
        },
      )
      .exec();
    return recoveryCodes;
  }

  /**
   * Checks a 6-digit code or a recovery code for a user loaded with secrets. The accepted time step
   * is recorded atomically, so the same code can't be used twice, even by two parallel requests.
   */
  async verify(
    user: UserDocument,
    input: { code?: string; recoveryCode?: string },
  ): Promise<boolean> {
    const sealed = user.twoFactor?.secretSealed;
    if (!user.twoFactor?.enabled || !sealed) return false;

    if (input.recoveryCode) {
      const hash = hashToken(normaliseRecoveryCode(input.recoveryCode));
      const result = await this.users
        .updateOne(
          { _id: user._id, 'twoFactor.recoveryCodeHashes': hash },
          { $pull: { 'twoFactor.recoveryCodeHashes': hash } },
        )
        .exec();
      return result.modifiedCount === 1;
    }

    if (!input.code) return false;
    const step = this.validate(
      this.box.open(sealed),
      input.code,
      user.twoFactor.lastUsedStep ?? null,
    );
    if (step === null) return false;
    const result = await this.users
      .updateOne(
        {
          _id: user._id,
          $or: [
            { 'twoFactor.lastUsedStep': null },
            { 'twoFactor.lastUsedStep': { $lt: step } },
          ],
        },
        { $set: { 'twoFactor.lastUsedStep': step } },
      )
      .exec();
    return result.modifiedCount === 1;
  }

  async regenerateRecoveryCodes(user: UserDocument): Promise<string[]> {
    const recoveryCodes = Array.from(
      { length: RECOVERY_CODE_COUNT },
      newRecoveryCode,
    );
    await this.users
      .updateOne(
        { _id: user._id },
        {
          $set: {
            'twoFactor.recoveryCodeHashes': recoveryCodes.map((c) =>
              hashToken(normaliseRecoveryCode(c)),
            ),
          },
        },
      )
      .exec();
    return recoveryCodes;
  }

  async disable(user: UserDocument): Promise<void> {
    await this.users
      .updateOne(
        { _id: user._id },
        {
          $set: {
            'twoFactor.enabled': false,
            'twoFactor.secretSealed': null,
            'twoFactor.pendingSecretSealed': null,
            'twoFactor.recoveryCodeHashes': [],
            'twoFactor.enabledAt': null,
            'twoFactor.lastUsedStep': null,
          },
        },
      )
      .exec();
  }

  /** Returns the matched time step, or null. Rejects steps at or before `lastUsedStep`. */
  private validate(
    base32Secret: string,
    code: string,
    lastUsedStep: number | null,
  ): number | null {
    const token = code.replace(/\s/g, '');
    if (!/^\d{6}$/.test(token)) return null;
    const secret = Secret.fromBase32(base32Secret);
    const now = Date.now();
    const delta = TOTP.validate({
      token,
      secret,
      period: PERIOD_SECONDS,
      window: 1,
      timestamp: now,
    });
    if (delta === null) return null;
    const step =
      TOTP.counter({ period: PERIOD_SECONDS, timestamp: now }) + delta;
    if (lastUsedStep !== null && step <= lastUsedStep) return null;
    return step;
  }
}
