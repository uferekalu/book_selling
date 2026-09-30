import Joi from 'joi';

/** Required in production, optional elsewhere (local dev and tests use safe fallbacks). */
const requiredInProduction = (schema: Joi.StringSchema) =>
  schema.when('NODE_ENV', {
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

  // ---- Brand (appears in emails) ----
  BRAND_NAME: Joi.string().default('Engineering Books'),
  SUPPORT_EMAIL: Joi.string().email().optional(),
  // Postal address in email footers (CAN-SPAM / good practice for a trading business).
  BUSINESS_POSTAL_ADDRESS: Joi.string().optional(),

  // ---- Email (docs/ARCHITECTURE.md §11) ----
  // Without a key outside production, emails are rendered and logged instead of sent.
  RESEND_API_KEY: requiredInProduction(Joi.string()),
  RESEND_WEBHOOK_SECRET: requiredInProduction(Joi.string()),
  MAIL_FROM: requiredInProduction(Joi.string()),
  MAIL_REPLY_TO: Joi.string().email().optional(),
  // Where operational alerts go (dead-letter emails; later payment reconciliation).
  OWNER_ALERT_EMAIL: Joi.string().email().optional(),
});
