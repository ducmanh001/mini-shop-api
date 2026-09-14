import {
  registerDecorator,
  ValidationArguments,
  ValidationOptions,
  ValidatorConstraint,
  ValidatorConstraintInterface,
} from 'class-validator';

@ValidatorConstraint({ name: 'isDifferentFromCurrentPassword', async: false })
class IsDifferentFromCurrentPasswordConstraint implements ValidatorConstraintInterface {
  validate(value: unknown, args: ValidationArguments): boolean {
    return (
      value !== (args.object as { currentPassword?: string }).currentPassword
    );
  }
}

/** `newPassword` phải khác `currentPassword` — dùng cho `ChangePasswordRequest`. */
export function IsDifferentFromCurrentPassword(
  validationOptions?: ValidationOptions,
): PropertyDecorator {
  return (object: object, propertyName: string | symbol): void => {
    registerDecorator({
      target: object.constructor,
      propertyName: propertyName as string,
      options: validationOptions,
      validator: IsDifferentFromCurrentPasswordConstraint,
    });
  };
}
