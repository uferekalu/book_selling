import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { CatalogModule } from '../catalog/catalog.module.js';
import { CommerceModule } from '../commerce/commerce.module.js';
import { UsersModule } from '../users/users.module.js';
import {
  AdminReviewsController,
  ReviewsController,
  WishlistController,
} from './engagement.controller.js';
import { ReviewsService } from './reviews.service.js';
import { Review, ReviewSchema } from './schemas/review.schema.js';
import { Wishlist, WishlistSchema } from './schemas/wishlist.schema.js';
import { WishlistService } from './wishlist.service.js';

/** Reviews and wishlists (PRODUCT_RULES §12, BS-11). */
@Module({
  imports: [
    UsersModule,
    CatalogModule,
    CommerceModule,
    MongooseModule.forFeature([
      { name: Review.name, schema: ReviewSchema },
      { name: Wishlist.name, schema: WishlistSchema },
    ]),
  ],
  controllers: [ReviewsController, AdminReviewsController, WishlistController],
  providers: [ReviewsService, WishlistService],
})
export class EngagementModule {}
