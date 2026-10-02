import {
  Body,
  Controller,
  Delete,
  Get,
  Header,
  Headers,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
  Req,
  Res,
  StreamableFile,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { IsIn, IsMongoId } from 'class-validator';
import type { CookieOptions, Request, Response } from 'express';
import {
  CurrentUser,
  OptionalUser,
} from '../auth/decorators/auth.decorators.js';
import type { AccessTokenPayload } from '../auth/interfaces/auth.types.js';
import { OptionalAuth } from '../common/decorators/public.decorator.js';
import type { Currency } from '../common/money/currency.js';
import {
  FORMAT_TYPES,
  type FormatType,
} from '../catalog/schemas/book.schema.js';
import { CartService, type CartOwner } from './cart.service.js';
import {
  CartItemDto,
  CurrencyParam,
  GuestOrderDto,
  PlaceOrderDto,
  QuoteDto,
} from './dto/commerce.dto.js';
import {
  filename as invoiceFilename,
  InvoiceService,
} from './invoice.service.js';
import { presentOrder } from './order.presenter.js';
import { CheckoutProblemsException, OrdersService } from './orders.service.js';
import { PricingService } from './pricing.service.js';
import { GUEST_CART_DAYS } from './schemas/cart.schema.js';

export const CART_COOKIE = 'bs_cart';
const perMinute = (limit: number) => ({ default: { limit, ttl: 60_000 } });

export function buildCartCookieOptions(isProduction: boolean): CookieOptions {
  return {
    httpOnly: true,
    secure: isProduction,
    // Lax: the cart must survive arriving from a link (an email, the provider's return page).
    sameSite: 'lax',
    path: '/api',
    maxAge: GUEST_CART_DAYS * 86_400_000,
  };
}

class CartLineParams {
  @IsMongoId() bookId: string;
  @IsIn(FORMAT_TYPES) format: FormatType;
}

abstract class CartAware {
  constructor(
    protected readonly cart: CartService,
    protected readonly isProduction: boolean,
  ) {}

  /** Who owns the cart; a signed-in buyer's guest cart is merged and its cookie cleared. */
  protected owner(
    user: AccessTokenPayload | null,
    req: Request,
    res: Response,
  ): CartOwner {
    const raw = (req.cookies as Record<string, string | undefined>)[
      CART_COOKIE
    ];
    const guestId = raw && /^[A-Za-z0-9_-]{20,64}$/.test(raw) ? raw : null;
    if (user && guestId) {
      res.clearCookie(CART_COOKIE, {
        ...buildCartCookieOptions(this.isProduction),
        maxAge: undefined,
      });
    }
    return { userId: user?.sub ?? null, guestId };
  }

  /** A guest about to store something gets a cart cookie. */
  protected ensureGuest(owner: CartOwner, res: Response): CartOwner {
    if (owner.userId || owner.guestId) return owner;
    const guestId = this.cart.newGuestId();
    res.cookie(CART_COOKIE, guestId, buildCartCookieOptions(this.isProduction));
    return { userId: null, guestId };
  }
}

/** The cart, for guests and signed-in buyers alike (PRODUCT_RULES §6). */
@ApiTags('cart')
@OptionalAuth()
@Controller('cart')
export class CartController extends CartAware {
  constructor(cart: CartService, config: ConfigService) {
    super(cart, config.get<string>('NODE_ENV') === 'production');
  }

  @Get()
  view(
    @OptionalUser() user: AccessTokenPayload | null,
    @Query() query: CurrencyParam,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    return this.cart.view(this.owner(user, req, res), query.currency ?? 'USD');
  }

  @Post('items')
  @Throttle(perMinute(60))
  add(
    @OptionalUser() user: AccessTokenPayload | null,
    @Body() dto: CartItemDto,
    @Query() query: CurrencyParam,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const owner = this.ensureGuest(this.owner(user, req, res), res);
    return this.cart.add(
      owner,
      {
        bookId: dto.bookId,
        format: dto.format,
        quantity: Math.max(1, dto.quantity),
      },
      query.currency ?? 'USD',
    );
  }

  @Patch('items')
  @Throttle(perMinute(120))
  update(
    @OptionalUser() user: AccessTokenPayload | null,
    @Body() dto: CartItemDto,
    @Query() query: CurrencyParam,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    return this.cart.setQuantity(
      this.owner(user, req, res),
      dto,
      query.currency ?? 'USD',
    );
  }

  @Delete('items/:bookId/:format')
  remove(
    @OptionalUser() user: AccessTokenPayload | null,
    @Param() params: CartLineParams,
    @Query() query: CurrencyParam,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    return this.cart.remove(
      this.owner(user, req, res),
      params.bookId,
      params.format,
      query.currency ?? 'USD',
    );
  }
}

/** Quote and place orders (ARCHITECTURE §8.2). */
@ApiTags('checkout')
@Controller()
export class CheckoutController extends CartAware {
  constructor(
    cart: CartService,
    config: ConfigService,
    private readonly pricing: PricingService,
    private readonly orders: OrdersService,
    private readonly invoices: InvoiceService,
  ) {
    super(cart, config.get<string>('NODE_ENV') === 'production');
  }

  /** The exact amounts for the current cart: shown on "Review & pay" and charged as is. */
  @OptionalAuth()
  @Post('checkout/quote')
  @HttpCode(HttpStatus.OK)
  @Throttle(perMinute(60))
  async quote(
    @OptionalUser() user: AccessTokenPayload | null,
    @Body() dto: QuoteDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const owner = this.owner(user, req, res);
    return this.pricing.quote({
      currency: dto.currency,
      items: await this.cart.items(owner),
      userId: user?.sub ?? null,
      email: user ? null : (dto.email ?? null),
      shippingCountry: dto.shippingCountry ?? null,
      couponCode: dto.couponCode ?? null,
    });
  }

  /** Places the order from the cart. Send the same Idempotency-Key to retry safely. */
  @OptionalAuth()
  @Post('orders')
  @Throttle(perMinute(20))
  async place(
    @OptionalUser() user: AccessTokenPayload | null,
    @Body() dto: PlaceOrderDto,
    @Headers('idempotency-key') key: string | undefined,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    if (!dto.acceptTerms) {
      throw new CheckoutProblemsException([
        'Please accept the Terms of Sale to continue',
      ]);
    }
    const { order, created } = await this.orders.place({
      owner: this.owner(user, req, res),
      actor: user,
      checkoutKey: key ?? '',
      currency: dto.currency as Currency,
      country: dto.country,
      email: dto.email,
      name: dto.name,
      shippingAddress: dto.shippingAddress
        ? {
            fullName: dto.shippingAddress.fullName,
            phone: dto.shippingAddress.phone,
            line1: dto.shippingAddress.line1,
            line2: dto.shippingAddress.line2 ?? '',
            city: dto.shippingAddress.city,
            state: dto.shippingAddress.state ?? '',
            postalCode: dto.shippingAddress.postalCode ?? '',
            country: dto.shippingAddress.country,
          }
        : undefined,
      couponCode: dto.couponCode,
      returnPath: dto.returnPath,
    });
    res.status(created ? HttpStatus.CREATED : HttpStatus.OK);
    return presentOrder(order);
  }

  @Get('orders')
  async mine(@CurrentUser() user: AccessTokenPayload) {
    return (await this.orders.listForUser(user.sub)).map(presentOrder);
  }

  @Get('orders/:orderNumber')
  async one(
    @CurrentUser() user: AccessTokenPayload,
    @Param('orderNumber') orderNumber: string,
  ) {
    return presentOrder(await this.orders.forUser(orderNumber, user.sub));
  }

  /** The PDF invoice of one of the customer's paid orders. */
  @Get('orders/:orderNumber/invoice')
  @Header('Content-Type', 'application/pdf')
  @Header('Cache-Control', 'no-store')
  @Throttle(perMinute(20))
  async invoice(
    @CurrentUser() user: AccessTokenPayload,
    @Param('orderNumber') orderNumber: string,
  ) {
    const order = await this.orders.forUser(orderNumber, user.sub);
    return new StreamableFile(Buffer.from(await this.invoices.pdf(order)), {
      disposition: `attachment; filename="${invoiceFilename(order)}"`,
    });
  }

  @Post('orders/:orderNumber/cancel')
  @HttpCode(HttpStatus.OK)
  async cancel(
    @CurrentUser() user: AccessTokenPayload,
    @Param('orderNumber') orderNumber: string,
  ) {
    const order = await this.orders.forUser(orderNumber, user.sub);
    return presentOrder(await this.orders.cancel(order, 'customer'));
  }

  /** A guest's order, proven by the checkout key their browser kept (sent in the body, not the URL). */
  @OptionalAuth()
  @Post('guest-orders/lookup')
  @HttpCode(HttpStatus.OK)
  @Throttle(perMinute(30))
  async guestLookup(@Body() dto: GuestOrderDto) {
    return presentOrder(
      await this.orders.forGuest(dto.orderNumber, dto.checkoutKey),
    );
  }

  /** A guest's invoice, proven by their checkout key (in the body, never the URL). */
  @OptionalAuth()
  @Post('guest-orders/invoice')
  @HttpCode(HttpStatus.OK)
  @Header('Content-Type', 'application/pdf')
  @Header('Cache-Control', 'no-store')
  @Throttle(perMinute(20))
  async guestInvoice(@Body() dto: GuestOrderDto) {
    const order = await this.orders.forGuest(dto.orderNumber, dto.checkoutKey);
    return new StreamableFile(Buffer.from(await this.invoices.pdf(order)), {
      disposition: `attachment; filename="${invoiceFilename(order)}"`,
    });
  }

  @OptionalAuth()
  @Post('guest-orders/cancel')
  @HttpCode(HttpStatus.OK)
  @Throttle(perMinute(10))
  async guestCancel(@Body() dto: GuestOrderDto) {
    const order = await this.orders.forGuest(dto.orderNumber, dto.checkoutKey);
    return presentOrder(await this.orders.cancel(order, 'customer'));
  }
}
