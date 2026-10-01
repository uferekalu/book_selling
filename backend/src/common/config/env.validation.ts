import Joi from 'joi';

/**
 * An empty value (`KEY=` in a .env file, as in .env.example) means "not set", not "invalid".
 * Without this, copying .env.example as-is made the API refuse to boot (fixed in BS-19).
 */
const optionalString = () => Joi.string().empty('');

/** Required in production, optional elsewhere (local dev and tests use safe fallbacks). */
const requiredInProduction = (schema: Joi.StringSchema) =>
  schema.empty('').when('NODE_ENV', {
    is: 'production',
    // Joi's conditional API is literally named `then`; this object is never awaited.
    // oxlint-disable-next-line unicorn/no-thenable
    then: schema.required(),
    otherwise: schema.optional(),
  });

/**
 * Every env var the API reads, validated once at boot — the app refuses to start on a missing or
 * malformed value rather than failing later mid-request. Add a new var here, to `.env.example`,
 * and to `render.yaml` in the same change that first reads it (docs/ENGINEERING_RULES.md §4).
 */
export const envValidationSchema = Joi.object({
  NODE_ENV: Joi.string()
    .valid('development', 'test', 'production')
    .default('development'),
  PORT: Joi.number().port().default(4000),
  MONGODB_URI: Joi.string()
    .uri({ scheme: ['mongodb', 'mongodb+srv'] })
    .required(),
  CORS_ORIGINS: Joi.string().required(),
  FRONTEND_URL: Joi.string().uri().required(),

  // ---- Auth (docs/ARCHITECTURE.md §5) ----
  // At least 32 random bytes; different per environment (openssl rand -base64 48).
  JWT_ACCESS_SECRET: Joi.string().min(32).required(),
  // bcrypt work factor. Production must use at least 12; tests lower it for speed.
  BCRYPT_COST: Joi.number()
    .integer()
    .max(15)
    .when('NODE_ENV', {
      is: 'production',
      // oxlint-disable-next-line unicorn/no-thenable -- Joi's conditional API, never awaited.
      then: Joi.number().min(12),
      otherwise: Joi.number().min(4),
    })
    .default(12),
  JWT_ACCESS_TTL_SECONDS: Joi.number().integer().min(60).max(3600).default(900),
  REFRESH_TOKEN_TTL_DAYS: Joi.number().integer().min(1).max(90).default(30),
  // AES-256-GCM key for two-step verification secrets at rest: exactly 32 bytes, base64.
  TWO_FACTOR_ENCRYPTION_KEY: Joi.string()
    .base64()
    .custom((value: string, helpers) =>
      Buffer.from(value, 'base64').length === 32
        ? value
        : helpers.error('any.invalid'),
    )
    .required()
    .messages({
      'any.invalid':
        'TWO_FACTOR_ENCRYPTION_KEY must decode to exactly 32 bytes',
    }),

  // ---- Brand (appears in emails) ----
  BRAND_NAME: Joi.string().default('Engineering Books'),
  SUPPORT_EMAIL: optionalString().email().optional(),
  // Postal address in email footers (CAN-SPAM / good practice for a trading business).
  BUSINESS_POSTAL_ADDRESS: optionalString().optional(),

  // ---- Email (docs/ARCHITECTURE.md §11) ----
  // Without a key outside production, emails are rendered and logged instead of sent.
  RESEND_API_KEY: requiredInProduction(Joi.string()),
  RESEND_WEBHOOK_SECRET: requiredInProduction(Joi.string()),
  MAIL_FROM: requiredInProduction(Joi.string()),
  MAIL_REPLY_TO: optionalString().email().optional(),
  // Where operational alerts go (dead-letter emails; later payment reconciliation).
  OWNER_ALERT_EMAIL: optionalString().email().optional(),
});
