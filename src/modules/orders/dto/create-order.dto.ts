import { ApiProperty } from '@nestjs/swagger';
import {
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';
import { i18nValidationMessage } from 'nestjs-i18n';
import { IsNonBlankString } from '../../../common/decorators/is-non-blank-string.decorator';
import {
  MAX_ADDRESS_LENGTH,
  MAX_CUSTOMER_NOTE_LENGTH,
  MAX_PHONE_LENGTH,
  MAX_RECIPIENT_NAME_LENGTH,
  MIN_PHONE_LENGTH,
  PHONE_FORMAT_PATTERN,
} from '../constants/orders.constants';

/**
 * `POST /orders` (ORDER-01) — không nhận cart items/giá/tổng/userId/status từ client, giỏ hàng là
 * nguồn product/quantity duy nhất (api-contract.md dòng 48, database.md mục 6).
 */
export class CreateOrderDto {
  @ApiProperty({ maxLength: MAX_RECIPIENT_NAME_LENGTH })
  @IsNonBlankString(MAX_RECIPIENT_NAME_LENGTH, {
    minLength: 'validation.MIN_LENGTH_RECIPIENT_NAME',
    maxLength: 'validation.MAX_LENGTH_RECIPIENT_NAME',
  })
  recipientName: string;

  @ApiProperty({ minLength: MIN_PHONE_LENGTH, maxLength: MAX_PHONE_LENGTH })
  @IsString({ message: i18nValidationMessage('validation.IS_STRING') })
  @Matches(PHONE_FORMAT_PATTERN, {
    message: i18nValidationMessage('validation.INVALID_PHONE_FORMAT'),
  })
  @MinLength(MIN_PHONE_LENGTH, {
    message: i18nValidationMessage('validation.MIN_LENGTH_PHONE'),
  })
  @MaxLength(MAX_PHONE_LENGTH, {
    message: i18nValidationMessage('validation.MAX_LENGTH_PHONE'),
  })
  phone: string;

  @ApiProperty({ maxLength: MAX_ADDRESS_LENGTH })
  @IsNonBlankString(MAX_ADDRESS_LENGTH, {
    minLength: 'validation.MIN_LENGTH_ADDRESS',
    maxLength: 'validation.MAX_LENGTH_ADDRESS',
  })
  address: string;

  /**
   * Tuỳ chọn, và "rỗng"/toàn khoảng trắng là hợp lệ (coi như không có note, api-contract.md dòng
   * 438) — khác mọi field free-text bắt buộc khác nên KHÔNG dùng `IsNonBlankString` (mục 21
   * CODING_STANDARD.md chặn blank, ở đây blank là giá trị hợp lệ, service tự chuẩn hoá thành null).
   */
  @ApiProperty({ required: false, maxLength: MAX_CUSTOMER_NOTE_LENGTH })
  @IsOptional()
  @IsString({ message: i18nValidationMessage('validation.IS_STRING') })
  @MaxLength(MAX_CUSTOMER_NOTE_LENGTH, {
    message: i18nValidationMessage('validation.MAX_LENGTH_CUSTOMER_NOTE'),
  })
  customerNote?: string;
}
