import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsOptional, MaxLength, MinLength } from 'class-validator';
import { i18nValidationMessage } from 'nestjs-i18n';
import { IsNonBlankString } from '../../../common/decorators/is-non-blank-string.decorator';
import {
  MAX_SUGGESTION_CATEGORY_NAME_LENGTH,
  MAX_SUGGESTION_DESCRIPTION_LENGTH,
  MAX_SUGGESTION_NAME_LENGTH,
  MIN_SUGGESTION_NAME_LENGTH,
} from '../constants/product-suggestions.constants';

/** `CreateSuggestionRequest` — api-contract.md dòng 497. Server tự đặt PENDING, không nhận status/reviewer. */
export class CreateSuggestionDto {
  @ApiProperty({
    minLength: MIN_SUGGESTION_NAME_LENGTH,
    maxLength: MAX_SUGGESTION_NAME_LENGTH,
  })
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @MinLength(MIN_SUGGESTION_NAME_LENGTH, {
    message: i18nValidationMessage('validation.MIN_LENGTH_NAME'),
  })
  @MaxLength(MAX_SUGGESTION_NAME_LENGTH, {
    message: i18nValidationMessage('validation.MAX_LENGTH_NAME'),
  })
  name: string;

  @ApiPropertyOptional({ maxLength: MAX_SUGGESTION_DESCRIPTION_LENGTH })
  @IsOptional()
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsNonBlankString(MAX_SUGGESTION_DESCRIPTION_LENGTH, {
    minLength: 'validation.MIN_LENGTH_DESCRIPTION',
    maxLength: 'validation.MAX_LENGTH_DESCRIPTION',
  })
  description?: string;

  @ApiPropertyOptional({ maxLength: MAX_SUGGESTION_CATEGORY_NAME_LENGTH })
  @IsOptional()
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsNonBlankString(MAX_SUGGESTION_CATEGORY_NAME_LENGTH, {
    minLength: 'validation.MIN_LENGTH_NAME',
    maxLength: 'validation.MAX_LENGTH_NAME',
  })
  categoryName?: string;
}
