import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional } from 'class-validator';
import { i18nValidationMessage } from 'nestjs-i18n';
import { PaginationQueryDto } from '../../../common/dto/pagination-query.dto';
import { ProductSuggestionStatus } from '../enums/product-suggestion-status.enum';

/** `GET /product-suggestions` (SUGGEST-02) — chỉ suggestion của current customer, status là filter tùy chọn. */
export class ListSuggestionsQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ enum: ProductSuggestionStatus })
  @IsOptional()
  @IsEnum(ProductSuggestionStatus, {
    message: i18nValidationMessage('validation.IS_ENUM'),
  })
  status?: ProductSuggestionStatus;
}
