import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsString,
  MaxLength,
  Matches,
  ValidateIf,
} from 'class-validator';
import { i18nValidationMessage } from 'nestjs-i18n';
import { IsNonBlankString } from '../../../common/decorators/is-non-blank-string.decorator';
import {
  CATEGORY_NAME_MAX_LENGTH,
  CATEGORY_SLUG_MAX_LENGTH,
  CATEGORY_SLUG_PATTERN,
} from '../constants/categories.constants';

/**
 * `CategoryPatchRequest` — mỗi field độc lập optional; guard "ít nhất 1 field" nằm ở service
 * (giống `UpdateProfileDto`/`UsersService.updateProfile`). `@ValidateIf` thay vì `@IsOptional` để
 * `null` tường minh vẫn bị từ chối, chỉ field không gửi (`undefined`) mới được bỏ qua validate.
 */
export class PatchCategoryDto {
  @ApiPropertyOptional({ maxLength: CATEGORY_NAME_MAX_LENGTH })
  @ValidateIf((dto: PatchCategoryDto) => dto.name !== undefined)
  @IsNonBlankString(CATEGORY_NAME_MAX_LENGTH, {
    minLength: 'validation.MIN_LENGTH_NAME',
    maxLength: 'validation.MAX_LENGTH_NAME',
  })
  name?: string;

  @ApiPropertyOptional({ maxLength: CATEGORY_SLUG_MAX_LENGTH })
  @ValidateIf((dto: PatchCategoryDto) => dto.slug !== undefined)
  @IsString({ message: i18nValidationMessage('validation.IS_STRING') })
  @MaxLength(CATEGORY_SLUG_MAX_LENGTH, {
    message: i18nValidationMessage('validation.MAX_LENGTH_SLUG'),
  })
  @Matches(CATEGORY_SLUG_PATTERN, {
    message: i18nValidationMessage('validation.INVALID_SLUG_FORMAT'),
  })
  slug?: string;

  @ApiPropertyOptional()
  @ValidateIf((dto: PatchCategoryDto) => dto.isActive !== undefined)
  @IsBoolean({ message: i18nValidationMessage('validation.IS_BOOLEAN') })
  isActive?: boolean;
}
