import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsEmail, MaxLength } from 'class-validator';
import { i18nValidationMessage } from 'nestjs-i18n';
import { normalizeIdentifier } from '../../../common/utils/normalize-identifier.util';
import { MAX_EMAIL_LENGTH } from '../../users/constants/users.constants';
import { IsUsername } from '../../users/decorators/is-username.decorator';
import { IsPassword } from '../decorators/is-password.decorator';

export class RegisterDto {
  @ApiProperty()
  @Transform(({ value }: { value: unknown }) => normalizeIdentifier(value))
  @IsEmail({}, { message: i18nValidationMessage('validation.IS_EMAIL') })
  @MaxLength(MAX_EMAIL_LENGTH, {
    message: i18nValidationMessage('validation.MAX_LENGTH_EMAIL'),
  })
  email: string;

  @ApiProperty()
  @Transform(({ value }: { value: unknown }) => normalizeIdentifier(value))
  @IsUsername()
  username: string;

  @ApiProperty()
  @IsPassword()
  password: string;
}
