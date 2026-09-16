import {
  registerDecorator,
  ValidationArguments,
  ValidationOptions,
  ValidatorConstraint,
  ValidatorConstraintInterface,
} from 'class-validator';

const VND_AMOUNT_PATTERN = /^\d+$/;

@ValidatorConstraint({ name: 'isVndAmountString', async: false })
class IsVndAmountStringConstraint implements ValidatorConstraintInterface {
  validate(value: unknown, args: ValidationArguments): boolean {
    if (typeof value !== 'string' || !VND_AMOUNT_PATTERN.test(value)) {
      return false;
    }
    const [min, max] = args.constraints as [number, number];
    const amount = Number(value);
    return amount >= min && amount <= max;
  }
}

/**
 * Tiền VND là chuỗi số nguyên trong [min, max] (CODING_STANDARD.md mục 26) — validate format + cận
 * ngay ở DTO, trước khi service ép sang `Number` để tính, tránh mất độ chính xác trên input chưa
 * kiểm.
 */
export function IsVndAmountString(
  min: number,
  max: number,
  validationOptions?: ValidationOptions,
): PropertyDecorator {
  return (object: object, propertyName: string | symbol): void => {
    registerDecorator({
      target: object.constructor,
      propertyName: propertyName as string,
      constraints: [min, max],
      options: validationOptions,
      validator: IsVndAmountStringConstraint,
    });
  };
}
