import { ApiProperty } from '@nestjs/swagger';
import { IsInt, Max, Min } from 'class-validator';
import { i18nValidationMessage } from 'nestjs-i18n';
import {
  MAX_LINE_ITEM_QUANTITY,
  MIN_LINE_ITEM_QUANTITY,
} from '../constants/cart.constants';

/**
 * `PUT /cart/items/:productId` (CART-02) — `quantity` là số lượng cuối cùng (absolute set),
 * không phải số tăng thêm; muốn bỏ dòng dùng DELETE, không gửi 0 (api-contract.md dòng 47).
 */
export class SetCartItemDto {
  @ApiProperty({
    minimum: MIN_LINE_ITEM_QUANTITY,
    maximum: MAX_LINE_ITEM_QUANTITY,
  })
  @IsInt({ message: i18nValidationMessage('validation.IS_INT') })
  @Min(MIN_LINE_ITEM_QUANTITY, {
    message: i18nValidationMessage('validation.MIN_QUANTITY'),
  })
  @Max(MAX_LINE_ITEM_QUANTITY, {
    message: i18nValidationMessage('validation.MAX_QUANTITY'),
  })
  quantity: number;
}
