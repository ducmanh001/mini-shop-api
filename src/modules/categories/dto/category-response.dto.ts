import { ApiProperty } from '@nestjs/swagger';
import { Category } from '../entities/category.entity';

/** Shape dùng chung cho 1 category — giống nhau giữa public và admin (không có field ẩn). */
export class CategorySummaryFields {
  @ApiProperty()
  id: string;

  @ApiProperty()
  name: string;

  @ApiProperty()
  slug: string;

  @ApiProperty()
  isActive: boolean;

  @ApiProperty()
  createdAt: string;

  @ApiProperty()
  updatedAt: string;

  static fromEntity(category: Category): CategorySummaryFields {
    const fields = new CategorySummaryFields();
    fields.id = category.id;
    fields.name = category.name;
    fields.slug = category.slug;
    fields.isActive = category.isActive;
    fields.createdAt = category.createdAt.toISOString();
    fields.updatedAt = category.updatedAt.toISOString();
    return fields;
  }
}

/** `CategoryResponse` — POST/PATCH category (api-contract.md). */
export class CategoryResponseDto {
  @ApiProperty({ type: CategorySummaryFields })
  category: CategorySummaryFields;

  static fromEntity(category: Category): CategoryResponseDto {
    const dto = new CategoryResponseDto();
    dto.category = CategorySummaryFields.fromEntity(category);
    return dto;
  }
}

/** `CategoriesResponse` — `GET /categories` và `GET /admin/categories`. */
export class CategoriesResponseDto {
  @ApiProperty({ type: [CategorySummaryFields] })
  categories: CategorySummaryFields[];

  @ApiProperty()
  categoriesCount: number;

  static fromEntities(
    categories: Category[],
    categoriesCount: number,
  ): CategoriesResponseDto {
    const dto = new CategoriesResponseDto();
    dto.categories = categories.map((category) =>
      CategorySummaryFields.fromEntity(category),
    );
    dto.categoriesCount = categoriesCount;
    return dto;
  }
}
