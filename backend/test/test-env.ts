/** A Svix-format signing secret for the Resend webhook in tests ("whsec_" + base64). */
export const TEST_RESEND_WEBHOOK_SECRET = `whsec_${Buffer.from('book-selling-test-webhook-secret').toString('base64')}`;

export const TEST_JWT_SECRET =
  'test-access-secret-that-is-at-least-32-chars-long';
export const TEST_TWO_FACTOR_KEY = Buffer.alloc(32, 7).toString('base64');

/**
 * Minimal valid env for booting the real AppModule in e2e specs. Must be applied BEFORE the
 * AppModule is imported — `ConfigModule.forRoot()` validates `process.env` when the module is
 * evaluated, so specs load it with a dynamic `await import()` after calling this.
 */
export function applyTestEnv(mongoUri: string): void {
  process.env.NODE_ENV = 'test';
  process.env.MONGODB_URI = mongoUri;
  process.env.CORS_ORIGINS = 'http://localhost:3000';
  process.env.FRONTEND_URL = 'http://localhost:3000';
  process.env.RESEND_WEBHOOK_SECRET = TEST_RESEND_WEBHOOK_SECRET;
  process.env.JWT_ACCESS_SECRET = TEST_JWT_SECRET;
  process.env.BCRYPT_COST = '4';
  process.env.TWO_FACTOR_ENCRYPTION_KEY = TEST_TWO_FACTOR_KEY;
  // No RESEND_API_KEY: the LogTransport is used, so tests never send real email.
  delete process.env.RESEND_API_KEY;
}
