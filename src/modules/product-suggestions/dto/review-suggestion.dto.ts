import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn } from 'class-validator';
import { i18nValidationMessage } from 'nestjs-i18n';
import {
  ADMIN_SUGGESTION_REVIEW_TARGETS,
  MAX_SUGGESTION_REVIEW_REASON_LENGTH,
} from '../constants/product-suggestions.constants';
import { ReviewReasonMatchesStatus } from '../decorators/review-reason-matches-status.decorator';
import { ProductSuggestionStatus } from '../enums/product-suggestion-status.enum';

/** `ReviewSuggestionRequest` — api-contract.md dòng 503. Chỉ PENDING mới được review (service kiểm tra). */
export class ReviewSuggestionDto {
  @ApiProperty({ enum: ADMIN_SUGGESTION_REVIEW_TARGETS })
  @IsIn(ADMIN_SUGGESTION_REVIEW_TARGETS, {
    message: i18nValidationMessage('validation.IS_ENUM'),
  })
  status: ProductSuggestionStatus;

  @ApiPropertyOptional({ maxLength: MAX_SUGGESTION_REVIEW_REASON_LENGTH })
  @ReviewReasonMatchesStatus({
    message: i18nValidationMessage(
      'validation.INVALID_SUGGESTION_REVIEW_REASON',
    ),
  })
  reason?: string;
}
