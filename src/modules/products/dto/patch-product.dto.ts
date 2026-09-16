import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsBoolean,
  IsInt,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  ValidateIf,
} from 'class-validator';
import { i18nValidationMessage } from 'nestjs-i18n';
import { IsNonBlankString } from '../../../common/decorators/is-non-blank-string.decorator';
import { IsVndAmountString } from '../../../common/decorators/is-vnd-amount-string.decorator';
import {
  MAX_PRODUCT_PRICE_VND,
  MAX_PRODUCT_STOCK,
  MIN_PRODUCT_PRICE_VND,
  MIN_PRODUCT_STOCK,
  PRODUCT_DESCRIPTION_MAX_LENGTH,
  PRODUCT_NAME_MAX_LENGTH,
  PRODUCT_SKU_MAX_LENGTH,
} from '../constants/products.constants';

/**
 * `ProductPatchRequest` — mọi field optional, guard "ít nhất 1 field" nằm ở service. `stock` là
 * tồn khả dụng TUYỆT ĐỐI (ghi đè, không cộng dồn) — service khóa row trước khi ghi (mục 22
 * CODING_STANDARD.md). Không nhận `id`/ảnh — ảnh đi qua endpoint upload riêng.
 */
export class PatchProductDto {
  @ApiPropertyOptional({ format: 'uuid' })
  @ValidateIf((dto: PatchProductDto) => dto.categoryId !== undefined)
  @IsUUID('4', { message: i18nValidationMessage('validation.IS_UUID') })
  categoryId?: string;

  @ApiPropertyOptional({ maxLength: PRODUCT_NAME_MAX_LENGTH })
  @ValidateIf((dto: PatchProductDto) => dto.name !== undefined)
  @IsNonBlankString(PRODUCT_NAME_MAX_LENGTH, {
    minLength: 'validation.MIN_LENGTH_NAME',
    maxLength: 'validation.MAX_LENGTH_NAME',
  })
  name?: string;

  @ApiPropertyOptional({ maxLength: PRODUCT_DESCRIPTION_MAX_LENGTH })
  @ValidateIf((dto: PatchProductDto) => dto.description !== undefined)
  @IsString({ message: i18nValidationMessage('validation.IS_STRING') })
  @MaxLength(PRODUCT_DESCRIPTION_MAX_LENGTH, {
    message: i18nValidationMessage('validation.MAX_LENGTH_DESCRIPTION'),
  })
  description?: string;

  @ApiPropertyOptional({ maxLength: PRODUCT_SKU_MAX_LENGTH })
  @ValidateIf((dto: PatchProductDto) => dto.sku !== undefined)
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim().toUpperCase() : value,
  )
  @IsNonBlankString(PRODUCT_SKU_MAX_LENGTH, {
    minLength: 'validation.MIN_LENGTH_SKU',
    maxLength: 'validation.MAX_LENGTH_SKU',
  })
  sku?: string;

  @ApiPropertyOptional({ example: '160000' })
  @ValidateIf((dto: PatchProductDto) => dto.priceVnd !== undefined)
  @IsVndAmountString(MIN_PRODUCT_PRICE_VND, MAX_PRODUCT_PRICE_VND, {
    message: i18nValidationMessage('validation.INVALID_PRICE_VND'),
  })
  priceVnd?: string;

  @ApiPropertyOptional()
  @ValidateIf((dto: PatchProductDto) => dto.stock !== undefined)
  @IsInt({ message: i18nValidationMessage('validation.IS_INT') })
  @Min(MIN_PRODUCT_STOCK, {
    message: i18nValidationMessage('validation.MIN_STOCK'),
  })
  @Max(MAX_PRODUCT_STOCK, {
    message: i18nValidationMessage('validation.MAX_STOCK'),
  })
  stock?: number;

  @ApiPropertyOptional()
  @ValidateIf((dto: PatchProductDto) => dto.isActive !== undefined)
  @IsBoolean({ message: i18nValidationMessage('validation.IS_BOOLEAN') })
  isActive?: boolean;

  @ApiPropertyOptional()
  @ValidateIf((dto: PatchProductDto) => dto.isFeatured !== undefined)
  @IsBoolean({ message: i18nValidationMessage('validation.IS_BOOLEAN') })
  isFeatured?: boolean;
}
