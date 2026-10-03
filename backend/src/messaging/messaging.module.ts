import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { CatalogModule } from '../catalog/catalog.module.js';
import { CommerceModule } from '../commerce/commerce.module.js';
import { MailModule } from '../mail/mail.module.js';
import { UsersModule } from '../users/users.module.js';
import { ContactService } from './contact.service.js';
import {
  AdminMessagingController,
  ConversationsController,
  PublicMessagingController,
} from './messaging.controller.js';
import { MessagingService } from './messaging.service.js';
import {
  ContactRequest,
  ContactRequestSchema,
} from './schemas/contact-request.schema.js';
import {
  Conversation,
  ConversationSchema,
} from './schemas/conversation.schema.js';
import { Message, MessageSchema } from './schemas/message.schema.js';
import {
  MessagingSettings,
  MessagingSettingsSchema,
} from './schemas/messaging-settings.schema.js';

/** Conversations, the staff inbox and the contact form (ARCHITECTURE §12, BS-10). */
@Module({
  imports: [
    UsersModule,
    MailModule,
    CatalogModule,
    CommerceModule,
    MongooseModule.forFeature([
      { name: Conversation.name, schema: ConversationSchema },
      { name: Message.name, schema: MessageSchema },
      { name: ContactRequest.name, schema: ContactRequestSchema },
      { name: MessagingSettings.name, schema: MessagingSettingsSchema },
    ]),
  ],
  controllers: [
    ConversationsController,
    AdminMessagingController,
    PublicMessagingController,
  ],
  providers: [MessagingService, ContactService],
})
export class MessagingModule {}
