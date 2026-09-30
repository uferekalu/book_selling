import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { MongooseModule } from '@nestjs/mongoose';
import { JobsModule } from '../jobs/jobs.module.js';
import { MailWebhooksController } from './mail-webhooks.controller.js';
import { MailWebhooksService } from './mail-webhooks.service.js';
import { MailService } from './mail.service.js';
import { OutboxWorker } from './outbox-worker.service.js';
import {
  EmailOutbox,
  EmailOutboxSchema,
} from './schemas/email-outbox.schema.js';
import {
  EmailSuppression,
  EmailSuppressionSchema,
} from './schemas/email-suppression.schema.js';
import { TemplateRendererService } from './template-renderer.service.js';
import { EMAIL_TRANSPORT } from './transports/email-transport.js';
import { LogTransport } from './transports/log.transport.js';
import { ResendTransport } from './transports/resend.transport.js';

@Module({
  imports: [
    JobsModule,
    MongooseModule.forFeature([
      { name: EmailOutbox.name, schema: EmailOutboxSchema },
      { name: EmailSuppression.name, schema: EmailSuppressionSchema },
    ]),
  ],
  controllers: [MailWebhooksController],
  providers: [
    MailService,
    OutboxWorker,
    MailWebhooksService,
    TemplateRendererService,
    {
      provide: EMAIL_TRANSPORT,
      inject: [ConfigService],
      // Env validation requires the key in production, so LogTransport never runs there.
      useFactory: (config: ConfigService) => {
        const apiKey = config.get<string>('RESEND_API_KEY');
        return apiKey ? new ResendTransport(apiKey) : new LogTransport();
      },
    },
  ],
  exports: [MailService],
})
export class MailModule {}
