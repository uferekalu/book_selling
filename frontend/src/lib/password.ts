/**
 * Mirror of backend/src/auth/password-policy.ts for instant feedback while typing. The server's
 * check is authoritative; keep the two in step.
 */
export const PASSWORD_MIN_LENGTH = 10;
export const PASSWORD_MAX_LENGTH = 128;

const COMMON_PASSWORDS = new Set([
  "1234567890",
  "0123456789",
  "0987654321",
  "1q2w3e4r5t",
  "qwertyuiop",
  "password12",
  "password123",
  "password1234",
  "passw0rd123",
  "iloveyou12",
  "abcdefghij",
  "qwerty1234",
  "qwerty12345",
  "1111111111",
  "aaaaaaaaaa",
  "football123",
  "princess123",
  "welcome123",
  "letmein123",
  "administrator",
  "changeme123",
  "engineering",
  "engineering123",
  "mechanical",
  "thermodynamics",
]);

export function passwordProblem(password: string, context: { email?: string; name?: string } = {}): string | null {
  if (password.length < PASSWORD_MIN_LENGTH) return `Use at least ${PASSWORD_MIN_LENGTH} characters`;
  if (password.length > PASSWORD_MAX_LENGTH) return `Use at most ${PASSWORD_MAX_LENGTH} characters`;
  const lower = password.toLowerCase();
  if (COMMON_PASSWORDS.has(lower)) return "This password is too common. Choose something less predictable";
  if (/^(.)\1+$/.test(password)) return "Don't use a single repeated character";
  const localPart = context.email?.split("@")[0]?.toLowerCase();
  if (localPart && localPart.length >= 4 && lower.includes(localPart)) {
    return "Don't include your email address in your password";
  }
  const nameParts = (context.name ?? "").toLowerCase().split(/\s+/).filter((part) => part.length >= 4);
  if (nameParts.some((part) => lower.includes(part))) return "Don't include your name in your password";
  return null;
}

export type PasswordStrength = 0 | 1 | 2 | 3 | 4;

/**
 * A rough 0–4 strength score for the meter: length matters most, then variety. Anything the
 * policy rejects scores at most 1, so the meter never says "strong" for a password the server
 * will refuse.
 */
export function passwordStrength(password: string, context: { email?: string; name?: string } = {}): PasswordStrength {
  if (!password) return 0;
  const classes = [/[a-z]/, /[A-Z]/, /\d/, /[^A-Za-z0-9]/].filter((re) => re.test(password)).length;
  const unique = new Set(password).size;
  let score = 0;
  if (password.length >= PASSWORD_MIN_LENGTH) score += 1;
  if (password.length >= 14) score += 1;
  if (password.length >= 20) score += 1;
  if (classes >= 3) score += 1;
  if (passwordProblem(password, context) || unique < 5) return 1;
  // Anything the policy accepts is at least "Fair": calling an accepted password "Too weak" confuses.
  return Math.max(2, Math.min(4, score)) as PasswordStrength;
}

export const STRENGTH_LABEL: Record<PasswordStrength, string> = {
  0: "",
  1: "Too weak",
  2: "Fair",
  3: "Good",
  4: "Strong",
};
