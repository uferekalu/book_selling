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
} from '@nestjs/common';
import { ApiBearerAuth, ApiProperty, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { IsInt, Max, Min } from 'class-validator';
import { CurrentUser } from '../auth/decorators/auth.decorators.js';
import type { AccessTokenPayload } from '../auth/interfaces/auth.types.js';
import { LibraryService } from './library.service.js';

export class ReadingProgressDto {
  @ApiProperty({ description: 'PDF page the reader is on (1-based)' })
  @IsInt()
  @Min(1)
  @Max(20_000)
  page: number;
}

const perMinute = (limit: number) => ({ default: { limit, ttl: 60_000 } });

/**
 * My Library (ARCHITECTURE §10.2–10.3). Signed-in customers only (the global guard); every
 * method checks the book is theirs. Links are never cached.
 */
@ApiTags('library')
@ApiBearerAuth()
@Controller('library')
export class LibraryController {
  constructor(private readonly library: LibraryService) {}

  @Get()
  @Header('Cache-Control', 'no-store')
  list(@CurrentUser() user: AccessTokenPayload) {
    return this.library.list(user.sub);
  }

  /** Book ids and slugs the user owns ("In your library" on the storefront). */
  @Get('owned')
  @Header('Cache-Control', 'no-store')
  owned(@CurrentUser() user: AccessTokenPayload) {
    return this.library.owned(user.sub);
  }

  @Get(':bookId')
  @Header('Cache-Control', 'no-store')
  item(
    @CurrentUser() user: AccessTokenPayload,
    @Param('bookId') bookId: string,
  ) {
    return this.library.item(user.sub, bookId);
  }

  /** A 60-minute link for the online reader, or `{ status: 'preparing' }` while the copy is made. */
  @Post(':bookId/read')
  @HttpCode(HttpStatus.OK)
  @Throttle(perMinute(30))
  @Header('Cache-Control', 'no-store')
  read(
    @CurrentUser() user: AccessTokenPayload,
    @Param('bookId') bookId: string,
  ) {
    return this.library.readLink(user.sub, bookId);
  }

  /** A 5-minute download link; at most 10 per book per hour (429 with the wait time). */
  @Post(':bookId/download')
  @HttpCode(HttpStatus.OK)
  @Throttle(perMinute(20))
  @Header('Cache-Control', 'no-store')
  download(
    @CurrentUser() user: AccessTokenPayload,
    @Param('bookId') bookId: string,
  ) {
    return this.library.downloadLink(user.sub, bookId);
  }

  @Put(':bookId/progress')
  @HttpCode(HttpStatus.NO_CONTENT)
  @Throttle(perMinute(60))
  async progress(
    @CurrentUser() user: AccessTokenPayload,
    @Param('bookId') bookId: string,
    @Body() dto: ReadingProgressDto,
  ) {
    await this.library.saveProgress(user.sub, bookId, dto.page);
  }
}
