import { ApiProperty } from '@nestjs/swagger';
import { IsString, Length } from 'class-validator';
import { i18nValidationMessage } from 'nestjs-i18n';
import {
  VERIFY_EMAIL_TOKEN_MAX_LENGTH,
  VERIFY_EMAIL_TOKEN_MIN_LENGTH,
} from '../constants/auth.constants';

export class VerifyEmailDto {
  @ApiProperty()
  @IsString({ message: i18nValidationMessage('validation.IS_STRING') })
  @Length(VERIFY_EMAIL_TOKEN_MIN_LENGTH, VERIFY_EMAIL_TOKEN_MAX_LENGTH, {
    message: i18nValidationMessage('validation.INVALID_TOKEN_LENGTH'),
  })
  token: string;
}
