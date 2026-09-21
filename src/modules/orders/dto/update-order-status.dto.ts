import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn } from 'class-validator';
import { i18nValidationMessage } from 'nestjs-i18n';
import { RejectionReasonMatchesStatus } from '../decorators/rejection-reason-matches-status.decorator';
import {
  ADMIN_ORDER_TRANSITION_TARGETS,
  MAX_ORDER_REJECTION_REASON_LENGTH,
} from '../constants/orders.constants';
import { OrderStatus } from '../enums/order-status.enum';

/**
 * `PATCH /admin/orders/:id/status` (ORDER-07) — `status` chỉ nhận 3 target admin được phép gửi
 * (api-contract.md dòng 49); PENDING/CANCELLED không nằm trong tập này vì không phải target admin
 * tự chọn được (CANCELLED là hành động của customer, PENDING là trạng thái khởi tạo).
 */
export class UpdateOrderStatusDto {
  @ApiProperty({ enum: ADMIN_ORDER_TRANSITION_TARGETS })
  @IsIn(ADMIN_ORDER_TRANSITION_TARGETS, {
    message: i18nValidationMessage('validation.IS_ENUM'),
  })
  status: OrderStatus;

  /**
   * Không `@IsOptional()`: `RejectionReasonMatchesStatus` phải tự chạy trên giá trị `undefined` để
   * bắt buộc field này khi REJECTED — `@IsOptional()` sẽ khiến class-validator bỏ qua toàn bộ
   * validator khi giá trị là `undefined`, vô hiệu hoá đúng nhánh cần bắt buộc.
   */
  @ApiPropertyOptional({ maxLength: MAX_ORDER_REJECTION_REASON_LENGTH })
  @RejectionReasonMatchesStatus({
    message: i18nValidationMessage('validation.INVALID_ORDER_REJECTION_REASON'),
  })
  reason?: string;
}
