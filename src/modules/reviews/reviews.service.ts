import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { I18nService } from 'nestjs-i18n';
import { Repository, SelectQueryBuilder } from 'typeorm';
import { isUniqueViolation } from '../../common/utils/postgres-unique-violation.util';
import { OrderItem } from '../orders/entities/order-item.entity';
import { OrderStatus } from '../orders/enums/order-status.enum';
import { Product } from '../products/entities/product.entity';
import { AVERAGE_RATING_DECIMALS } from './constants/reviews.constants';
import { CreateReviewDto } from './dto/create-review.dto';
import { ListReviewsQueryDto } from './dto/list-reviews-query.dto';
import { PatchReviewDto } from './dto/patch-review.dto';
import {
  ReviewResponseDto,
  ReviewsResponseDto,
} from './dto/review-response.dto';
import { Review } from './entities/review.entity';
import { ReviewRatingAggregate } from './interfaces/review-rating-aggregate.interface';
import { ReviewRatingAggregateRow } from './interfaces/review-rating-aggregate-row.interface';

@Injectable()
export class ReviewsService {
  private readonly logger = new Logger(ReviewsService.name);

  constructor(
    @InjectRepository(Review)
    private readonly reviewsRepository: Repository<Review>,
    @InjectRepository(Product)
    private readonly productsRepository: Repository<Product>,
    @InjectRepository(OrderItem)
    private readonly orderItemsRepository: Repository<OrderItem>,
    private readonly i18n: I18nService,
  ) {}

  /**
   * REVIEW-01 — public, 404 nếu product không visible (active + category active). `limit`/`offset`
   * thay cho `take`/`skip`: `author` là ManyToOne nên join không nhân dòng, và `take`/`skip` kèm
   * join sẽ khiến TypeORM chạy thêm 1 query `SELECT DISTINCT` lấy id trước. Count lấy luôn từ
   * aggregate nên không cần `getManyAndCount()`. Page và aggregate chạy trên 2 connection pool
   * riêng (không phải một `manager` transaction) nên `Promise.all` ở đây có tác dụng thật.
   */
  async listProductReviews(
    productId: string,
    query: ListReviewsQueryDto,
  ): Promise<ReviewsResponseDto> {
    await this.assertProductVisible(productId);

    const [reviews, aggregate] = await Promise.all([
      this.baseReviewQuery()
        .where('review.productId = :productId', { productId })
        .orderBy('review.createdAt', 'DESC')
        .addOrderBy('review.id', 'DESC')
        .limit(query.limit)
        .offset(query.offset)
        .getMany(),
      this.loadRatingAggregate(productId),
    ]);
    return ReviewsResponseDto.fromEntities(reviews, aggregate);
  }

  /**
   * REVIEW-02 — chỉ customer có order COMPLETED chứa product (kiểm bằng `.exists()` trên
   * `order_items` join `orders`, không import `OrdersModule` — CODING_STANDARD.md mục 10). Không
   * lock: hai request tạo đồng thời cùng (user, product) được unique `uq_reviews_user_product`
   * xử lý, thua cuộc nhận 409 (database.md — "reviews"). Nạp lại review sau insert vì
   * `AuthenticatedUser` không có `username` và `createdAt`/`updatedAt` do DB sinh.
   */
  async createReview(
    userId: string,
    productId: string,
    dto: CreateReviewDto,
  ): Promise<ReviewResponseDto> {
    await this.assertProductVisible(productId);

    const hasCompletedPurchase = await this.orderItemsRepository.exists({
      where: {
        productId,
        order: { userId, status: OrderStatus.COMPLETED },
      },
    });
    if (!hasCompletedPurchase) {
      throw new ConflictException(
        this.i18n.t('errors.reviewRequiresCompletedPurchase'),
      );
    }

    const review = this.reviewsRepository.create({
      userId,
      productId,
      rating: dto.rating,
      comment: dto.comment,
    });
    try {
      await this.reviewsRepository.insert(review);
    } catch (error) {
      throw this.toConflictOrRethrow(error);
    }
    this.logger.log(
      `Customer ${userId} created review ${review.id} for product ${productId}`,
    );
    return this.loadReviewResponse(review.id);
  }

  /**
   * REVIEW-03 — ownership nằm ngay trong điều kiện UPDATE (`id` + `userId`): review của người khác
   * và review không tồn tại cùng trả 404, không lộ review đó có tồn tại hay không. Một câu UPDATE
   * nên không cần lock hay transaction. Admin không có route sửa (`@Roles(CUSTOMER)`).
   */
  async updateOwnReview(
    userId: string,
    reviewId: string,
    dto: PatchReviewDto,
  ): Promise<ReviewResponseDto> {
    if (dto.rating === undefined && dto.comment === undefined) {
      throw new BadRequestException(
        this.i18n.t('errors.atLeastOneFieldRequired'),
      );
    }

    const changes: Partial<Review> = {
      ...(dto.rating !== undefined && { rating: dto.rating }),
      ...(dto.comment !== undefined && { comment: dto.comment }),
    };
    const result = await this.reviewsRepository.update(
      { id: reviewId, userId },
      changes,
    );
    if (!result.affected) {
      throw new NotFoundException(this.i18n.t('errors.reviewNotFound'));
    }
    this.logger.log(
      `Customer ${userId} updated review ${reviewId}: ${Object.keys(changes).join(', ')}`,
    );
    return this.loadReviewResponse(reviewId);
  }

  /** REVIEW-04 — hard delete (api-requirements.csv), cùng ownership-trong-query với REVIEW-03. */
  async deleteOwnReview(userId: string, reviewId: string): Promise<void> {
    const result = await this.reviewsRepository.delete({
      id: reviewId,
      userId,
    });
    if (!result.affected) {
      throw new NotFoundException(this.i18n.t('errors.reviewNotFound'));
    }
    this.logger.log(`Customer ${userId} deleted review ${reviewId}`);
  }

  /** Cùng điều kiện visibility với public product API: product active và category active. */
  private async assertProductVisible(productId: string): Promise<void> {
    const isVisible = await this.productsRepository.exists({
      where: { id: productId, isActive: true, category: { isActive: true } },
    });
    if (!isVisible) {
      throw new NotFoundException(this.i18n.t('errors.productNotFound'));
    }
  }

  private async loadReviewResponse(
    reviewId: string,
  ): Promise<ReviewResponseDto> {
    const review = await this.baseReviewQuery()
      .where('review.id = :reviewId', { reviewId })
      .getOne();
    if (!review) {
      throw new NotFoundException(this.i18n.t('errors.reviewNotFound'));
    }
    return ReviewResponseDto.fromEntity(review);
  }

  /** Count + average tính trong SQL trên toàn bộ review của product, không tải review về Node. */
  private async loadRatingAggregate(
    productId: string,
  ): Promise<ReviewRatingAggregate> {
    const row = await this.reviewsRepository
      .createQueryBuilder('review')
      .select('COUNT(review.id)', 'reviewsCount')
      .addSelect(
        `ROUND(AVG(review.rating), ${AVERAGE_RATING_DECIMALS})`,
        'averageRating',
      )
      .where('review.productId = :productId', { productId })
      .getRawOne<ReviewRatingAggregateRow>();
    return {
      reviewsCount: Number(row?.reviewsCount ?? 0),
      averageRating: row?.averageRating ?? null,
    };
  }

  private baseReviewQuery(): SelectQueryBuilder<Review> {
    return this.reviewsRepository
      .createQueryBuilder('review')
      .innerJoin('review.user', 'author')
      .select([
        'review.id',
        'review.productId',
        'review.rating',
        'review.comment',
        'review.createdAt',
        'review.updatedAt',
        'author.id',
        'author.username',
      ]);
  }

  private toConflictOrRethrow(error: unknown): unknown {
    if (!isUniqueViolation(error)) {
      return error;
    }
    return new ConflictException(this.i18n.t('errors.reviewAlreadyExists'));
  }
}
