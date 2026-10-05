import {
  Body,
  Controller,
  Get,
  Header,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiProperty,
  ApiPropertyOptional,
  ApiTags,
} from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import { IsEmail, IsIn, IsInt, IsOptional, Max, Min } from 'class-validator';
import { CurrentUser, Roles } from '../auth/decorators/auth.decorators.js';
import type { AccessTokenPayload } from '../auth/interfaces/auth.types.js';
import { AdminEmailsService } from './admin-emails.service.js';

class ProblemsQuery {
  @ApiPropertyOptional({ enum: ['open', 'all'], default: 'open' })
  @IsOptional()
  @IsIn(['open', 'all'])
  show?: 'open' | 'all';

  @ApiPropertyOptional({ default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(1000)
  page?: number;
}

class AllowAddressDto {
  @ApiProperty()
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsEmail()
  email: string;
}

const actorOf = (user: AccessTokenPayload) => ({
  id: user.sub,
  role: user.role,
});

/** Emails that didn't reach their recipient, for staff with two-step verification (BS-30). */
@ApiTags('admin: emails')
@ApiBearerAuth()
@Roles('admin', 'owner')
@Controller('admin/emails')
export class AdminEmailsController {
  constructor(private readonly emails: AdminEmailsService) {}

  @Get('problems')
  @Header('Cache-Control', 'no-store')
  problems(@Query() query: ProblemsQuery) {
    return this.emails.problems(query.show ?? 'open', query.page ?? 1);
  }

  @Get('problems/count')
  @Header('Cache-Control', 'no-store')
  async count() {
    return { open: await this.emails.countOpen() };
  }

  @Post(':id/resend')
  @HttpCode(HttpStatus.OK)
  resend(@Param('id') id: string, @CurrentUser() user: AccessTokenPayload) {
    return this.emails.resend(id, actorOf(user));
  }

  @Post(':id/reviewed')
  @HttpCode(HttpStatus.OK)
  reviewed(@Param('id') id: string, @CurrentUser() user: AccessTokenPayload) {
    return this.emails.markReviewed(id, actorOf(user));
  }

  @Post('allow-address')
  @HttpCode(HttpStatus.OK)
  allow(@Body() dto: AllowAddressDto, @CurrentUser() user: AccessTokenPayload) {
    return this.emails.allowAddress(dto.email, actorOf(user));
  }
}
