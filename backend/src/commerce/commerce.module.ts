import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { AuditModule } from '../audit/audit.module.js';
import { CatalogModule } from '../catalog/catalog.module.js';
import { JobsModule } from '../jobs/jobs.module.js';
import { MailModule } from '../mail/mail.module.js';
import { UploadsModule } from '../uploads/uploads.module.js';
import { UsersModule } from '../users/users.module.js';
import { AdminCommerceController } from './admin-commerce.controller.js';
import { CartService } from './cart.service.js';
import { CartController, CheckoutController } from './commerce.controller.js';
import { CouponsService } from './coupons.service.js';
import { OrderExpiryJob } from './order-expiry.job.js';
import { OrdersService } from './orders.service.js';
import { PricingService } from './pricing.service.js';
import { Cart, CartSchema } from './schemas/cart.schema.js';
import {
  Coupon,
  CouponRedemption,
  CouponRedemptionSchema,
  CouponSchema,
} from './schemas/coupon.schema.js';
import {
  Entitlement,
  EntitlementSchema,
} from './schemas/entitlement.schema.js';
import {
  Counter,
  CounterSchema,
  Order,
  OrderSchema,
} from './schemas/order.schema.js';
import {
  ShippingZone,
  ShippingZoneSchema,
} from './schemas/shipping-zone.schema.js';
import { ShippingService } from './shipping.service.js';
import { ShipmentsService } from './shipments.service.js';
import { InvoiceService } from './invoice.service.js';
import { EbookUsageService } from './ebook-usage.service.js';
import {
  ReadingProgress,
  ReadingProgressSchema,
} from '../library/schemas/reading-progress.schema.js';
import { Payment, PaymentSchema } from '../payments/schemas/payment.schema.js';

/** Cart, pricing, shipping, coupons and orders (ARCHITECTURE §8). Payments arrive in BS-8. */
@Module({
  imports: [
    CatalogModule,
    UsersModule,
    UploadsModule,
    AuditModule,
    MailModule,
    JobsModule,
    MongooseModule.forFeature([
      { name: Cart.name, schema: CartSchema },
      { name: ShippingZone.name, schema: ShippingZoneSchema },
      { name: Coupon.name, schema: CouponSchema },
      { name: CouponRedemption.name, schema: CouponRedemptionSchema },
      { name: Order.name, schema: OrderSchema },
      { name: Counter.name, schema: CounterSchema },
      { name: Entitlement.name, schema: EntitlementSchema },
      // Read-only here: expiry and one-open-checkout skip orders with a payment in progress.
      { name: Payment.name, schema: PaymentSchema },
      // Read-only here: how far a buyer read, for refund decisions (EbookUsageService).
      { name: ReadingProgress.name, schema: ReadingProgressSchema },
    ]),
  ],
  controllers: [CartController, CheckoutController, AdminCommerceController],
  providers: [
    PricingService,
    ShippingService,
    CouponsService,
    CartService,
    OrdersService,
    OrderExpiryJob,
    ShipmentsService,
    InvoiceService,
    EbookUsageService,
  ],
  exports: [OrdersService, PricingService, CartService, MongooseModule],
})
export class CommerceModule {}
