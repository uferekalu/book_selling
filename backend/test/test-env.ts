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
}
