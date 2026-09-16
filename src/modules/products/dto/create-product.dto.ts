import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
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

/** `ProductCreateRequest` (api-contract.md) — ảnh gắn qua endpoint upload riêng, không trong body này. */
export class CreateProductDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID('4', { message: i18nValidationMessage('validation.IS_UUID') })
  categoryId: string;

  @ApiProperty({ maxLength: PRODUCT_NAME_MAX_LENGTH })
  @IsNonBlankString(PRODUCT_NAME_MAX_LENGTH, {
    minLength: 'validation.MIN_LENGTH_NAME',
    maxLength: 'validation.MAX_LENGTH_NAME',
  })
  name: string;

  @ApiPropertyOptional({
    default: '',
    maxLength: PRODUCT_DESCRIPTION_MAX_LENGTH,
  })
  @IsOptional()
  @IsString({ message: i18nValidationMessage('validation.IS_STRING') })
  @MaxLength(PRODUCT_DESCRIPTION_MAX_LENGTH, {
    message: i18nValidationMessage('validation.MAX_LENGTH_DESCRIPTION'),
  })
  description?: string = '';

  @ApiProperty({ maxLength: PRODUCT_SKU_MAX_LENGTH, example: 'NOTE-NEST-001' })
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim().toUpperCase() : value,
  )
  @IsNonBlankString(PRODUCT_SKU_MAX_LENGTH, {
    minLength: 'validation.MIN_LENGTH_SKU',
    maxLength: 'validation.MAX_LENGTH_SKU',
  })
  sku: string;

  @ApiProperty({ example: '150000' })
  @IsVndAmountString(MIN_PRODUCT_PRICE_VND, MAX_PRODUCT_PRICE_VND, {
    message: i18nValidationMessage('validation.INVALID_PRICE_VND'),
  })
  priceVnd: string;

  @ApiProperty()
  @IsInt({ message: i18nValidationMessage('validation.IS_INT') })
  @Min(MIN_PRODUCT_STOCK, {
    message: i18nValidationMessage('validation.MIN_STOCK'),
  })
  @Max(MAX_PRODUCT_STOCK, {
    message: i18nValidationMessage('validation.MAX_STOCK'),
  })
  stock: number;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean({ message: i18nValidationMessage('validation.IS_BOOLEAN') })
  isActive?: boolean = true;

  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @IsBoolean({ message: i18nValidationMessage('validation.IS_BOOLEAN') })
  isFeatured?: boolean = false;
}
