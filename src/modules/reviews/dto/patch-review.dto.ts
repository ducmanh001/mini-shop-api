import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsInt, Max, Min, ValidateIf } from 'class-validator';
import { i18nValidationMessage } from 'nestjs-i18n';
import { IsNonBlankString } from '../../../common/decorators/is-non-blank-string.decorator';
import {
  MAX_REVIEW_COMMENT_LENGTH,
  MAX_REVIEW_RATING,
  MIN_REVIEW_RATING,
} from '../constants/reviews.constants';

/**
 * `ReviewPatchRequest` — api-contract.md dòng 52. Mọi field optional (`null` không hợp lệ), guard
 * "ít nhất 1 field" nằm ở service cùng cách với `PatchProductDto`.
 */
export class PatchReviewDto {
  @ApiPropertyOptional({
    minimum: MIN_REVIEW_RATING,
    maximum: MAX_REVIEW_RATING,
  })
  @ValidateIf((dto: PatchReviewDto) => dto.rating !== undefined)
  @IsInt({ message: i18nValidationMessage('validation.IS_INT') })
  @Min(MIN_REVIEW_RATING, {
    message: i18nValidationMessage('validation.MIN_RATING'),
  })
  @Max(MAX_REVIEW_RATING, {
    message: i18nValidationMessage('validation.MAX_RATING'),
  })
  rating?: number;

  @ApiPropertyOptional({ maxLength: MAX_REVIEW_COMMENT_LENGTH })
  @ValidateIf((dto: PatchReviewDto) => dto.comment !== undefined)
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsNonBlankString(MAX_REVIEW_COMMENT_LENGTH, {
    minLength: 'validation.MIN_LENGTH_COMMENT',
    maxLength: 'validation.MAX_LENGTH_COMMENT',
  })
  comment?: string;
}
