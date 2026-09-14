import { ApiProperty } from '@nestjs/swagger';
import { i18nValidationMessage } from 'nestjs-i18n';
import { IsDifferentFromCurrentPassword } from '../decorators/is-different-from-current-password.decorator';
import { IsEqualToNewPassword } from '../decorators/is-equal-to-new-password.decorator';
import { IsPassword } from '../decorators/is-password.decorator';

export class ChangePasswordDto {
  @ApiProperty()
  @IsPassword()
  currentPassword: string;

  @ApiProperty()
  @IsPassword()
  @IsDifferentFromCurrentPassword({
    message: i18nValidationMessage('validation.NEW_PASSWORD_SAME_AS_CURRENT'),
  })
  newPassword: string;

  @ApiProperty()
  @IsPassword()
  @IsEqualToNewPassword({
    message: i18nValidationMessage('validation.PASSWORDS_DO_NOT_MATCH'),
  })
  confirmPassword: string;
}
