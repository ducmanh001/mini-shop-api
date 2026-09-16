import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { I18nService } from 'nestjs-i18n';
import { Repository } from 'typeorm';
import { escapeIlikePattern } from '../../common/utils/escape-ilike-pattern.util';
import { isForeignKeyViolation } from '../../common/utils/postgres-foreign-key-violation.util';
import { isUniqueViolation } from '../../common/utils/postgres-unique-violation.util';
import { Product } from '../products/entities/product.entity';
import { AdminListCategoriesQueryDto } from './dto/admin-list-categories-query.dto';
import {
  CategoriesResponseDto,
  CategoryResponseDto,
} from './dto/category-response.dto';
import { CreateCategoryDto } from './dto/create-category.dto';
import { ListCategoriesQueryDto } from './dto/list-categories-query.dto';
import { PatchCategoryDto } from './dto/patch-category.dto';
import { Category } from './entities/category.entity';

@Injectable()
export class CategoriesService {
  private readonly logger = new Logger(CategoriesService.name);

  constructor(
    @InjectRepository(Category)
    private readonly categoriesRepository: Repository<Category>,
    /** Chỉ dùng entity-level cho `.exists()` ở `deleteCategory` — không import `ProductsModule`
     * (categories là module lá, xem CODING_STANDARD.md mục 10, cùng pattern reviews→orders). */
    @InjectRepository(Product)
    private readonly productsRepository: Repository<Product>,
    private readonly i18n: I18nService,
  ) {}

  /** `GET /categories` — public, luôn lọc active, sort cố định. */
  async listPublicCategories(
    query: ListCategoriesQueryDto,
  ): Promise<CategoriesResponseDto> {
    const [categories, categoriesCount] = await this.baseListQuery()
      .andWhere('category.isActive = true')
      .take(query.limit)
      .skip(query.offset)
      .getManyAndCount();
    return CategoriesResponseDto.fromEntities(categories, categoriesCount);
  }

  /** `GET /admin/categories` — thấy cả active/inactive, filter `q`/`isActive` tùy chọn. */
  async listAdminCategories(
    query: AdminListCategoriesQueryDto,
  ): Promise<CategoriesResponseDto> {
    const queryBuilder = this.baseListQuery()
      .take(query.limit)
      .skip(query.offset);

    if (query.isActive) {
      queryBuilder.andWhere('category.isActive = :isActive', {
        isActive: query.isActive === 'true',
      });
    }
    if (query.q) {
      queryBuilder.andWhere("category.name ILIKE :q ESCAPE '\\'", {
        q: `%${escapeIlikePattern(query.q)}%`,
      });
    }

    const [categories, categoriesCount] = await queryBuilder.getManyAndCount();
    return CategoriesResponseDto.fromEntities(categories, categoriesCount);
  }

  async createCategory(
    dto: CreateCategoryDto,
    actorId: string,
  ): Promise<CategoryResponseDto> {
    const category = this.categoriesRepository.create({
      name: dto.name,
      slug: dto.slug,
      isActive: dto.isActive ?? true,
    });
    try {
      await this.categoriesRepository.save(category);
    } catch (error) {
      throw this.toConflictOrRethrow(error);
    }
    this.logger.log(`Admin ${actorId} created category ${category.id}`);
    return CategoryResponseDto.fromEntity(category);
  }

  async patchCategory(
    id: string,
    dto: PatchCategoryDto,
    actorId: string,
  ): Promise<CategoryResponseDto> {
    if (
      dto.name === undefined &&
      dto.slug === undefined &&
      dto.isActive === undefined
    ) {
      throw new BadRequestException(
        this.i18n.t('errors.atLeastOneFieldRequired'),
      );
    }
    try {
      await this.categoriesRepository.update(id, {
        ...(dto.name !== undefined && { name: dto.name }),
        ...(dto.slug !== undefined && { slug: dto.slug }),
        ...(dto.isActive !== undefined && { isActive: dto.isActive }),
      });
    } catch (error) {
      throw this.toConflictOrRethrow(error);
    }
    const category = await this.categoriesRepository.findOneBy({ id });
    if (!category) {
      throw new NotFoundException(this.i18n.t('errors.categoryNotFound'));
    }
    this.logger.log(`Admin ${actorId} updated category ${id}`);
    return CategoryResponseDto.fromEntity(category);
  }

  /**
   * CAT-05 — hard-delete chỉ khi rỗng. `.exists()` là đường đi chính (đúng kỹ thuật ghi trong
   * api-requirements.csv); bắt thêm lỗi FK (`products.category_id` có `ON DELETE RESTRICT`) làm
   * lưới an toàn cho race thật (product được tạo giữa lúc check và lúc DELETE) — không chỉ
   * check-then-act (CODING_STANDARD.md mục 7, 22).
   */
  async deleteCategory(id: string, actorId: string): Promise<void> {
    const exists = await this.categoriesRepository.exists({ where: { id } });
    if (!exists) {
      throw new NotFoundException(this.i18n.t('errors.categoryNotFound'));
    }
    const hasProducts = await this.productsRepository.exists({
      where: { categoryId: id },
    });
    if (hasProducts) {
      throw new ConflictException(this.i18n.t('errors.categoryInUse'));
    }
    try {
      await this.categoriesRepository.delete(id);
    } catch (error) {
      if (isForeignKeyViolation(error)) {
        throw new ConflictException(this.i18n.t('errors.categoryInUse'));
      }
      throw error;
    }
    this.logger.log(`Admin ${actorId} deleted category ${id}`);
  }

  private baseListQuery() {
    return this.categoriesRepository
      .createQueryBuilder('category')
      .select([
        'category.id',
        'category.name',
        'category.slug',
        'category.isActive',
        'category.createdAt',
        'category.updatedAt',
      ])
      .orderBy('category.createdAt', 'DESC')
      .addOrderBy('category.id', 'DESC');
  }

  /** `categories` chỉ có đúng 1 unique constraint (`uq_categories_slug`) — không cần phân nhánh
   * theo tên constraint như `UsersService`. */
  private toConflictOrRethrow(error: unknown): unknown {
    if (!isUniqueViolation(error)) {
      return error;
    }
    return new ConflictException(
      this.i18n.t('errors.categorySlugAlreadyTaken'),
    );
  }
}
