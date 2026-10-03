import { envValidationSchema } from './env.validation.js';

const valid = {
  JWT_ACCESS_SECRET: 'a'.repeat(32),
  TWO_FACTOR_ENCRYPTION_KEY: Buffer.alloc(32, 1).toString('base64'),
  MONGODB_URI: 'mongodb://localhost:27017/book_selling',
  CORS_ORIGINS: 'http://localhost:3000',
  FRONTEND_URL: 'http://localhost:3000',
};

const productionRequired = {
  RESEND_API_KEY: 're_live_key',
  RESEND_WEBHOOK_SECRET: 'whsec_abc',
  MAIL_FROM: 'Engineering Books <books@mail.example.com>',
  // Media uploads are mandatory in production too (BS-5).
  CLOUDINARY_CLOUD_NAME: 'books-cloud',
  CLOUDINARY_API_KEY: '123456789012345',
  CLOUDINARY_API_SECRET: 'cloudinary-secret',
  // Private book files (R2) are mandatory in production too (BS-20).
  R2_ACCOUNT_ID: 'acct123',
  R2_ACCESS_KEY_ID: 'r2-access-key',
  R2_SECRET_ACCESS_KEY: 'r2-secret-key',
  R2_BUCKET: 'book-selling-production',
  // Payments must say test or live explicitly in production (BS-8).
  PAYMENTS_MODE: 'test',
};

describe('envValidationSchema', () => {
  it('accepts a minimal valid env and applies defaults', () => {
    const { error, value } = envValidationSchema.validate(valid);
    expect(error).toBeUndefined();
    expect(value).toMatchObject({
      NODE_ENV: 'development',
      PORT: 4000,
      BRAND_NAME: 'Engineering Books',
    });
  });

  it.each([
    'MONGODB_URI',
    'CORS_ORIGINS',
    'FRONTEND_URL',
    'JWT_ACCESS_SECRET',
    'TWO_FACTOR_ENCRYPTION_KEY',
  ])('rejects a missing %s', (key) => {
    const env: Record<string, string> = { ...valid };
    delete env[key];
    expect(envValidationSchema.validate(env).error).toBeDefined();
  });

  it('trusts one proxy by default, and the configured number behind Vercel + Railway (BS-24)', () => {
    expect(envValidationSchema.validate(valid).value.TRUST_PROXY_HOPS).toBe(1);
    expect(
      envValidationSchema.validate({ ...valid, TRUST_PROXY_HOPS: '2' }).value
        .TRUST_PROXY_HOPS,
    ).toBe(2);
    expect(
      envValidationSchema.validate({ ...valid, TRUST_PROXY_HOPS: 'all' }).error,
    ).toBeDefined();
  });

  it('rejects a non-mongodb connection string', () => {
    const { error } = envValidationSchema.validate({
      ...valid,
      MONGODB_URI: 'https://example.com',
    });
    expect(error).toBeDefined();
  });

  it('rejects a short JWT secret and a 2FA key of the wrong length', () => {
    expect(
      envValidationSchema.validate({ ...valid, JWT_ACCESS_SECRET: 'short' })
        .error,
    ).toBeDefined();
    const { error } = envValidationSchema.validate({
      ...valid,
      TWO_FACTOR_ENCRYPTION_KEY: Buffer.alloc(16).toString('base64'),
    });
    expect(error?.message).toMatch(/32 bytes/);
  });

  it('treats empty values (KEY= in .env.example) as unset', () => {
    const { error, value } = envValidationSchema.validate({
      ...valid,
      RESEND_API_KEY: '',
      RESEND_WEBHOOK_SECRET: '',
      MAIL_FROM: '',
      SUPPORT_EMAIL: '',
      OWNER_ALERT_EMAIL: '',
    });
    expect(error).toBeUndefined();
    expect(value.RESEND_API_KEY).toBeUndefined();
  });

  it('still requires production mail settings when they are empty', () => {
    const { error } = envValidationSchema.validate({
      ...valid,
      ...productionRequired,
      NODE_ENV: 'production',
      RESEND_API_KEY: '',
    });
    expect(error?.message).toContain('RESEND_API_KEY');
  });

  it('allows missing mail settings outside production', () => {
    expect(envValidationSchema.validate(valid).error).toBeUndefined();
  });

  it.each(Object.keys(productionRequired))(
    'requires %s in production',
    (key) => {
      const env: Record<string, string> = {
        ...valid,
        ...productionRequired,
        NODE_ENV: 'production',
      };
      delete env[key];
      expect(envValidationSchema.validate(env).error?.message).toContain(key);
    },
  );

  it('accepts a complete production mail config', () => {
    const { error } = envValidationSchema.validate({
      ...valid,
      ...productionRequired,
      NODE_ENV: 'production',
    });
    expect(error).toBeUndefined();
  });

  describe('payment keys', () => {
    const check = (env: Record<string, string>) =>
      envValidationSchema.validate({ ...valid, ...env }).error?.message;

    it('defaults to test mode and accepts test keys', () => {
      const { value } = envValidationSchema.validate(valid);
      expect(value.PAYMENTS_MODE).toBe('test');
      expect(
        check({
          STRIPE_SECRET_KEY: 'sk_test_abc',
          STRIPE_WEBHOOK_SECRET: 'whsec_abc',
          STRIPE_COUNTRIES: 'US,GB',
          PAYSTACK_SECRET_KEY: 'sk_test_abc',
          FLUTTERWAVE_SECRET_KEY: 'FLWSECK_TEST-abc',
          FLUTTERWAVE_WEBHOOK_HASH: 'a-long-shared-secret-hash',
        }),
      ).toBeUndefined();
    });

    it('refuses live keys outside live mode (a dev machine never charges real cards)', () => {
      expect(check({ PAYSTACK_SECRET_KEY: 'sk_live_abc' })).toMatch(
        /not a test key/,
      );
      expect(
        check({
          FLUTTERWAVE_SECRET_KEY: 'FLWSECK-abc',
          FLUTTERWAVE_WEBHOOK_HASH: 'a-long-shared-secret-hash',
        }),
      ).toMatch(/not a test key/);
    });

    it('refuses test keys in live mode', () => {
      expect(
        check({
          PAYMENTS_MODE: 'live',
          STRIPE_SECRET_KEY: 'sk_test_abc',
          STRIPE_WEBHOOK_SECRET: 'whsec_abc',
        }),
      ).toMatch(/not a live key/);
      expect(
        check({
          PAYMENTS_MODE: 'live',
          FLUTTERWAVE_SECRET_KEY: 'FLWSECK_TEST-abc',
          FLUTTERWAVE_WEBHOOK_HASH: 'a-long-shared-secret-hash',
        }),
      ).toMatch(/not a live key/);
    });

    it('needs an explicit list of countries before Stripe can be used (BS-22)', () => {
      const stripe = {
        STRIPE_SECRET_KEY: 'sk_test_abc',
        STRIPE_WEBHOOK_SECRET: 'whsec_abc',
      };
      expect(check(stripe)).toMatch(/STRIPE_COUNTRIES is required/);
      expect(
        check({ ...stripe, STRIPE_COUNTRIES: 'US, GB,ie' }),
      ).toBeUndefined();
      expect(check({ ...stripe, STRIPE_COUNTRIES: 'USA,UK' })).toMatch(
        /two-letter country codes/,
      );
    });

    it('needs the webhook secret that goes with each provider key', () => {
      expect(check({ STRIPE_SECRET_KEY: 'sk_test_abc' })).toMatch(
        /STRIPE_WEBHOOK_SECRET is required/,
      );
      expect(check({ FLUTTERWAVE_SECRET_KEY: 'FLWSECK_TEST-abc' })).toMatch(
        /FLUTTERWAVE_WEBHOOK_HASH is required/,
      );
    });

    it('needs an explicit mode and, when live, a provider in production', () => {
      const production = {
        ...productionRequired,
        NODE_ENV: 'production',
        BCRYPT_COST: '12',
      };
      const { PAYMENTS_MODE: _omit, ...withoutMode } = production;
      expect(check(withoutMode)).toMatch(/PAYMENTS_MODE/);
      expect(check({ ...production, PAYMENTS_MODE: 'live' })).toMatch(
        /at least one provider/,
      );
      expect(
        check({
          ...production,
          PAYMENTS_MODE: 'live',
          PAYSTACK_SECRET_KEY: 'sk_live_abc',
        }),
      ).toBeUndefined();
    });
  });
});
