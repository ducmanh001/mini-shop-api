import {
  registerDecorator,
  ValidationArguments,
  ValidationOptions,
  ValidatorConstraint,
  ValidatorConstraintInterface,
} from 'class-validator';
import { MAX_ORDER_REJECTION_REASON_LENGTH } from '../constants/orders.constants';
import { OrderStatus } from '../enums/order-status.enum';

/**
 * `reason` bắt buộc, non-blank, tối đa 500 ký tự khi `status===REJECTED`; phải vắng mặt (không gửi)
 * với CONFIRMED/COMPLETED (api-contract.md dòng 49). Không dùng 2 `@ValidateIf` đối lập trên cùng 1
 * property vì repo chưa có tiền lệ nào stack `@ValidateIf` theo cách đó (mỗi chỗ dùng hiện tại chỉ
 * canh đúng 1 điều kiện) — 1 constraint duy nhất tự xét cả 2 nhánh là cách rõ ràng, không mơ hồ.
 */
@ValidatorConstraint({ name: 'rejectionReasonMatchesStatus', async: false })
class RejectionReasonMatchesStatusConstraint implements ValidatorConstraintInterface {
  validate(value: unknown, args: ValidationArguments): boolean {
    const status = (args.object as { status?: OrderStatus }).status;
    if (status === OrderStatus.REJECTED) {
      return (
        typeof value === 'string' &&
        /\S/.test(value) &&
        value.length <= MAX_ORDER_REJECTION_REASON_LENGTH
      );
    }
    return value === undefined;
  }
}

export function RejectionReasonMatchesStatus(
  validationOptions?: ValidationOptions,
): PropertyDecorator {
  return (object: object, propertyName: string | symbol): void => {
    registerDecorator({
      target: object.constructor,
      propertyName: propertyName as string,
      options: validationOptions,
      validator: RejectionReasonMatchesStatusConstraint,
    });
  };
}
