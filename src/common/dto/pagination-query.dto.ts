import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, Max, Min } from 'class-validator';
import { i18nValidationMessage } from 'nestjs-i18n';
import {
  DEFAULT_PAGE_LIMIT,
  DEFAULT_PAGE_OFFSET,
  MAX_PAGE_LIMIT,
  MIN_PAGE_LIMIT,
  MIN_PAGE_OFFSET,
} from '../constants/pagination.constants';

/** Base cho mọi query list — module cụ thể `extends` thêm filter riêng (vd `ListUsersQueryDto`). */
export class PaginationQueryDto {
  @ApiPropertyOptional({ default: DEFAULT_PAGE_LIMIT })
  @Type(() => Number)
  @IsInt({ message: i18nValidationMessage('validation.IS_INT') })
  @Min(MIN_PAGE_LIMIT, {
    message: i18nValidationMessage('validation.MIN_LIMIT'),
  })
  @Max(MAX_PAGE_LIMIT, {
    message: i18nValidationMessage('validation.MAX_LIMIT'),
  })
  limit: number = DEFAULT_PAGE_LIMIT;

  @ApiPropertyOptional({ default: DEFAULT_PAGE_OFFSET })
  @Type(() => Number)
  @IsInt({ message: i18nValidationMessage('validation.IS_INT') })
  @Min(MIN_PAGE_OFFSET, {
    message: i18nValidationMessage('validation.MIN_OFFSET'),
  })
  offset: number = DEFAULT_PAGE_OFFSET;
}
