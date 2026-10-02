import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { OrderItem } from '../orders/entities/order-item.entity';
import { ProductsModule } from '../products/products.module';
import { UsersModule } from '../users/users.module';
import { Review } from './entities/review.entity';
import { ProductReviewsController } from './product-reviews.controller';
import { ReviewsController } from './reviews.controller';
import { ReviewsService } from './reviews.service';

/**
 * `OrderItem` chỉ đăng ký entity qua `TypeOrmModule.forFeature` để `ReviewsService` kiểm tra
 * "đã mua và COMPLETED" bằng `.exists()` — không import `OrdersModule` (CODING_STANDARD.md mục
 * 10, cùng pattern `UsersModule` ↔ `Order`). `Product` repository đến từ `ProductsModule`.
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([Review, OrderItem]),
    UsersModule,
    ProductsModule,
  ],
  controllers: [ProductReviewsController, ReviewsController],
  providers: [ReviewsService],
  exports: [TypeOrmModule],
})
export class ReviewsModule {}
