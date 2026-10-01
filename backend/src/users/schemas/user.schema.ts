import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import type { HydratedDocument, Types } from 'mongoose';
import { CURRENCIES, type Currency } from '../../common/money/currency.js';

export { CURRENCIES, type Currency };

export const USER_ROLES = ['customer', 'admin', 'owner'] as const;
export type UserRole = (typeof USER_ROLES)[number];
/** Roles that can act on the store: they must use two-step verification (ARCHITECTURE §5). */
export const STAFF_ROLES: readonly UserRole[] = ['admin', 'owner'];

export const ACCOUNT_STATUSES = ['active', 'unclaimed', 'suspended'] as const;
/**
 * `unclaimed`: created by guest checkout (no password yet). It owns orders and a library, but
 * nobody can sign in to it until the owner of the email sets a password through an emailed link.
 */
export type AccountStatus = (typeof ACCOUNT_STATUSES)[number];

export const MAX_ADDRESSES = 10;

@Schema({ _id: true, timestamps: false })
export class Address {
  _id: Types.ObjectId;

  @Prop({ type: String, trim: true, maxlength: 40, default: '' })
  label: string;

  @Prop({ type: String, required: true, trim: true, maxlength: 120 })
  fullName: string;

  @Prop({ type: String, required: true, trim: true, maxlength: 30 })
  phone: string;

  @Prop({ type: String, required: true, trim: true, maxlength: 200 })
  line1: string;

  @Prop({ type: String, trim: true, maxlength: 200, default: '' })
  line2: string;

  @Prop({ type: String, required: true, trim: true, maxlength: 100 })
  city: string;

  @Prop({ type: String, trim: true, maxlength: 100, default: '' })
  state: string;

  @Prop({ type: String, trim: true, maxlength: 20, default: '' })
  postalCode: string;

  /** ISO 3166-1 alpha-2, e.g. "NG". */
  @Prop({
    type: String,
    required: true,
    uppercase: true,
    minlength: 2,
    maxlength: 2,
  })
  country: string;

  @Prop({ type: Boolean, default: false })
  isDefault: boolean;
}
export const AddressSchema = SchemaFactory.createForClass(Address);

@Schema({ _id: false })
export class TwoFactor {
  @Prop({ type: Boolean, default: false })
  enabled: boolean;

  /** AES-256-GCM sealed TOTP seed (SecretBox). Never selected by default. */
  @Prop({ type: String, default: null, select: false })
  secretSealed: string | null;

  /** Seed generated during setup, promoted to `secretSealed` once a code confirms it. */
  @Prop({ type: String, default: null, select: false })
  pendingSecretSealed: string | null;

  /** SHA-256 hashes of unused one-time recovery codes. */
  @Prop({ type: [String], default: [], select: false })
  recoveryCodeHashes: string[];

  @Prop({ type: Date, default: null })
  enabledAt: Date | null;

  /** Last accepted TOTP time-step; a code can't be replayed within its 30s window. */
  @Prop({ type: Number, default: null, select: false })
  lastUsedStep: number | null;
}
export const TwoFactorSchema = SchemaFactory.createForClass(TwoFactor);

@Schema({ collection: 'users', timestamps: true })
export class User {
  @Prop({
    type: String,
    required: true,
    unique: true,
    lowercase: true,
    trim: true,
    maxlength: 254,
  })
  email: string;

  /** bcrypt (cost 12). `null` for an unclaimed guest account. Never selected by default. */
  @Prop({ type: String, default: null, select: false })
  passwordHash: string | null;

  @Prop({ type: String, required: true, trim: true, maxlength: 120 })
  name: string;

  @Prop({ type: String, enum: USER_ROLES, default: 'customer' })
  role: UserRole;

  @Prop({ type: String, enum: ACCOUNT_STATUSES, default: 'active' })
  accountStatus: AccountStatus;

  @Prop({ type: Date, default: null })
  emailVerifiedAt: Date | null;

  @Prop({ type: TwoFactorSchema, default: () => ({}) })
  twoFactor: TwoFactor;

  @Prop({ type: String, enum: CURRENCIES, default: null })
  preferredCurrency: Currency | null;

  @Prop({
    type: String,
    uppercase: true,
    minlength: 2,
    maxlength: 2,
    default: null,
  })
  country: string | null;

  @Prop({ type: [AddressSchema], default: [] })
  addresses: Types.DocumentArray<Address & { _id: Types.ObjectId }>;

  /** Marketing email consent: explicit opt-in only, with a timestamp as evidence (NDPA/GDPR). */
  @Prop({ type: Boolean, default: false })
  marketingOptIn: boolean;

  @Prop({ type: Date, default: null })
  marketingConsentAt: Date | null;

  /** Terms of sale / privacy policy version accepted at registration (evidence of consent). */
  @Prop({ type: String, default: null })
  termsVersion: string | null;

  @Prop({ type: Date, default: null })
  termsAcceptedAt: Date | null;

  @Prop({ type: Date, default: null })
  lastLoginAt: Date | null;

  @Prop({ type: Date, default: null })
  passwordChangedAt: Date | null;

  // Brute-force protection (ARCHITECTURE §5): consecutive failures lock the account briefly.
  @Prop({ type: Number, default: 0, select: false })
  failedLoginCount: number;

  @Prop({ type: Date, default: null, select: false })
  lockedUntil: Date | null;
}

export type UserDocument = HydratedDocument<User>;
export const UserSchema = SchemaFactory.createForClass(User);
UserSchema.index({ role: 1 });
