import { ApiProperty } from '@nestjs/swagger';
import { i18nValidationMessage } from 'nestjs-i18n';
import { IsEqualToNewPassword } from '../../users/decorators/is-equal-to-new-password.decorator';
import { IsPassword } from '../../users/decorators/is-password.decorator';
import { IsAuthToken } from '../decorators/is-auth-token.decorator';

export class ResetPasswordDto {
  @ApiProperty()
  @IsAuthToken()
  token: string;

  @ApiProperty()
  @IsPassword()
  newPassword: string;

  @ApiProperty()
  @IsPassword()
  @IsEqualToNewPassword({
    message: i18nValidationMessage('validation.PASSWORDS_DO_NOT_MATCH'),
  })
  confirmPassword: string;
}
