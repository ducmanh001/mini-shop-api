import {
  registerDecorator,
  ValidationArguments,
  ValidationOptions,
  ValidatorConstraint,
  ValidatorConstraintInterface,
} from 'class-validator';
import { MAX_SUGGESTION_REVIEW_REASON_LENGTH } from '../constants/product-suggestions.constants';
import { ProductSuggestionStatus } from '../enums/product-suggestion-status.enum';

/**
 * `reason` bắt buộc, non-blank, tối đa 500 ký tự khi `status===REJECTED`; phải vắng mặt với APPROVED
 * (api-contract.md dòng 505). Không dùng `@IsOptional()` — cùng lý do với
 * `orders/decorators/rejection-reason-matches-status.decorator.ts`: `@IsOptional()` sẽ khiến
 * class-validator bỏ qua toàn bộ validator khi giá trị là `undefined`, vô hiệu hoá đúng nhánh cần
 * bắt buộc khi REJECTED.
 */
@ValidatorConstraint({ name: 'reviewReasonMatchesStatus', async: false })
class ReviewReasonMatchesStatusConstraint implements ValidatorConstraintInterface {
  validate(value: unknown, args: ValidationArguments): boolean {
    const status = (args.object as { status?: ProductSuggestionStatus }).status;
    if (status === ProductSuggestionStatus.REJECTED) {
      return (
        typeof value === 'string' &&
        /\S/.test(value) &&
        value.length <= MAX_SUGGESTION_REVIEW_REASON_LENGTH
      );
    }
    return value === undefined;
  }
}

export function ReviewReasonMatchesStatus(
  validationOptions?: ValidationOptions,
): PropertyDecorator {
  return (object: object, propertyName: string | symbol): void => {
    registerDecorator({
      target: object.constructor,
      propertyName: propertyName as string,
      options: validationOptions,
      validator: ReviewReasonMatchesStatusConstraint,
    });
  };
}
