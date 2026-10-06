import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { AuditLog, AuditLogSchema } from '../audit/audit.module.js';
import { Book, BookSchema } from '../catalog/schemas/book.schema.js';
import { CommerceModule } from '../commerce/commerce.module.js';
import {
  EmailOutbox,
  EmailOutboxSchema,
} from '../mail/schemas/email-outbox.schema.js';
import {
  ContactRequest,
  ContactRequestSchema,
} from '../messaging/schemas/contact-request.schema.js';
import {
  Conversation,
  ConversationSchema,
} from '../messaging/schemas/conversation.schema.js';
import { Payment, PaymentSchema } from '../payments/schemas/payment.schema.js';
import { PreviewEvent, PreviewEventSchema } from '../preview/preview-events.js';
import { ReportsModule } from '../reports/reports.module.js';
import { User, UserSchema } from '../users/schemas/user.schema.js';
import { AdminDashboardController } from './admin-dashboard.controller.js';
import { AdminDashboardService } from './admin-dashboard.service.js';

/** The store dashboard, customers and audit log (BS-12). Read-only over other modules' data. */
@Module({
  imports: [
    CommerceModule,
    ReportsModule,
    MongooseModule.forFeature([
      { name: Payment.name, schema: PaymentSchema },
      { name: Book.name, schema: BookSchema },
      { name: User.name, schema: UserSchema },
      { name: EmailOutbox.name, schema: EmailOutboxSchema },
      { name: Conversation.name, schema: ConversationSchema },
      { name: ContactRequest.name, schema: ContactRequestSchema },
      { name: PreviewEvent.name, schema: PreviewEventSchema },
      { name: AuditLog.name, schema: AuditLogSchema },
    ]),
  ],
  controllers: [AdminDashboardController],
  providers: [AdminDashboardService],
})
export class AdminModule {}
