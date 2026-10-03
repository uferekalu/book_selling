import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  NotFoundException,
  Param,
  Post,
  Query,
  Req,
  UnauthorizedException,
  type RawBodyRequest,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import {
  ApiBearerAuth,
  ApiExcludeController,
  ApiProperty,
  ApiPropertyOptional,
  ApiTags,
} from '@nestjs/swagger';
import { SkipThrottle, Throttle } from '@nestjs/throttler';
import { Transform } from 'class-transformer';
import {
  IsIn,
  IsInt,
  IsISO31661Alpha2,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import type { Request } from 'express';
import type { Model } from 'mongoose';
import {
  CurrentUser,
  OptionalUser,
  Roles,
} from '../auth/decorators/auth.decorators.js';
import type { AccessTokenPayload } from '../auth/interfaces/auth.types.js';
import { OptionalAuth, Public } from '../common/decorators/public.decorator.js';
import {
  CURRENCIES,
  MAX_PRICE_MINOR,
  type Currency,
} from '../common/money/currency.js';
import { presentOrder } from '../commerce/order.presenter.js';
import { Order } from '../commerce/schemas/order.schema.js';
import { AuditService } from '../audit/audit.module.js';
import { PaymentsService } from './payments.service.js';
import { PROVIDERS, type Provider } from './schemas/payment.schema.js';

const perMinute = (limit: number) => ({ default: { limit, ttl: 60_000 } });
const trim = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;
const REFERENCE = /^BSP-[a-f0-9]{32}$/;

class OptionsQuery {
  @ApiProperty({ enum: CURRENCIES }) @IsIn(CURRENCIES) currency: Currency;
  @ApiPropertyOptional({
    example: 'NG',
    description:
      "The buyer's country from checkout (Stripe is offered only in allowed countries)",
  })
  @IsOptional()
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim().toUpperCase() : value,
  )
  @IsISO31661Alpha2()
  country?: string;
}

class ReleaseDto {
  @ApiProperty() @IsString() @Matches(/^BS-\d{4}-\d{6}$/) orderNumber: string;
  @ApiPropertyOptional({ description: "A guest's checkout key" })
  @IsOptional()
  @IsString()
  @Matches(/^[A-Za-z0-9_-]{22,100}$/)
  checkoutKey?: string;
}

class InitiateDto {
  @ApiProperty() @IsString() @Matches(/^BS-\d{4}-\d{6}$/) orderNumber: string;
  @ApiProperty({ enum: PROVIDERS }) @IsIn(PROVIDERS) provider: Provider;
  @ApiPropertyOptional({
    description: "A guest's checkout key (their proof of access)",
  })
  @IsOptional()
  @IsString()
  @Matches(/^[A-Za-z0-9_-]{22,100}$/)
  checkoutKey?: string;
}

class VerifyDto {
  @ApiProperty() @IsString() @Matches(REFERENCE) reference: string;
}

class RefundDto {
  @ApiProperty({ description: 'Minor units' })
  @IsInt()
  @Min(1)
  @Max(MAX_PRICE_MINOR)
  amount: number;
  @ApiProperty()
  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @MaxLength(300)
  reason: string;
}

class ResolveDto {
  @ApiProperty()
  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  note: string;
}

/** Starting and confirming payments (ARCHITECTURE §8.2 steps 3–5). */
@ApiTags('payments')
@Controller('payments')
export class PaymentsController {
  constructor(private readonly payments: PaymentsService) {}

  /** Providers that can take this currency, with the default first. */
  @Public()
  @Get('options')
  options(@Query() query: OptionsQuery) {
    return this.payments.options(query.currency, query.country ?? null);
  }

  /** Creates a payment attempt for the exact order total and returns the provider's page. */
  @OptionalAuth()
  @Post('initiate')
  @HttpCode(HttpStatus.OK)
  @Throttle(perMinute(10))
  initiate(
    @OptionalUser() user: AccessTokenPayload | null,
    @Body() dto: InitiateDto,
  ) {
    return this.payments.initiate({
      orderNumber: dto.orderNumber,
      provider: dto.provider,
      actor: user,
      checkoutKey: dto.checkoutKey,
    });
  }

  /**
   * "Pay another way": releases an unpaid order (checking every open attempt with its provider
   * first) so the buyer can check out again, e.g. in another currency (BS-23).
   */
  @OptionalAuth()
  @Post('release')
  @HttpCode(HttpStatus.OK)
  @Throttle(perMinute(10))
  async release(
    @OptionalUser() user: AccessTokenPayload | null,
    @Body() dto: ReleaseDto,
  ) {
    return presentOrder(
      await this.payments.release({
        orderNumber: dto.orderNumber,
        actor: user,
        checkoutKey: dto.checkoutKey,
      }),
    );
  }

  /** Called by /checkout/callback: asks the provider directly; never trusts the browser. */
  @Public()
  @Post('verify')
  @HttpCode(HttpStatus.OK)
  @Throttle(perMinute(30))
  verify(@Body() dto: VerifyDto) {
    return this.payments.verifyReference(dto.reference);
  }
}

/**
 * Provider webhooks (ARCHITECTURE §9.3). Signature checked against the exact raw body first; a bad
 * one is 401. Once verified, always 2xx (providers disable endpoints that keep failing); processing
 * errors are recorded and reconciliation picks them up.
 */
@ApiExcludeController()
@Controller('payments/webhooks')
export class PaymentWebhooksController {
  constructor(private readonly payments: PaymentsService) {}

  @Public()
  @SkipThrottle()
  @Post(':provider')
  @HttpCode(HttpStatus.OK)
  async receive(
    @Param('provider') provider: string,
    @Req() req: RawBodyRequest<Request>,
  ) {
    if (!(PROVIDERS as readonly string[]).includes(provider) || !req.rawBody) {
      throw new UnauthorizedException('Invalid webhook');
    }
    const accepted = await this.payments.handleWebhook(
      provider as Provider,
      req.rawBody,
      req.headers,
    );
    if (!accepted) throw new UnauthorizedException('Invalid webhook signature');
    return { received: true };
  }
}

/** Payments and refunds in the admin (staff with two-step verification). */
@ApiTags('admin: commerce')
@ApiBearerAuth()
@Roles('admin', 'owner')
@Controller('admin/orders')
export class AdminPaymentsController {
  constructor(
    private readonly payments: PaymentsService,
    private readonly audit: AuditService,
    @InjectModel(Order.name) private readonly orders: Model<Order>,
  ) {}

  @Get(':orderNumber/payments')
  async list(@Param('orderNumber') orderNumber: string) {
    const order = await this.orders.findOne({ orderNumber }).exec();
    if (!order) throw new NotFoundException('Order not found');
    return this.payments.forOrder(order._id);
  }

  /** Refunds move money back: the owner only, until BS-12 adds a threshold for admins. */
  @Roles('owner')
  @Post(':orderNumber/refunds')
  @HttpCode(HttpStatus.OK)
  @Throttle(perMinute(10))
  refund(
    @Param('orderNumber') orderNumber: string,
    @Body() dto: RefundDto,
    @CurrentUser() actor: AccessTokenPayload,
  ) {
    return this.payments.refund({
      orderNumber,
      amount: dto.amount,
      reason: dto.reason,
      actor,
    });
  }

  /** Clears "needs attention" once a person has dealt with it (audited, note required). */
  @Post(':orderNumber/resolve-attention')
  @HttpCode(HttpStatus.OK)
  async resolve(
    @Param('orderNumber') orderNumber: string,
    @Body() dto: ResolveDto,
    @CurrentUser() actor: AccessTokenPayload,
  ) {
    const order = await this.orders
      .findOneAndUpdate(
        { orderNumber, 'attention.required': true },
        { $set: { attention: { required: false, reason: '' } } },
        { returnDocument: 'before' },
      )
      .exec();
    if (!order)
      throw new NotFoundException('No open attention item on this order');
    await this.audit.record({
      actor: { id: actor.sub, role: actor.role },
      action: 'order.attention_resolved',
      entityType: 'order',
      entityId: order._id.toString(),
      changes: { reason: order.attention.reason, note: dto.note },
    });
    return presentOrder((await this.orders.findById(order._id).exec())!);
  }
}
