import {
  Body,
  Controller,
  Delete,
  Get,
  Header,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiProperty,
  ApiPropertyOptional,
  ApiTags,
} from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { Type } from 'class-transformer';
import {
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { CurrentUser, Roles } from '../auth/decorators/auth.decorators.js';
import type { AccessTokenPayload } from '../auth/interfaces/auth.types.js';
import { Public } from '../common/decorators/public.decorator.js';
import { CURRENCIES, type Currency } from '../common/money/currency.js';
import { ReviewsService } from './reviews.service.js';
import { REVIEW_BODY_MAX, REVIEW_STATUSES } from './schemas/review.schema.js';
import { WishlistService } from './wishlist.service.js';

class PageQuery {
  @ApiPropertyOptional({ default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(1000)
  page?: number;
}

class AdminReviewsQuery extends PageQuery {
  @ApiPropertyOptional({ enum: [...REVIEW_STATUSES, 'all'], default: 'all' })
  @IsOptional()
  @IsIn([...REVIEW_STATUSES, 'all'])
  status?: (typeof REVIEW_STATUSES)[number] | 'all';
}

class ReviewDto {
  @ApiProperty({ minimum: 1, maximum: 5 })
  @IsInt()
  @Min(1)
  @Max(5)
  rating: number;

  @ApiPropertyOptional({ maxLength: 120 })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  title?: string;

  @ApiPropertyOptional({ maxLength: REVIEW_BODY_MAX })
  @IsOptional()
  @IsString()
  @MaxLength(REVIEW_BODY_MAX)
  body?: string;
}

class VisibilityDto {
  @ApiProperty({ enum: REVIEW_STATUSES })
  @IsIn(REVIEW_STATUSES)
  status: (typeof REVIEW_STATUSES)[number];

  @ApiPropertyOptional({ description: 'Why it was hidden (staff only)' })
  @IsOptional()
  @IsString()
  @MaxLength(300)
  reason?: string;
}

class CurrencyQuery {
  @ApiPropertyOptional({ enum: CURRENCIES, default: 'USD' })
  @IsOptional()
  @IsIn(CURRENCIES)
  currency?: Currency;
}

/** Reviews on book pages (public) and the buyer's own review (BS-11). */
@ApiTags('reviews')
@Controller()
export class ReviewsController {
  constructor(private readonly reviews: ReviewsService) {}

  @Public()
  @Get('catalog/books/:bookId/reviews')
  list(@Param('bookId') bookId: string, @Query() query: PageQuery) {
    return this.reviews.forBook(bookId, query.page ?? 1);
  }

  @ApiBearerAuth()
  @Get('reviews/books/:bookId/mine')
  @Header('Cache-Control', 'no-store')
  mine(
    @CurrentUser() user: AccessTokenPayload,
    @Param('bookId') bookId: string,
  ) {
    return this.reviews.mine(user.sub, bookId);
  }

  @ApiBearerAuth()
  @Put('reviews/books/:bookId')
  @Throttle({ default: { limit: 20, ttl: 60 * 60_000 } })
  write(
    @CurrentUser() user: AccessTokenPayload,
    @Param('bookId') bookId: string,
    @Body() dto: ReviewDto,
  ) {
    return this.reviews.upsert(user.sub, bookId, {
      rating: dto.rating,
      title: dto.title,
      body: dto.body,
    });
  }

  @ApiBearerAuth()
  @Delete('reviews/books/:bookId')
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(
    @CurrentUser() user: AccessTokenPayload,
    @Param('bookId') bookId: string,
  ) {
    await this.reviews.removeOwn(user.sub, bookId);
  }
}

/** Review moderation for staff with two-step verification: hide or show, never edit. */
@ApiTags('admin: reviews')
@ApiBearerAuth()
@Roles('admin', 'owner')
@Controller('admin/reviews')
export class AdminReviewsController {
  constructor(private readonly reviews: ReviewsService) {}

  @Get()
  @Header('Cache-Control', 'no-store')
  list(@Query() query: AdminReviewsQuery) {
    return this.reviews.adminList(query.status ?? 'all', query.page ?? 1);
  }

  @Post(':id/visibility')
  @HttpCode(HttpStatus.NO_CONTENT)
  async visibility(
    @Param('id') id: string,
    @Body() dto: VisibilityDto,
    @CurrentUser() user: AccessTokenPayload,
  ) {
    await this.reviews.setVisibility(id, dto.status, dto.reason, {
      id: user.sub,
      role: user.role,
    });
  }
}

/** The signed-in customer's saved books (BS-11). */
@ApiTags('wishlist')
@ApiBearerAuth()
@Controller('wishlist')
export class WishlistController {
  constructor(private readonly wishlist: WishlistService) {}

  @Get()
  @Header('Cache-Control', 'no-store')
  books(
    @CurrentUser() user: AccessTokenPayload,
    @Query() query: CurrencyQuery,
  ) {
    return this.wishlist.list(user.sub, query.currency ?? 'USD');
  }

  @Get('ids')
  @Header('Cache-Control', 'no-store')
  ids(@CurrentUser() user: AccessTokenPayload) {
    return this.wishlist.ids(user.sub);
  }

  @Put(':bookId')
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  add(
    @CurrentUser() user: AccessTokenPayload,
    @Param('bookId') bookId: string,
  ) {
    return this.wishlist.add(user.sub, bookId);
  }

  @Delete(':bookId')
  remove(
    @CurrentUser() user: AccessTokenPayload,
    @Param('bookId') bookId: string,
  ) {
    return this.wishlist.remove(user.sub, bookId);
  }
}
