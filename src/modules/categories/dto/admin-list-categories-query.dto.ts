import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';
import { i18nValidationMessage } from 'nestjs-i18n';
import { PaginationQueryDto } from '../../../common/dto/pagination-query.dto';
import { CATEGORY_SEARCH_KEYWORD_MAX_LENGTH } from '../constants/categories.constants';

/**
 * `GET /admin/categories` — thêm `q`/`isActive` so với public (api-contract.md mục 58). `isActive`
 * chỉ nhận chuỗi literal `"true"`/`"false"`, không ép kiểu JS (`Boolean("false") === true`).
 */
export class AdminListCategoriesQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ description: 'Search keyword for category name' })
  @IsOptional()
  @Transform(({ value }: { value: unknown }) => {
    if (typeof value !== 'string') {
      return value;
    }
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : undefined;
  })
  @IsString({ message: i18nValidationMessage('validation.IS_STRING') })
  @MaxLength(CATEGORY_SEARCH_KEYWORD_MAX_LENGTH, {
    message: i18nValidationMessage('validation.MAX_LENGTH_SEARCH_KEYWORD'),
  })
  q?: string;

  @ApiPropertyOptional({ enum: ['true', 'false'] })
  @IsOptional()
  @IsIn(['true', 'false'], {
    message: i18nValidationMessage('validation.INVALID_BOOLEAN_STRING'),
  })
  isActive?: 'true' | 'false';
}
