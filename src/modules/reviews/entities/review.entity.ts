import {
  Check,
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  Unique,
  UpdateDateColumn,
} from 'typeorm';
import { UuidBaseEntity } from '../../../common/entities/uuid-base.entity';
import { Product } from '../../products/entities/product.entity';
import { User } from '../../users/entities/user.entity';
import {
  MAX_REVIEW_COMMENT_LENGTH,
  MAX_REVIEW_RATING,
  MIN_REVIEW_RATING,
} from '../constants/reviews.constants';

/**
 * Đánh giá một cấp cho sản phẩm. Trước insert, service dùng EXISTS kiểm user có order COMPLETED
 * chứa product — rule xuyên bảng, không phải CHECK/FK (mục 4 database.md — "reviews").
 */
@Entity({ name: 'reviews' })
@Unique('uq_reviews_user_product', ['userId', 'productId'])
@Index('idx_reviews_product_created_id', ['productId', 'createdAt', 'id'])
@Check(
  'ck_reviews_rating_range',
  `rating BETWEEN ${MIN_REVIEW_RATING} AND ${MAX_REVIEW_RATING}`,
)
export class Review extends UuidBaseEntity {
  @Column({ name: 'user_id', type: 'uuid' })
  userId: string;

  @ManyToOne(() => User, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'user_id' })
  user: User;

  @Column({ name: 'product_id', type: 'uuid' })
  productId: string;

  @ManyToOne(() => Product, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'product_id' })
  product: Product;

  @Column({ type: 'smallint' })
  rating: number;

  @Column({ type: 'varchar', length: MAX_REVIEW_COMMENT_LENGTH })
  comment: string;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
