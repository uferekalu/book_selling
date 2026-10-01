import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  NotFoundException,
  Param,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { Model, QueryFilter } from 'mongoose';
import { CurrentUser, Roles } from '../auth/decorators/auth.decorators.js';
import type { AccessTokenPayload } from '../auth/interfaces/auth.types.js';
import { CouponsService } from './coupons.service.js';
import {
  AdminOrdersQuery,
  CouponDto,
  ShippingZoneDto,
} from './dto/commerce.dto.js';
import { presentOrder } from './order.presenter.js';
import {
  Order,
  ORDER_STATUSES,
  type OrderStatus,
} from './schemas/order.schema.js';
import { ShippingService } from './shipping.service.js';

const escapeRegex = (text: string) =>
  text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Shipping zones, coupons and orders for staff (with two-step verification). */
@ApiTags('admin: commerce')
@ApiBearerAuth()
@Roles('admin', 'owner')
@Controller('admin')
export class AdminCommerceController {
  constructor(
    private readonly shipping: ShippingService,
    private readonly coupons: CouponsService,
    @InjectModel(Order.name) private readonly orders: Model<Order>,
  ) {}

  // ---- shipping zones

  @Get('shipping-zones')
  async zones() {
    return (await this.shipping.list()).map((z) => ({
      id: z._id.toString(),
      name: z.name,
      countries: z.countries,
      rates: z.rates.map((r) => ({
        currency: r.currency,
        firstItem: r.firstItem,
        additionalItem: r.additionalItem,
      })),
      estimatedDays: { min: z.estimatedDays.min, max: z.estimatedDays.max },
      active: z.active,
    }));
  }

  @Post('shipping-zones')
  async createZone(
    @Body() dto: ShippingZoneDto,
    @CurrentUser() actor: AccessTokenPayload,
  ) {
    await this.shipping.create(dto, actor);
    return this.zones();
  }

  @Put('shipping-zones/:id')
  async updateZone(
    @Param('id') id: string,
    @Body() dto: ShippingZoneDto,
    @CurrentUser() actor: AccessTokenPayload,
  ) {
    await this.shipping.update(id, dto, actor);
    return this.zones();
  }

  @Delete('shipping-zones/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteZone(
    @Param('id') id: string,
    @CurrentUser() actor: AccessTokenPayload,
  ) {
    await this.shipping.remove(id, actor);
  }

  // ---- coupons (the admin screens arrive in BS-11; the API is complete now)

  @Get('coupons')
  async couponList() {
    return (await this.coupons.list()).map((c) => ({
      id: c._id.toString(),
      code: c.code,
      description: c.description,
      kind: c.kind,
      percentOff: c.percentOff,
      amountsOff: c.amountsOff,
      minSubtotals: c.minSubtotals,
      appliesTo: {
        bookIds: c.appliesTo.bookIds.map(String),
        formats: c.appliesTo.formats,
      },
      startsAt: c.startsAt?.toISOString() ?? null,
      endsAt: c.endsAt?.toISOString() ?? null,
      maxRedemptions: c.maxRedemptions,
      perCustomerLimit: c.perCustomerLimit,
      redemptionCount: c.redemptionCount,
      active: c.active,
    }));
  }

  @Post('coupons')
  async createCoupon(
    @Body() dto: CouponDto,
    @CurrentUser() actor: AccessTokenPayload,
  ) {
    await this.coupons.create(dto, actor);
    return this.couponList();
  }

  @Put('coupons/:id')
  async updateCoupon(
    @Param('id') id: string,
    @Body() dto: CouponDto,
    @CurrentUser() actor: AccessTokenPayload,
  ) {
    await this.coupons.update(id, dto, actor);
    return this.couponList();
  }

  // ---- orders (a first, read-only view; fulfilment and refunds arrive in BS-8/BS-9)

  @Get('orders')
  async orderList(@Query() query: AdminOrdersQuery) {
    const filter: QueryFilter<Order> = {};
    if (
      query.status &&
      (ORDER_STATUSES as readonly string[]).includes(query.status)
    ) {
      filter.status = query.status as OrderStatus;
    }
    if (query.q) {
      const pattern = { $regex: escapeRegex(query.q), $options: 'i' };
      filter.$or = [
        { orderNumber: pattern },
        { email: pattern },
        { customerName: pattern },
      ];
    }
    const orders = await this.orders
      .find(filter)
      .sort({ createdAt: -1 })
      .limit(100)
      .exec();
    return orders.map((order) => ({
      ...presentOrder(order),
      attention: order.attention,
    }));
  }

  @Get('orders/:orderNumber')
  async order(@Param('orderNumber') orderNumber: string) {
    const order = await this.orders.findOne({ orderNumber }).exec();
    if (!order) throw new NotFoundException('Order not found');
    return { ...presentOrder(order), attention: order.attention };
  }
}
