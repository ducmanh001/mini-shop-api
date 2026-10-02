import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsInt, Max, Min } from 'class-validator';
import { i18nValidationMessage } from 'nestjs-i18n';
import { IsNonBlankString } from '../../../common/decorators/is-non-blank-string.decorator';
import {
  MAX_REVIEW_COMMENT_LENGTH,
  MAX_REVIEW_RATING,
  MIN_REVIEW_RATING,
} from '../constants/reviews.constants';

/** `ReviewCreateRequest` — api-contract.md dòng 51. userId/productId lấy từ token và route, không nhận từ body. */
export class CreateReviewDto {
  @ApiProperty({ minimum: MIN_REVIEW_RATING, maximum: MAX_REVIEW_RATING })
  @IsInt({ message: i18nValidationMessage('validation.IS_INT') })
  @Min(MIN_REVIEW_RATING, {
    message: i18nValidationMessage('validation.MIN_RATING'),
  })
  @Max(MAX_REVIEW_RATING, {
    message: i18nValidationMessage('validation.MAX_RATING'),
  })
  rating: number;

  @ApiProperty({ maxLength: MAX_REVIEW_COMMENT_LENGTH })
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsNonBlankString(MAX_REVIEW_COMMENT_LENGTH, {
    minLength: 'validation.MIN_LENGTH_COMMENT',
    maxLength: 'validation.MAX_LENGTH_COMMENT',
  })
  comment: string;
}
