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
});
