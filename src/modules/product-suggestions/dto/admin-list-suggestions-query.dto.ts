import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsEnum,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';
import { i18nValidationMessage } from 'nestjs-i18n';
import { PaginationQueryDto } from '../../../common/dto/pagination-query.dto';
import { SUGGESTION_SEARCH_KEYWORD_MAX_LENGTH } from '../constants/product-suggestions.constants';
import { ProductSuggestionStatus } from '../enums/product-suggestion-status.enum';

/** `GET /admin/product-suggestions` (SUGGEST-03) — thêm filter `userId`/`keyword` so với bản customer. */
export class AdminListSuggestionsQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ enum: ProductSuggestionStatus })
  @IsOptional()
  @IsEnum(ProductSuggestionStatus, {
    message: i18nValidationMessage('validation.IS_ENUM'),
  })
  status?: ProductSuggestionStatus;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID(undefined, { message: i18nValidationMessage('validation.IS_UUID') })
  userId?: string;

  @ApiPropertyOptional({ description: 'Search keyword for name' })
  @IsOptional()
  @Transform(({ value }: { value: unknown }) => {
    if (typeof value !== 'string') {
      return value;
    }
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : undefined;
  })
  @IsString({ message: i18nValidationMessage('validation.IS_STRING') })
  @MaxLength(SUGGESTION_SEARCH_KEYWORD_MAX_LENGTH, {
    message: i18nValidationMessage('validation.MAX_LENGTH_SEARCH_KEYWORD'),
  })
  keyword?: string;
}
