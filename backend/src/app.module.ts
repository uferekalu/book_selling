import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { LoggerModule } from 'nestjs-pino';
import { AuditModule } from './audit/audit.module.js';
import { AccessTokenGuard, RolesGuard } from './auth/guards/auth.guards.js';
import { AuthModule } from './auth/auth.module.js';
import { CatalogModule } from './catalog/catalog.module.js';
import { envValidationSchema } from './common/config/env.validation.js';
import { DatabaseModule } from './database/database.module.js';
import { HealthModule } from './health/health.module.js';
import { JobsModule } from './jobs/jobs.module.js';
import { MailModule } from './mail/mail.module.js';
import { UsersModule } from './users/users.module.js';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      validationSchema: envValidationSchema,
    }),
    LoggerModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const env = config.get<string>('NODE_ENV');
        return {
          pinoHttp: {
            level:
              env === 'production'
                ? 'info'
                : env === 'test'
                  ? 'silent'
                  : 'debug',
            // pino-pretty runs in a worker thread — dev server only; it hangs test runners.
            transport:
              env === 'development'
                ? { target: 'pino-pretty', options: { singleLine: true } }
                : undefined,
            // Never log credentials or payment-provider signatures.
            redact: [
              'req.headers.authorization',
              'req.headers.cookie',
              'req.headers["x-paystack-signature"]',
              'req.headers["stripe-signature"]',
              'req.headers["verif-hash"]',
              'req.headers["flutterwave-signature"]',
            ],
          },
        };
      },
    }),
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 100 }]),
    // Registered once for the whole app (the outbox worker; later reconciliation and expiry jobs).
    ScheduleModule.forRoot(),
    DatabaseModule,
    HealthModule,
    JobsModule,
    AuditModule,
    MailModule,
    UsersModule,
    AuthModule,
    CatalogModule,
  ],
  // Order matters: rate limit first, then authentication (default-deny), then roles.
  providers: [
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_GUARD, useExisting: AccessTokenGuard },
    { provide: APP_GUARD, useExisting: RolesGuard },
  ],
})
export class AppModule {}
