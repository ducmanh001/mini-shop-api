import { applyDecorators } from '@nestjs/common';
import { Transform } from 'class-transformer';
import { IsEmail, MaxLength } from 'class-validator';
import { i18nValidationMessage } from 'nestjs-i18n';
import { normalizeIdentifier } from '../../../common/utils/normalize-identifier.util';
import { MAX_EMAIL_LENGTH } from '../constants/users.constants';

/** Trim + lowercase trước validate — dùng chung cho mọi DTO nhận `users.email` (register, login, forgot-password). */
export function IsNormalizedEmail(): PropertyDecorator {
  return applyDecorators(
    Transform(({ value }: { value: unknown }) => normalizeIdentifier(value)),
    IsEmail({}, { message: i18nValidationMessage('validation.IS_EMAIL') }),
    MaxLength(MAX_EMAIL_LENGTH, {
      message: i18nValidationMessage('validation.MAX_LENGTH_EMAIL'),
    }),
  );
}
