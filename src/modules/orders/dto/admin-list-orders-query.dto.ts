import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional, IsUUID } from 'class-validator';
import { i18nValidationMessage } from 'nestjs-i18n';
import { PaginationQueryDto } from '../../../common/dto/pagination-query.dto';
import { OrderStatus } from '../enums/order-status.enum';

/** `GET /admin/orders` (ORDER-05) — thêm filter `userId` so với bản customer (api-requirements.csv). */
export class AdminListOrdersQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ enum: OrderStatus })
  @IsOptional()
  @IsEnum(OrderStatus, { message: i18nValidationMessage('validation.IS_ENUM') })
  status?: OrderStatus;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID(undefined, { message: i18nValidationMessage('validation.IS_UUID') })
  userId?: string;
}
