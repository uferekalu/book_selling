import {
  Controller,
  Get,
  Header,
  HttpCode,
  HttpStatus,
  Param,
  Post,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../auth/decorators/auth.decorators.js';
import type { AccessTokenPayload } from '../auth/interfaces/auth.types.js';
import { NotificationsService } from './notifications.service.js';

/** The signed-in user's bell. Every query is scoped to the caller's id. */
@ApiTags('notifications')
@ApiBearerAuth()
@Controller('notifications')
export class NotificationsController {
  constructor(private readonly notifications: NotificationsService) {}

  @Get()
  @Header('Cache-Control', 'no-store')
  list(@CurrentUser() user: AccessTokenPayload) {
    return this.notifications.list(user.sub);
  }

  @Post('read-all')
  @HttpCode(HttpStatus.NO_CONTENT)
  async readAll(@CurrentUser() user: AccessTokenPayload) {
    await this.notifications.markAllRead(user.sub);
  }

  @Post(':id/read')
  @HttpCode(HttpStatus.NO_CONTENT)
  async read(@CurrentUser() user: AccessTokenPayload, @Param('id') id: string) {
    await this.notifications.markRead(user.sub, id);
  }
}
