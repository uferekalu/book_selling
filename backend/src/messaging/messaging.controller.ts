import {
  Body,
  Controller,
  Get,
  Header,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { SkipThrottle, Throttle } from '@nestjs/throttler';
import { CurrentUser, Roles } from '../auth/decorators/auth.decorators.js';
import type { AccessTokenPayload } from '../auth/interfaces/auth.types.js';
import { Public } from '../common/decorators/public.decorator.js';
import { Client, type ClientInfo } from '../common/http/client-info.js';
import { ContactService } from './contact.service.js';
import {
  ContactDto,
  ContactListQuery,
  ContactStatusDto,
  ConversationStatusDto,
  InboxQuery,
  MessagesQuery,
  MessagingSettingsDto,
  SendMessageDto,
  StartConversationDto,
} from './dto/messaging.dto.js';
import { MessagingService } from './messaging.service.js';

const actorOf = (user: AccessTokenPayload) => ({
  id: user.sub,
  role: user.role,
});

/** A customer's own conversations. Ownership is checked in the service on every call. */
@ApiTags('messaging')
@ApiBearerAuth()
@Controller('conversations')
export class ConversationsController {
  constructor(private readonly messaging: MessagingService) {}

  @Get()
  @Header('Cache-Control', 'no-store')
  list(@CurrentUser() user: AccessTokenPayload) {
    return this.messaging.listForCustomer(user.sub);
  }

  @Get('unread-count')
  @Header('Cache-Control', 'no-store')
  unread(@CurrentUser() user: AccessTokenPayload) {
    return this.messaging.unreadForCustomer(user.sub);
  }

  @Post()
  @Throttle({ default: { limit: 10, ttl: 60 * 60_000 } })
  start(
    @CurrentUser() user: AccessTokenPayload,
    @Body() dto: StartConversationDto,
  ) {
    return this.messaging.start(user.sub, {
      subject: dto.subject,
      body: dto.body,
      orderNumber: dto.orderNumber,
      bookId: dto.bookId,
    });
  }

  @Get(':id')
  @Header('Cache-Control', 'no-store')
  get(
    @CurrentUser() user: AccessTokenPayload,
    @Param('id') id: string,
    @Query() query: MessagesQuery,
  ) {
    return this.messaging.forCustomer(user.sub, id, query.before);
  }

  @Post(':id/messages')
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  send(
    @CurrentUser() user: AccessTokenPayload,
    @Param('id') id: string,
    @Body() dto: SendMessageDto,
  ) {
    return this.messaging.send(user.sub, id, dto.body);
  }

  @Post(':id/read')
  @HttpCode(HttpStatus.NO_CONTENT)
  async read(@CurrentUser() user: AccessTokenPayload, @Param('id') id: string) {
    await this.messaging.markReadByCustomer(user.sub, id);
  }
}

/** The shared staff inbox: conversations and contact-form messages (two-step verified staff). */
@ApiTags('messaging')
@ApiBearerAuth()
@Roles('admin', 'owner')
@Controller('admin')
export class AdminMessagingController {
  constructor(
    private readonly messaging: MessagingService,
    private readonly contact: ContactService,
  ) {}

  @Get('inbox/unread-count')
  @Header('Cache-Control', 'no-store')
  async unread() {
    const [{ conversations }, contact] = await Promise.all([
      this.messaging.unreadForStaff(),
      this.contact.countNew(),
    ]);
    return { conversations, contact };
  }

  @Get('conversations')
  @Header('Cache-Control', 'no-store')
  inbox(@Query() query: InboxQuery) {
    return this.messaging.inbox(query.filter ?? 'open', query.page ?? 1);
  }

  @Get('conversations/:id')
  @Header('Cache-Control', 'no-store')
  conversation(@Param('id') id: string, @Query() query: MessagesQuery) {
    return this.messaging.forStaff(id, query.before);
  }

  @Post('conversations/:id/messages')
  reply(
    @CurrentUser() user: AccessTokenPayload,
    @Param('id') id: string,
    @Body() dto: SendMessageDto,
  ) {
    return this.messaging.reply(actorOf(user), id, dto.body);
  }

  @Post('conversations/:id/read')
  @HttpCode(HttpStatus.NO_CONTENT)
  async read(@Param('id') id: string) {
    await this.messaging.markReadByStaff(id);
  }

  @Post('conversations/:id/status')
  setStatus(
    @CurrentUser() user: AccessTokenPayload,
    @Param('id') id: string,
    @Body() dto: ConversationStatusDto,
  ) {
    return this.messaging.setStatus(actorOf(user), id, dto.status);
  }

  @Get('contact-requests')
  @Header('Cache-Control', 'no-store')
  contactList(@Query() query: ContactListQuery) {
    return this.contact.list(query.status ?? 'new', query.page ?? 1);
  }

  @Get('contact-requests/:id')
  @Header('Cache-Control', 'no-store')
  contactItem(@Param('id') id: string) {
    return this.contact.get(id);
  }

  @Post('contact-requests/:id/reply')
  contactReply(
    @CurrentUser() user: AccessTokenPayload,
    @Param('id') id: string,
    @Body() dto: SendMessageDto,
  ) {
    return this.contact.reply(actorOf(user), id, dto.body);
  }

  @Post('contact-requests/:id/status')
  contactStatus(
    @CurrentUser() user: AccessTokenPayload,
    @Param('id') id: string,
    @Body() dto: ContactStatusDto,
  ) {
    return this.contact.setStatus(actorOf(user), id, dto.status);
  }

  @Put('messaging/settings')
  @Roles('owner')
  settings(
    @CurrentUser() user: AccessTokenPayload,
    @Body() dto: MessagingSettingsDto,
  ) {
    return this.messaging.updateSettings(actorOf(user), dto.replyTime);
  }
}

/** Public: the contact form and the reply-time line shown next to message boxes. */
@ApiTags('messaging')
@Controller()
export class PublicMessagingController {
  constructor(
    private readonly messaging: MessagingService,
    private readonly contact: ContactService,
  ) {}

  @Public()
  @SkipThrottle()
  @Get('messaging/settings')
  settings() {
    return this.messaging.getSettings();
  }

  @Public()
  @Post('contact')
  @HttpCode(HttpStatus.ACCEPTED)
  // Per IP: 5 messages an hour is plenty for a person and useless for a spammer.
  @Throttle({ default: { limit: 5, ttl: 60 * 60_000 } })
  async submit(@Body() dto: ContactDto, @Client() client: ClientInfo) {
    await this.contact.submit(
      {
        name: dto.name,
        email: dto.email,
        subject: dto.subject,
        body: dto.body,
        website: dto.website,
        elapsedMs: dto.elapsedMs,
      },
      client.ip,
    );
    return { status: 'received' };
  }
}
