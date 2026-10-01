/**
 * Password rules (NIST SP 800-63B): length over complexity, no composition rules that push people
 * towards "Password1!", and a block on the most common passwords. Mirrored on the frontend for
 * instant feedback; this server check is the one that counts.
 */
export const PASSWORD_MIN_LENGTH = 10;
export const PASSWORD_MAX_LENGTH = 128;

// The most frequently breached passwords that are 10+ characters (lower-cased).
const COMMON_PASSWORDS = new Set([
  '1234567890',
  '0123456789',
  '0987654321',
  '1q2w3e4r5t',
  'qwertyuiop',
  'password12',
  'password123',
  'password1234',
  'passw0rd123',
  'iloveyou12',
  'abcdefghij',
  'qwerty1234',
  'qwerty12345',
  '1111111111',
  'aaaaaaaaaa',
  'football123',
  'princess123',
  'welcome123',
  'letmein123',
  'administrator',
  'changeme123',
  'engineering',
  'engineering123',
  'mechanical',
  'thermodynamics',
]);

/** Returns a human-readable problem, or `null` when the password is acceptable. */
export function passwordProblem(
  password: string,
  context: { email?: string; name?: string } = {},
): string | null {
  if (password.length < PASSWORD_MIN_LENGTH) {
    return `Use at least ${PASSWORD_MIN_LENGTH} characters`;
  }
  if (password.length > PASSWORD_MAX_LENGTH) {
    return `Use at most ${PASSWORD_MAX_LENGTH} characters`;
  }
  const lower = password.toLowerCase();
  if (COMMON_PASSWORDS.has(lower))
    return 'This password is too common. Choose something less predictable';
  if (/^(.)\1+$/.test(password)) return "Don't use a single repeated character";

  const localPart = context.email?.split('@')[0]?.toLowerCase();
  if (localPart && localPart.length >= 4 && lower.includes(localPart)) {
    return "Don't include your email address in your password";
  }
  const nameParts = (context.name ?? '')
    .toLowerCase()
    .split(/\s+/)
    .filter((part) => part.length >= 4);
  if (nameParts.some((part) => lower.includes(part))) {
    return "Don't include your name in your password";
  }
  return null;
}
