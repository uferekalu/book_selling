import type { UserRole } from '../../users/schemas/user.schema.js';

/** Claims in every access token. `typ` separates them from short-lived challenge tokens. */
export interface AccessTokenPayload {
  sub: string;
  email: string;
  role: UserRole;
  /** The session passed two-step verification. Required for staff routes (ARCHITECTURE §5). */
  mfa: boolean;
  /** Session (refresh-token family) id: marks "this device" in the sessions list. */
  sid: string;
  typ: 'access';
}

/** Issued after a correct password when 2FA is on; exchanged with a code for a real session. */
export interface MfaChallengePayload {
  sub: string;
  typ: 'mfa_challenge';
}

export interface IssuedSession {
  accessToken: string;
  refreshToken: string;
  refreshExpiresAt: Date;
  sessionId: string;
}
