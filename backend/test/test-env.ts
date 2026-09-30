/** A Svix-format signing secret for the Resend webhook in tests ("whsec_" + base64). */
export const TEST_RESEND_WEBHOOK_SECRET = `whsec_${Buffer.from('book-selling-test-webhook-secret').toString('base64')}`;

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
  // No RESEND_API_KEY: the LogTransport is used, so tests never send real email.
  delete process.env.RESEND_API_KEY;
}
