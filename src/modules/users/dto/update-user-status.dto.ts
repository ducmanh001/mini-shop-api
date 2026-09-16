import { ApiProperty } from '@nestjs/swagger';
import { IsIn } from 'class-validator';
import { i18nValidationMessage } from 'nestjs-i18n';
import { MUTABLE_USER_STATUSES } from '../constants/users.constants';

/** `PATCH /admin/users/:id/status` — chỉ ACTIVE/INACTIVE, không nhận PENDING hay đổi role. */
export class UpdateUserStatusDto {
  @ApiProperty({ enum: MUTABLE_USER_STATUSES })
  @IsIn(MUTABLE_USER_STATUSES, {
    message: i18nValidationMessage('validation.IS_ENUM'),
  })
  status: (typeof MUTABLE_USER_STATUSES)[number];
}
