import { envValidationSchema } from './env.validation.js';

const valid = {
  MONGODB_URI: 'mongodb://localhost:27017/book_selling',
  CORS_ORIGINS: 'http://localhost:3000',
  FRONTEND_URL: 'http://localhost:3000',
};

describe('envValidationSchema', () => {
  it('accepts a minimal valid env and applies defaults', () => {
    const { error, value } = envValidationSchema.validate(valid);
    expect(error).toBeUndefined();
    expect(value).toMatchObject({ NODE_ENV: 'development', PORT: 4000 });
  });

  it.each(['MONGODB_URI', 'CORS_ORIGINS', 'FRONTEND_URL'])(
    'rejects a missing %s',
    (key) => {
      const env: Record<string, string> = { ...valid };
      delete env[key];
      expect(envValidationSchema.validate(env).error).toBeDefined();
    },
  );

  it('rejects a non-mongodb connection string', () => {
    const { error } = envValidationSchema.validate({
      ...valid,
      MONGODB_URI: 'https://example.com',
    });
    expect(error).toBeDefined();
  });
});
