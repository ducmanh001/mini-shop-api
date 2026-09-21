import { ApiProperty } from '@nestjs/swagger';
import { ProductSuggestionStatus } from '../enums/product-suggestion-status.enum';
import { ProductSuggestionDetailSource } from '../interfaces/product-suggestion-detail-source.interface';

class SuggestionCustomerFields {
  @ApiProperty()
  id: string;

  @ApiProperty()
  username: string;
}

class ProductSuggestionDetailFields {
  @ApiProperty()
  id: string;

  @ApiProperty({ type: SuggestionCustomerFields })
  customer: SuggestionCustomerFields;

  @ApiProperty()
  name: string;

  @ApiProperty({ nullable: true })
  description: string | null;

  @ApiProperty({ nullable: true })
  categoryName: string | null;

  @ApiProperty({ enum: ProductSuggestionStatus })
  status: ProductSuggestionStatus;

  @ApiProperty({ nullable: true })
  reviewedBy: string | null;

  @ApiProperty({ nullable: true })
  reviewReason: string | null;

  @ApiProperty({ nullable: true })
  reviewedAt: Date | null;

  @ApiProperty()
  createdAt: Date;

  @ApiProperty()
  updatedAt: Date;
}

/** `ProductSuggestionDetailResponse` (SUGGEST-04, admin only) — chỉ customer id/username, không email/password/token. */
export class ProductSuggestionDetailResponseDto {
  @ApiProperty({ type: ProductSuggestionDetailFields })
  suggestion: ProductSuggestionDetailFields;

  static fromEntity(
    source: ProductSuggestionDetailSource,
  ): ProductSuggestionDetailResponseDto {
    const dto = new ProductSuggestionDetailResponseDto();
    dto.suggestion = {
      id: source.id,
      customer: { id: source.customer.id, username: source.customer.username },
      name: source.name,
      description: source.description,
      categoryName: source.categoryName,
      status: source.status,
      reviewedBy: source.reviewedBy,
      reviewReason: source.reviewReason,
      reviewedAt: source.reviewedAt,
      createdAt: source.createdAt,
      updatedAt: source.updatedAt,
    };
    return dto;
  }
}
