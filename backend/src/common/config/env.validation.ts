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
 * and to the production table in docs/DEPLOYMENT.md §4 in the same change that first reads it
 * (docs/ENGINEERING_RULES.md §4).
 */
export const envValidationSchema = Joi.object({
  NODE_ENV: Joi.string()
    .valid('development', 'test', 'production')
    .default('development'),
  PORT: Joi.number().port().default(4000),
  // Reverse proxies in front of the API that append to X-Forwarded-For (BS-24). Locally 1. Behind
  // Vercel's /api rewrite AND Railway's edge it is 2, or every visitor looks like Vercel's server
  // and per-visitor rate limits are shared by all customers.
  TRUST_PROXY_HOPS: Joi.number().integer().min(0).max(5).default(1),
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

  // ---- Images: Cloudinary (docs/ARCHITECTURE.md §10.0) ----
  // Without these outside production, image uploads are disabled (503) and books show typographic covers.
  CLOUDINARY_CLOUD_NAME: requiredInProduction(Joi.string()),
  CLOUDINARY_API_KEY: requiredInProduction(Joi.string()),
  CLOUDINARY_API_SECRET: requiredInProduction(Joi.string()),
  // Keeps environments apart inside one Cloudinary account, e.g. "book-selling/production".
  CLOUDINARY_FOLDER: optionalString().default('book-selling/development'),
  // Must not exceed the Cloudinary plan's maximum image size (10 MB on the free plan).
  IMAGE_MAX_MB: Joi.number().integer().min(1).max(100).default(10),

  // ---- Book files (manuscript PDFs): Cloudflare R2, private (docs/ARCHITECTURE.md §10.0) ----
  // Without these outside production, book PDF uploads are disabled (503).
  R2_ACCOUNT_ID: requiredInProduction(Joi.string()),
  R2_ACCESS_KEY_ID: requiredInProduction(Joi.string()),
  R2_SECRET_ACCESS_KEY: requiredInProduction(Joi.string()),
  R2_BUCKET: requiredInProduction(Joi.string()),
  // Keeps environments apart inside one bucket, e.g. "book-selling/production".
  R2_FOLDER: optionalString().default('book-selling/development'),
  // Only for an S3-compatible store other than R2 (e.g. MinIO locally); R2 derives it from the account id.
  R2_ENDPOINT: optionalString().uri({ scheme: ['http', 'https'] }),
  // Optional cap on everything this environment stores in R2, e.g. 2048 on a developer's own
  // account so testing never leaves the free 10GB. Unset (no cap) in production.
  R2_STORAGE_LIMIT_MB: Joi.number().integer().min(1).empty(''),
  // Building a preview holds the whole PDF in memory several times over: keep the server's RAM
  // at least 4× this (DEPLOYMENT §4a).
  MANUSCRIPT_MAX_MB: Joi.number().integer().min(1).max(2000).default(200),
  // Largest share of a book the free preview may show (PRODUCT_RULES §4). Owner-editable in BS-12.
  PREVIEW_MAX_PERCENT: Joi.number().integer().min(1).max(50).default(15),
  // Lets the API tell the storefront to refresh cached catalogue pages after an edit.
  FRONTEND_REVALIDATE_SECRET: optionalString().min(16).optional(),

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

  // ---- Payments (docs/ARCHITECTURE.md §9) ----
  // `live` takes real money. Production must say which explicitly; keys must match the mode.
  PAYMENTS_MODE: Joi.string()
    .valid('test', 'live')
    .when('NODE_ENV', {
      is: 'production',
      // oxlint-disable-next-line unicorn/no-thenable
      then: Joi.required(),
      otherwise: Joi.optional().default('test'),
    }),
  // A provider is offered only when all its keys are set.
  STRIPE_SECRET_KEY: optionalString().optional(),
  STRIPE_WEBHOOK_SECRET: optionalString().optional(),
  PAYSTACK_SECRET_KEY: optionalString().optional(),
  FLUTTERWAVE_SECRET_KEY: optionalString().optional(),
  // The "secret hash" set in the Flutterwave dashboard, sent back in the verif-hash header.
  FLUTTERWAVE_WEBHOOK_HASH: optionalString().min(16).optional(),
  // The currencies each provider account can take (BS-23). Paystack starts with NGN only; add USD
  // once Paystack enables it for the business. Flutterwave accounts usually take all four.
  PAYSTACK_CURRENCIES: optionalString()
    .pattern(/^\s*(NGN|USD|GBP|EUR)(\s*,\s*(NGN|USD|GBP|EUR))*\s*$/i)
    .messages({
      'string.pattern.base':
        'PAYSTACK_CURRENCIES must be store currencies separated by commas, e.g. NGN,USD',
    })
    .default('NGN'),
  FLUTTERWAVE_CURRENCIES: optionalString()
    .pattern(/^\s*(NGN|USD|GBP|EUR)(\s*,\s*(NGN|USD|GBP|EUR))*\s*$/i)
    .messages({
      'string.pattern.base':
        'FLUTTERWAVE_CURRENCIES must be store currencies separated by commas, e.g. NGN,USD,GBP,EUR',
    })
    .default('NGN,USD,GBP,EUR'),
  // Where the business may lawfully take payments through Stripe: buyer countries (ISO codes,
  // comma-separated, e.g. "US,GB,IE,DE"). Stripe is offered nowhere else, and never for NGN.
  STRIPE_COUNTRIES: optionalString()
    .pattern(/^\s*[A-Za-z]{2}(\s*,\s*[A-Za-z]{2})*\s*$/)
    .messages({
      'string.pattern.base':
        'STRIPE_COUNTRIES must be two-letter country codes separated by commas, e.g. US,GB,IE',
    })
    .optional(),
}).custom((env: Record<string, unknown>, helpers) => {
  const problem = paymentKeysProblem(env);
  return problem ? helpers.message({ custom: problem }) : env;
}, 'payment keys match the payments mode');

/**
 * Test keys can never take real money and live keys can never be used by a developer machine by
 * accident: every key present must match PAYMENTS_MODE, and live production needs a provider.
 */
export function paymentKeysProblem(
  env: Record<string, unknown>,
): string | null {
  const mode = env.PAYMENTS_MODE === 'live' ? 'live' : 'test';
  const str = (key: string) =>
    typeof env[key] === 'string' && env[key] !== ''
      ? (env[key] as string)
      : null;
  const checks: Array<
    [string, (key: string) => boolean, (key: string) => boolean]
  > = [
    [
      'STRIPE_SECRET_KEY',
      (k) => k.startsWith('sk_live_') || k.startsWith('rk_live_'),
      (k) => k.startsWith('sk_test_') || k.startsWith('rk_test_'),
    ],
    [
      'PAYSTACK_SECRET_KEY',
      (k) => k.startsWith('sk_live_'),
      (k) => k.startsWith('sk_test_'),
    ],
    [
      'FLUTTERWAVE_SECRET_KEY',
      (k) => k.startsWith('FLWSECK-') && !k.includes('_TEST'),
      (k) => k.startsWith('FLWSECK_TEST-'),
    ],
  ];
  for (const [name, isLive, isTest] of checks) {
    const key = str(name);
    if (!key) continue;
    if (mode === 'live' && !isLive(key))
      return `${name} is not a live key, but PAYMENTS_MODE=live`;
    if (mode === 'test' && !isTest(key))
      return `${name} is not a test key, but PAYMENTS_MODE=test (live keys belong in production only)`;
  }
  const pairs: Array<[string, string]> = [
    ['STRIPE_SECRET_KEY', 'STRIPE_WEBHOOK_SECRET'],
    ['FLUTTERWAVE_SECRET_KEY', 'FLUTTERWAVE_WEBHOOK_HASH'],
  ];
  for (const [key, partner] of pairs) {
    if (str(key) && !str(partner)) return `${partner} is required with ${key}`;
  }
  // Stripe only where the business is compliant: an explicit list, never "everywhere" by default.
  if (str('STRIPE_SECRET_KEY') && !str('STRIPE_COUNTRIES')) {
    return 'STRIPE_COUNTRIES is required with STRIPE_SECRET_KEY: list the buyer countries where Stripe may be used (e.g. US,GB,IE)';
  }
  if (
    env.NODE_ENV === 'production' &&
    mode === 'live' &&
    !str('STRIPE_SECRET_KEY') &&
    !str('PAYSTACK_SECRET_KEY') &&
    !str('FLUTTERWAVE_SECRET_KEY')
  ) {
    return 'Live payments need at least one provider key';
  }
  return null;
}
