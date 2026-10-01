import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';

/** A URL-safe random secret with 256 bits of entropy (refresh tokens, email links). */
export function randomToken(bytes = 32): string {
  return randomBytes(bytes).toString('base64url');
}

/**
 * SHA-256 of a high-entropy token. Only the hash is stored, so a database leak doesn't hand out
 * working sessions or reset links. A fast hash is correct here, unlike passwords: the input is
 * already random, so there is nothing to brute-force.
 */
export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

/** Constant-time string comparison (no early exit that leaks how many characters matched). */
export function safeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}
