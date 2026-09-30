import Joi from 'joi';

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
});
