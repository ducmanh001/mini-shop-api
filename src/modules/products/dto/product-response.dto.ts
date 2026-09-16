import { ApiProperty } from '@nestjs/swagger';
import { Product } from '../entities/product.entity';

/** Category lồng trong product — chỉ summary công khai, không phải toàn bộ `CategoryResponse`. */
class ProductCategoryFields {
  @ApiProperty()
  id: string;

  @ApiProperty()
  name: string;

  @ApiProperty()
  isActive: boolean;
}

/** Ảnh lồng trong product — chỉ metadata công khai, không có storage path (api-contract.md). */
class ProductImageFields {
  @ApiProperty()
  id: string;

  @ApiProperty()
  url: string;

  @ApiProperty()
  mimeType: string;

  @ApiProperty()
  sizeBytes: number;
}

export class ProductSummaryFields {
  @ApiProperty()
  id: string;

  @ApiProperty()
  name: string;

  @ApiProperty()
  description: string;

  @ApiProperty({ type: ProductCategoryFields })
  category: ProductCategoryFields;

  @ApiProperty()
  priceVnd: string;

  @ApiProperty()
  stock: number;

  @ApiProperty()
  isActive: boolean;

  @ApiProperty()
  isFeatured: boolean;

  @ApiProperty({ type: ProductImageFields, nullable: true })
  image: ProductImageFields | null;

  @ApiProperty()
  createdAt: string;

  @ApiProperty()
  updatedAt: string;

  static fromEntity(
    product: Product,
    attachmentsBasePath: string,
  ): ProductSummaryFields {
    const fields = new ProductSummaryFields();
    fields.id = product.id;
    fields.name = product.name;
    fields.description = product.description;
    fields.category = {
      id: product.category.id,
      name: product.category.name,
      isActive: product.category.isActive,
    };
    fields.priceVnd = product.priceVnd;
    fields.stock = product.stock;
    fields.isActive = product.isActive;
    fields.isFeatured = product.isFeatured;
    fields.image = product.image
      ? {
          id: product.image.id,
          url: `${attachmentsBasePath}/${product.image.id}`,
          mimeType: product.image.mimeType,
          sizeBytes: product.image.sizeBytes,
        }
      : null;
    fields.createdAt = product.createdAt.toISOString();
    fields.updatedAt = product.updatedAt.toISOString();
    return fields;
  }
}

/** `ProductResponse` — POST/PATCH/GET :id, và endpoint upload/xóa ảnh (cùng shape). */
export class ProductResponseDto {
  @ApiProperty({ type: ProductSummaryFields })
  product: ProductSummaryFields;

  static fromEntity(
    product: Product,
    attachmentsBasePath: string,
  ): ProductResponseDto {
    const dto = new ProductResponseDto();
    dto.product = ProductSummaryFields.fromEntity(product, attachmentsBasePath);
    return dto;
  }
}

/** `ProductsResponse` — `GET /products` và `GET /admin/products`. */
export class ProductsResponseDto {
  @ApiProperty({ type: [ProductSummaryFields] })
  products: ProductSummaryFields[];

  @ApiProperty()
  productsCount: number;

  static fromEntities(
    products: Product[],
    productsCount: number,
    attachmentsBasePath: string,
  ): ProductsResponseDto {
    const dto = new ProductsResponseDto();
    dto.products = products.map((product) =>
      ProductSummaryFields.fromEntity(product, attachmentsBasePath),
    );
    dto.productsCount = productsCount;
    return dto;
  }
}
