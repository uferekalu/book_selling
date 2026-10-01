import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { MongooseModule } from '@nestjs/mongoose';
import { AuditModule } from '../audit/audit.module.js';
import { AuthModule } from '../auth/auth.module.js';
import { CatalogModule } from '../catalog/catalog.module.js';
import { CommerceModule } from '../commerce/commerce.module.js';
import { JobsModule } from '../jobs/jobs.module.js';
import { MailModule } from '../mail/mail.module.js';
import { UsersModule } from '../users/users.module.js';
import { FlutterwaveAdapter } from './adapters/flutterwave.adapter.js';
import { PaystackAdapter } from './adapters/paystack.adapter.js';
import { StripeAdapter } from './adapters/stripe.adapter.js';
import {
  AdminPaymentsController,
  PaymentsController,
  PaymentWebhooksController,
} from './payments.controller.js';
import { PAYMENT_ADAPTERS, PaymentsService } from './payments.service.js';
import { PaymentReconciliationJob } from './reconciliation.job.js';
import {
  Payment,
  PaymentSchema,
  WebhookEvent,
  WebhookEventSchema,
} from './schemas/payment.schema.js';

/** Stripe, Paystack and Flutterwave behind one interface (ARCHITECTURE §9). */
@Module({
  imports: [
    CatalogModule,
    CommerceModule,
    UsersModule,
    AuthModule,
    MailModule,
    AuditModule,
    JobsModule,
    MongooseModule.forFeature([
      { name: Payment.name, schema: PaymentSchema },
      { name: WebhookEvent.name, schema: WebhookEventSchema },
    ]),
  ],
  controllers: [
    PaymentsController,
    PaymentWebhooksController,
    AdminPaymentsController,
  ],
  providers: [
    PaymentsService,
    PaymentReconciliationJob,
    {
      provide: PAYMENT_ADAPTERS,
      inject: [ConfigService],
      useFactory: (config: ConfigService) => [
        new StripeAdapter(
          config.get('STRIPE_SECRET_KEY'),
          config.get('STRIPE_WEBHOOK_SECRET'),
        ),
        new PaystackAdapter(config.get('PAYSTACK_SECRET_KEY')),
        new FlutterwaveAdapter(
          config.get('FLUTTERWAVE_SECRET_KEY'),
          config.get('FLUTTERWAVE_WEBHOOK_HASH'),
        ),
      ],
    },
  ],
  exports: [PaymentsService],
})
export class PaymentsModule {}
