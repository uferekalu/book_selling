// Mirrors of backend response shapes (docs/ARCHITECTURE.md §1 "Shared types"). The backend DTOs and
// Swagger (/api/docs) are the source of truth; change both sides in the same PR.

import type { Currency } from "@/lib/money";

export type UserRole = "customer" | "admin" | "owner";

export interface PublicUser {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  accountStatus: "active" | "unclaimed" | "suspended";
  emailVerified: boolean;
  twoFactorEnabled: boolean;
  preferredCurrency: Currency | null;
  country: string | null;
  marketingOptIn: boolean;
  createdAt: string;
}

export interface SessionResponse {
  status: "authenticated";
  user: PublicUser;
  accessToken: string;
}

export type LoginResponse = SessionResponse | { status: "mfa_required"; mfaToken: string };

export type RegisterResponse = SessionResponse | { status: "claim_email_sent" };

export type SetPasswordResponse = LoginResponse | { status: "password_set" };

export interface Address {
  id: string;
  label: string;
  fullName: string;
  phone: string;
  line1: string;
  line2: string;
  city: string;
  state: string;
  postalCode: string;
  country: string;
  isDefault: boolean;
}

export type AddressInput = Omit<Address, "id">;

export interface SessionSummary {
  id: string;
  device: string;
  ip: string;
  lastActiveAt: string;
  createdAt: string;
  current: boolean;
}

export interface TwoFactorSetup {
  otpauthUrl: string;
  qrCodeSvg: string;
  manualKey: string;
}

/** The backend's uniform error body (AllExceptionsFilter). */
export interface ApiErrorBody {
  statusCode: number;
  message: string | string[];
  code?: string;
}
