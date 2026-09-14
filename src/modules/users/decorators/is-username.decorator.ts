import { applyDecorators } from '@nestjs/common';
import { IsString, Matches, MaxLength, MinLength } from 'class-validator';
import { i18nValidationMessage } from 'nestjs-i18n';
import {
  USERNAME_MAX_LENGTH,
  USERNAME_MIN_LENGTH,
  USERNAME_PATTERN,
} from '../constants/users.constants';

/** Áp dụng sau `@Transform(normalizeIdentifier)` — input đã lowercase/trim khi decorator này chạy. */
export function IsUsername(): PropertyDecorator {
  return applyDecorators(
    IsString({ message: i18nValidationMessage('validation.IS_STRING') }),
    MinLength(USERNAME_MIN_LENGTH, {
      message: i18nValidationMessage('validation.MIN_LENGTH_USERNAME'),
    }),
    MaxLength(USERNAME_MAX_LENGTH, {
      message: i18nValidationMessage('validation.MAX_LENGTH_USERNAME'),
    }),
    Matches(USERNAME_PATTERN, {
      message: i18nValidationMessage('validation.INVALID_USERNAME_FORMAT'),
    }),
  );
}
