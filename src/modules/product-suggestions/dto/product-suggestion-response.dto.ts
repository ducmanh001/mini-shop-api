import { ApiProperty } from '@nestjs/swagger';
import { ProductSuggestionStatus } from '../enums/product-suggestion-status.enum';
import { ProductSuggestionFullSource } from '../interfaces/product-suggestion-full-source.interface';
import { ProductSuggestionSummarySource } from '../interfaces/product-suggestion-summary-source.interface';

class ProductSuggestionFields {
  @ApiProperty()
  id: string;

  @ApiProperty()
  customerId: string;

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

  static fromEntity(
    source: ProductSuggestionFullSource,
  ): ProductSuggestionFields {
    const fields = new ProductSuggestionFields();
    fields.id = source.id;
    fields.customerId = source.customerId;
    fields.name = source.name;
    fields.description = source.description;
    fields.categoryName = source.categoryName;
    fields.status = source.status;
    fields.reviewedBy = source.reviewedBy;
    fields.reviewReason = source.reviewReason;
    fields.reviewedAt = source.reviewedAt;
    fields.createdAt = source.createdAt;
    fields.updatedAt = source.updatedAt;
    return fields;
  }
}

/** `ProductSuggestionResponse` — dùng cho create (SUGGEST-01) và review (SUGGEST-05). */
export class ProductSuggestionResponseDto {
  @ApiProperty({ type: ProductSuggestionFields })
  suggestion: ProductSuggestionFields;

  static fromEntity(
    source: ProductSuggestionFullSource,
  ): ProductSuggestionResponseDto {
    const dto = new ProductSuggestionResponseDto();
    dto.suggestion = ProductSuggestionFields.fromEntity(source);
    return dto;
  }
}

class ProductSuggestionSummaryFields {
  @ApiProperty()
  id: string;

  @ApiProperty()
  customerId: string;

  @ApiProperty()
  name: string;

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

  static fromEntity(
    source: ProductSuggestionSummarySource,
  ): ProductSuggestionSummaryFields {
    const fields = new ProductSuggestionSummaryFields();
    fields.id = source.id;
    fields.customerId = source.customerId;
    fields.name = source.name;
    fields.categoryName = source.categoryName;
    fields.status = source.status;
    fields.reviewedBy = source.reviewedBy;
    fields.reviewReason = source.reviewReason;
    fields.reviewedAt = source.reviewedAt;
    fields.createdAt = source.createdAt;
    fields.updatedAt = source.updatedAt;
    return fields;
  }
}

/** `ProductSuggestionsResponse` — dùng cho customer list (SUGGEST-02) và admin list (SUGGEST-03). */
export class ProductSuggestionsResponseDto {
  @ApiProperty({ type: [ProductSuggestionSummaryFields] })
  suggestions: ProductSuggestionSummaryFields[];

  @ApiProperty()
  suggestionsCount: number;

  static fromEntities(
    suggestions: ProductSuggestionSummarySource[],
    suggestionsCount: number,
  ): ProductSuggestionsResponseDto {
    const dto = new ProductSuggestionsResponseDto();
    dto.suggestions = suggestions.map((suggestion) =>
      ProductSuggestionSummaryFields.fromEntity(suggestion),
    );
    dto.suggestionsCount = suggestionsCount;
    return dto;
  }
}
