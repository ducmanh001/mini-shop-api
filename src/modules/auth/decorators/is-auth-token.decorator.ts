import { applyDecorators } from '@nestjs/common';
import { IsString, Length } from 'class-validator';
import { i18nValidationMessage } from 'nestjs-i18n';
import {
  AUTH_TOKEN_MAX_LENGTH,
  AUTH_TOKEN_MIN_LENGTH,
} from '../constants/auth.constants';

/** Opaque token nhận từ email (verify/reset) — server chỉ so khớp SHA-256 hash, không giải mã. */
export function IsAuthToken(): PropertyDecorator {
  return applyDecorators(
    IsString({ message: i18nValidationMessage('validation.IS_STRING') }),
    Length(AUTH_TOKEN_MIN_LENGTH, AUTH_TOKEN_MAX_LENGTH, {
      message: i18nValidationMessage('validation.INVALID_TOKEN_LENGTH'),
    }),
  );
}
