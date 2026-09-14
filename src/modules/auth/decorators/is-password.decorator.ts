import { applyDecorators } from '@nestjs/common';
import {
  IsString,
  MinLength,
  Validate,
  ValidatorConstraint,
  ValidatorConstraintInterface,
} from 'class-validator';
import { i18nValidationMessage } from 'nestjs-i18n';
import {
  MAX_PASSWORD_BYTES,
  MIN_PASSWORD_LENGTH,
} from '../constants/auth.constants';

/** `@MaxLength` đếm UTF-16 code unit, không phải byte — password giới hạn theo byte (bcrypt). */
@ValidatorConstraint({ name: 'maxPasswordBytes', async: false })
class MaxPasswordBytesConstraint implements ValidatorConstraintInterface {
  validate(value: unknown): boolean {
    return (
      typeof value === 'string' &&
      Buffer.byteLength(value, 'utf8') <= MAX_PASSWORD_BYTES
    );
  }

  defaultMessage(): string {
    return `Password must not exceed ${MAX_PASSWORD_BYTES} bytes`;
  }
}

export function IsPassword(): PropertyDecorator {
  return applyDecorators(
    IsString({ message: i18nValidationMessage('validation.IS_STRING') }),
    MinLength(MIN_PASSWORD_LENGTH, {
      message: i18nValidationMessage('validation.MIN_LENGTH_PASSWORD'),
    }),
    Validate(MaxPasswordBytesConstraint, {
      message: i18nValidationMessage('validation.MAX_LENGTH_PASSWORD'),
    }),
  );
}
