import {
  registerDecorator,
  ValidationArguments,
  ValidationOptions,
  ValidatorConstraint,
  ValidatorConstraintInterface,
} from 'class-validator';

@ValidatorConstraint({ name: 'isEqualToNewPassword', async: false })
class IsEqualToNewPasswordConstraint implements ValidatorConstraintInterface {
  validate(value: unknown, args: ValidationArguments): boolean {
    return value === (args.object as { newPassword?: string }).newPassword;
  }
}

/** `confirmPassword` phải khớp `newPassword` — dùng cho `ResetPasswordRequest`/`ChangePasswordRequest`. */
export function IsEqualToNewPassword(
  validationOptions?: ValidationOptions,
): PropertyDecorator {
  return (object: object, propertyName: string | symbol): void => {
    registerDecorator({
      target: object.constructor,
      propertyName: propertyName as string,
      options: validationOptions,
      validator: IsEqualToNewPasswordConstraint,
    });
  };
}
