import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional } from 'class-validator';
import { i18nValidationMessage } from 'nestjs-i18n';
import { OrderStatus } from '../enums/order-status.enum';

/** `GET /admin/orders/export` — không phân trang (luôn xuất tới `MAX_ORDER_EXPORT_ROWS` dòng mới nhất). */
export class ExportOrdersQueryDto {
  @ApiPropertyOptional({ enum: OrderStatus })
  @IsOptional()
  @IsEnum(OrderStatus, { message: i18nValidationMessage('validation.IS_ENUM') })
  status?: OrderStatus;
}
