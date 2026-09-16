import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsOptional,
  IsString,
  MaxLength,
  Matches,
} from 'class-validator';
import { i18nValidationMessage } from 'nestjs-i18n';
import { IsNonBlankString } from '../../../common/decorators/is-non-blank-string.decorator';
import {
  CATEGORY_NAME_MAX_LENGTH,
  CATEGORY_SLUG_MAX_LENGTH,
  CATEGORY_SLUG_PATTERN,
} from '../constants/categories.constants';

/** `CategoryCreateRequest` (api-contract.md) — name/slug bắt buộc, `isActive` mặc định true. */
export class CreateCategoryDto {
  @ApiProperty({ maxLength: CATEGORY_NAME_MAX_LENGTH })
  @IsNonBlankString(CATEGORY_NAME_MAX_LENGTH, {
    minLength: 'validation.MIN_LENGTH_NAME',
    maxLength: 'validation.MAX_LENGTH_NAME',
  })
  name: string;

  @ApiProperty({ maxLength: CATEGORY_SLUG_MAX_LENGTH, example: 'sach' })
  @IsString({ message: i18nValidationMessage('validation.IS_STRING') })
  @MaxLength(CATEGORY_SLUG_MAX_LENGTH, {
    message: i18nValidationMessage('validation.MAX_LENGTH_SLUG'),
  })
  @Matches(CATEGORY_SLUG_PATTERN, {
    message: i18nValidationMessage('validation.INVALID_SLUG_FORMAT'),
  })
  slug: string;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean({ message: i18nValidationMessage('validation.IS_BOOLEAN') })
  isActive?: boolean = true;
}
