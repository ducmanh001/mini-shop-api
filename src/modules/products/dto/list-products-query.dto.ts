import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsIn, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';
import { i18nValidationMessage } from 'nestjs-i18n';
import { IsVndAmountString } from '../../../common/decorators/is-vnd-amount-string.decorator';
import { PaginationQueryDto } from '../../../common/dto/pagination-query.dto';
import {
  MAX_PRODUCT_PRICE_VND,
  MIN_PRODUCT_PRICE_FILTER_VND,
  PRODUCT_SEARCH_KEYWORD_MAX_LENGTH,
} from '../constants/products.constants';

/**
 * `GET /products` — public (api-contract.md dòng 56). `featured` chỉ nhận chuỗi literal
 * `"true"`/`"false"`, không ép kiểu JS (`Boolean("false") === true`).
 */
export class ListProductsQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ description: 'Search keyword for name/description' })
  @IsOptional()
  @Transform(({ value }: { value: unknown }) => {
    if (typeof value !== 'string') {
      return value;
    }
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : undefined;
  })
  @IsString({ message: i18nValidationMessage('validation.IS_STRING') })
  @MaxLength(PRODUCT_SEARCH_KEYWORD_MAX_LENGTH, {
    message: i18nValidationMessage('validation.MAX_LENGTH_SEARCH_KEYWORD'),
  })
  q?: string;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID('4', { message: i18nValidationMessage('validation.IS_UUID') })
  categoryId?: string;

  @ApiPropertyOptional({ example: '50000' })
  @IsOptional()
  @IsVndAmountString(MIN_PRODUCT_PRICE_FILTER_VND, MAX_PRODUCT_PRICE_VND, {
    message: i18nValidationMessage('validation.INVALID_PRICE_VND'),
  })
  minPrice?: string;

  @ApiPropertyOptional({ example: '500000' })
  @IsOptional()
  @IsVndAmountString(MIN_PRODUCT_PRICE_FILTER_VND, MAX_PRODUCT_PRICE_VND, {
    message: i18nValidationMessage('validation.INVALID_PRICE_VND'),
  })
  maxPrice?: string;

  @ApiPropertyOptional({ enum: ['true', 'false'] })
  @IsOptional()
  @IsIn(['true', 'false'], {
    message: i18nValidationMessage('validation.INVALID_BOOLEAN_STRING'),
  })
  featured?: 'true' | 'false';
}
