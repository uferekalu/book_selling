import { INestApplication, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { NestExpressApplication } from '@nestjs/platform-express';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter.js';

/**
 * Every app-wide concern except Swagger and `listen()`. Called from `main.ts` AND from every e2e
 * spec — `Test.createTestingModule(...).createNestApplication()` does not run `main.ts`, so a spec
 * that skips this runs with no validation, no error filter and no cookie parsing.
 */
export function setupApp(app: INestApplication): void {
  // Exactly one reverse proxy (Render) sits in front of the API. `1`, not `true`: trusting the
  // whole chain would let a client spoof X-Forwarded-For and dodge per-IP rate limits.
  (app as NestExpressApplication).set('trust proxy', 1);
  app.use(helmet());
  app.use(cookieParser());

  const config = app.get(ConfigService);
  const corsOrigins = config
    .getOrThrow<string>('CORS_ORIGINS')
    .split(',')
    .map((origin) => origin.trim());
  app.enableCors({ origin: corsOrigins, credentials: true });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );
  app.useGlobalFilters(new AllExceptionsFilter());
}
