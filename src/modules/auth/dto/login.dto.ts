import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsEmail } from 'class-validator';
import { i18nValidationMessage } from 'nestjs-i18n';
import { normalizeIdentifier } from '../../../common/utils/normalize-identifier.util';
import { IsPassword } from '../decorators/is-password.decorator';

export class LoginDto {
  @ApiProperty()
  @Transform(({ value }: { value: unknown }) => normalizeIdentifier(value))
  @IsEmail({}, { message: i18nValidationMessage('validation.IS_EMAIL') })
  email: string;

  @ApiProperty()
  @IsPassword()
  password: string;
}
