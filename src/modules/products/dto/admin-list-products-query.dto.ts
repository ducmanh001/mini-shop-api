import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional } from 'class-validator';
import { i18nValidationMessage } from 'nestjs-i18n';
import { ListProductsQueryDto } from './list-products-query.dto';

/** `GET /admin/products` — filter public cộng `isActive`, thấy cả product/category inactive. */
export class AdminListProductsQueryDto extends ListProductsQueryDto {
  @ApiPropertyOptional({ enum: ['true', 'false'] })
  @IsOptional()
  @IsIn(['true', 'false'], {
    message: i18nValidationMessage('validation.INVALID_BOOLEAN_STRING'),
  })
  isActive?: 'true' | 'false';
}
