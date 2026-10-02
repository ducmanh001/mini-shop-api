import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { I18nService } from 'nestjs-i18n';
import { QueryFailedError, Repository } from 'typeorm';
import { OrderItem } from '../orders/entities/order-item.entity';
import { OrderStatus } from '../orders/enums/order-status.enum';
import { Product } from '../products/entities/product.entity';
import { CreateReviewDto } from './dto/create-review.dto';
import { ListReviewsQueryDto } from './dto/list-reviews-query.dto';
import { Review } from './entities/review.entity';
import { ReviewsService } from './reviews.service';

function mockQueryBuilder() {
  const builder: Record<string, jest.Mock> = {};
  for (const method of [
    'innerJoin',
    'select',
    'addSelect',
    'where',
    'orderBy',
    'addOrderBy',
    'limit',
    'offset',
  ]) {
    builder[method] = jest.fn().mockReturnThis();
  }
  builder.getMany = jest.fn().mockResolvedValue([]);
  builder.getOne = jest.fn();
  builder.getRawOne = jest.fn();
  return builder;
}

function sampleReview(overrides: Record<string, unknown> = {}): Review {
  return {
    id: 'review-1',
    productId: 'product-1',
    rating: 5,
    comment: 'Sản phẩm đúng mô tả.',
    createdAt: new Date('2026-09-22T03:00:00.000Z'),
    updatedAt: new Date('2026-09-22T03:00:00.000Z'),
    user: { id: 'user-1', username: 'customer_a' },
    ...overrides,
  } as unknown as Review;
}

function buildUniqueViolation(): QueryFailedError {
  const error = new QueryFailedError('INSERT', [], new Error('duplicate'));
  (error as unknown as { driverError: unknown }).driverError = {
    code: '23505',
    constraint: 'uq_reviews_user_product',
  };
  return error;
}

function listQuery(limit = 20, offset = 0): ListReviewsQueryDto {
  return Object.assign(new ListReviewsQueryDto(), { limit, offset });
}

describe('ReviewsService', () => {
  let reviewsRepository: {
    create: jest.Mock;
    insert: jest.Mock;
    update: jest.Mock;
    delete: jest.Mock;
    createQueryBuilder: jest.Mock;
  };
  let productsRepository: { exists: jest.Mock };
  let orderItemsRepository: { exists: jest.Mock };
  let i18n: { t: jest.Mock };
  let builder: ReturnType<typeof mockQueryBuilder>;
  let service: ReviewsService;

  beforeEach(() => {
    builder = mockQueryBuilder();
    reviewsRepository = {
      create: jest.fn((data: Partial<Review>) => ({
        id: 'review-1',
        ...data,
      })),
      insert: jest.fn().mockResolvedValue(undefined),
      update: jest.fn(),
      delete: jest.fn(),
      // Cả query trang lẫn aggregate dùng chung 1 builder — mỗi method terminal (getMany/getOne/
      // getRawOne) khác nhau nên không phụ thuộc thứ tự gọi `createQueryBuilder`.
      createQueryBuilder: jest.fn().mockReturnValue(builder),
    };
    productsRepository = { exists: jest.fn().mockResolvedValue(true) };
    orderItemsRepository = { exists: jest.fn().mockResolvedValue(true) };
    i18n = { t: jest.fn((key: string) => key) };

    service = new ReviewsService(
      reviewsRepository as unknown as Repository<Review>,
      productsRepository as unknown as Repository<Product>,
      orderItemsRepository as unknown as Repository<OrderItem>,
      i18n as unknown as I18nService,
    );
  });

  describe('listProductReviews', () => {
    it('throws NotFoundException when the product is not visible, without querying reviews', async () => {
      productsRepository.exists.mockResolvedValue(false);

      await expect(
        service.listProductReviews('product-1', listQuery()),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(reviewsRepository.createQueryBuilder).not.toHaveBeenCalled();
    });

    it('requires both the product and its category to be active', async () => {
      builder.getRawOne.mockResolvedValue({
        reviewsCount: '0',
        averageRating: null,
      });

      await service.listProductReviews('product-1', listQuery());

      expect(productsRepository.exists).toHaveBeenCalledWith({
        where: {
          id: 'product-1',
          isActive: true,
          category: { isActive: true },
        },
      });
    });

    it('returns the page with author id/username only, plus count and average over all reviews', async () => {
      builder.getMany.mockResolvedValue([
        sampleReview(),
        sampleReview({
          id: 'review-2',
          rating: 4,
          user: { id: 'user-2', username: 'customer_b' },
        }),
      ]);
      builder.getRawOne.mockResolvedValue({
        reviewsCount: '12',
        averageRating: '4.5',
      });

      const result = await service.listProductReviews(
        'product-1',
        listQuery(2, 0),
      );

      expect(result.reviewsCount).toBe(12);
      expect(result.averageRating).toBe('4.5');
      expect(result.reviews).toHaveLength(2);
      expect(result.reviews[0].author).toEqual({
        id: 'user-1',
        username: 'customer_a',
      });
      expect(result.reviews[1].id).toBe('review-2');
    });

    it('sorts newest first with an id tiebreak and applies limit/offset', async () => {
      builder.getRawOne.mockResolvedValue({
        reviewsCount: '0',
        averageRating: null,
      });

      await service.listProductReviews('product-1', listQuery(5, 10));

      expect(builder.orderBy).toHaveBeenCalledWith('review.createdAt', 'DESC');
      expect(builder.addOrderBy).toHaveBeenCalledWith('review.id', 'DESC');
      expect(builder.limit).toHaveBeenCalledWith(5);
      expect(builder.offset).toHaveBeenCalledWith(10);
    });

    it('does not select the author email', async () => {
      builder.getRawOne.mockResolvedValue({
        reviewsCount: '0',
        averageRating: null,
      });

      await service.listProductReviews('product-1', listQuery());

      const selected = builder.select.mock.calls.flat(2) as string[];
      expect(selected).toContain('author.username');
      expect(selected).not.toContain('author.email');
    });

    it('returns count 0 and averageRating null when the product has no reviews', async () => {
      builder.getRawOne.mockResolvedValue({
        reviewsCount: '0',
        averageRating: null,
      });

      const result = await service.listProductReviews('product-1', listQuery());

      expect(result).toEqual({
        reviews: [],
        reviewsCount: 0,
        averageRating: null,
      });
    });

    it('falls back to count 0 and null average when the aggregate returns no row', async () => {
      builder.getRawOne.mockResolvedValue(undefined);

      const result = await service.listProductReviews('product-1', listQuery());

      expect(result.reviewsCount).toBe(0);
      expect(result.averageRating).toBeNull();
    });
  });

  describe('createReview', () => {
    const dto: CreateReviewDto = { rating: 5, comment: 'Rất tốt' };

    it('throws NotFoundException when the product is not visible, before checking purchase', async () => {
      productsRepository.exists.mockResolvedValue(false);

      await expect(
        service.createReview('user-1', 'product-1', dto),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(orderItemsRepository.exists).not.toHaveBeenCalled();
    });

    it('throws ConflictException when the customer has no COMPLETED order containing the product', async () => {
      orderItemsRepository.exists.mockResolvedValue(false);

      await expect(
        service.createReview('user-1', 'product-1', dto),
      ).rejects.toThrow(
        new ConflictException('errors.reviewRequiresCompletedPurchase'),
      );
      expect(orderItemsRepository.exists).toHaveBeenCalledWith({
        where: {
          productId: 'product-1',
          order: { userId: 'user-1', status: OrderStatus.COMPLETED },
        },
      });
      expect(reviewsRepository.insert).not.toHaveBeenCalled();
    });

    it('inserts via create()+insert() with userId/productId from the caller, then returns the reloaded review', async () => {
      builder.getOne.mockResolvedValue(sampleReview());

      const result = await service.createReview('user-1', 'product-1', dto);

      expect(reviewsRepository.create).toHaveBeenCalledWith({
        userId: 'user-1',
        productId: 'product-1',
        rating: 5,
        comment: 'Rất tốt',
      });
      expect(reviewsRepository.insert).toHaveBeenCalledTimes(1);
      expect(builder.where).toHaveBeenCalledWith('review.id = :reviewId', {
        reviewId: 'review-1',
      });
      expect(result.review.author.username).toBe('customer_a');
    });

    it('turns a unique violation (lost race or repeat review) into ConflictException', async () => {
      reviewsRepository.insert.mockRejectedValue(buildUniqueViolation());

      await expect(
        service.createReview('user-1', 'product-1', dto),
      ).rejects.toThrow(new ConflictException('errors.reviewAlreadyExists'));
    });

    it('rethrows errors that are not unique violations', async () => {
      const failure = new Error('connection lost');
      reviewsRepository.insert.mockRejectedValue(failure);

      await expect(
        service.createReview('user-1', 'product-1', dto),
      ).rejects.toBe(failure);
    });

    it('throws NotFoundException when the review vanishes before it can be reloaded', async () => {
      builder.getOne.mockResolvedValue(null);

      await expect(
        service.createReview('user-1', 'product-1', dto),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('updateOwnReview', () => {
    it('throws BadRequestException when neither rating nor comment is provided', async () => {
      await expect(
        service.updateOwnReview('user-1', 'review-1', {}),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(reviewsRepository.update).not.toHaveBeenCalled();
    });

    it('scopes the UPDATE by id and userId and writes only the provided fields', async () => {
      reviewsRepository.update.mockResolvedValue({ affected: 1 });
      builder.getOne.mockResolvedValue(sampleReview({ rating: 3 }));

      const result = await service.updateOwnReview('user-1', 'review-1', {
        rating: 3,
      });

      expect(reviewsRepository.update).toHaveBeenCalledWith(
        { id: 'review-1', userId: 'user-1' },
        { rating: 3 },
      );
      expect(result.review.rating).toBe(3);
    });

    it('writes both fields when both are provided', async () => {
      reviewsRepository.update.mockResolvedValue({ affected: 1 });
      builder.getOne.mockResolvedValue(sampleReview());

      await service.updateOwnReview('user-1', 'review-1', {
        rating: 2,
        comment: 'Cập nhật',
      });

      expect(reviewsRepository.update).toHaveBeenCalledWith(
        { id: 'review-1', userId: 'user-1' },
        { rating: 2, comment: 'Cập nhật' },
      );
    });

    it('throws NotFoundException when no row matches id+userId (missing or owned by someone else)', async () => {
      reviewsRepository.update.mockResolvedValue({ affected: 0 });

      await expect(
        service.updateOwnReview('user-2', 'review-1', { rating: 1 }),
      ).rejects.toThrow(new NotFoundException('errors.reviewNotFound'));
      expect(reviewsRepository.createQueryBuilder).not.toHaveBeenCalled();
    });
  });

  describe('deleteOwnReview', () => {
    it('scopes the DELETE by id and userId', async () => {
      reviewsRepository.delete.mockResolvedValue({ affected: 1 });

      await expect(
        service.deleteOwnReview('user-1', 'review-1'),
      ).resolves.toBeUndefined();
      expect(reviewsRepository.delete).toHaveBeenCalledWith({
        id: 'review-1',
        userId: 'user-1',
      });
    });

    it('throws NotFoundException when no row matches id+userId', async () => {
      reviewsRepository.delete.mockResolvedValue({ affected: 0 });

      await expect(
        service.deleteOwnReview('user-2', 'review-1'),
      ).rejects.toThrow(new NotFoundException('errors.reviewNotFound'));
    });
  });
});
