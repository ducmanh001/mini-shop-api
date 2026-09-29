import { ApiProperty } from '@nestjs/swagger';
import { Review } from '../entities/review.entity';
import { ReviewRatingAggregate } from '../interfaces/review-rating-aggregate.interface';

class ReviewAuthorFields {
  @ApiProperty()
  id: string;

  @ApiProperty()
  username: string;
}

/** Không có email của author (database.md — "reviews"): chỉ `id` + `username`. */
class ReviewFields {
  @ApiProperty()
  id: string;

  @ApiProperty()
  productId: string;

  @ApiProperty()
  rating: number;

  @ApiProperty()
  comment: string;

  @ApiProperty({ type: ReviewAuthorFields })
  author: ReviewAuthorFields;

  @ApiProperty()
  createdAt: Date;

  @ApiProperty()
  updatedAt: Date;

  /** `review.user` phải được nạp (partial `id` + `username`) — luôn đi qua `baseReviewQuery()` của service. */
  static fromEntity(review: Review): ReviewFields {
    const fields = new ReviewFields();
    fields.id = review.id;
    fields.productId = review.productId;
    fields.rating = review.rating;
    fields.comment = review.comment;
    fields.author = { id: review.user.id, username: review.user.username };
    fields.createdAt = review.createdAt;
    fields.updatedAt = review.updatedAt;
    return fields;
  }
}

/** `ReviewResponse` — dùng cho create (REVIEW-02) và patch (REVIEW-03). */
export class ReviewResponseDto {
  @ApiProperty({ type: ReviewFields })
  review: ReviewFields;

  static fromEntity(review: Review): ReviewResponseDto {
    const dto = new ReviewResponseDto();
    dto.review = ReviewFields.fromEntity(review);
    return dto;
  }
}

/** `ReviewsResponse` — REVIEW-01; count/average tính trên toàn bộ review của product, không phải trang này. */
export class ReviewsResponseDto {
  @ApiProperty({ type: [ReviewFields] })
  reviews: ReviewFields[];

  @ApiProperty()
  reviewsCount: number;

  @ApiProperty({
    type: String,
    nullable: true,
    example: '4.5',
    description: 'One decimal place; null when the product has no reviews',
  })
  averageRating: string | null;

  static fromEntities(
    reviews: Review[],
    aggregate: ReviewRatingAggregate,
  ): ReviewsResponseDto {
    const dto = new ReviewsResponseDto();
    dto.reviews = reviews.map((review) => ReviewFields.fromEntity(review));
    dto.reviewsCount = aggregate.reviewsCount;
    dto.averageRating = aggregate.averageRating;
    return dto;
  }
}
