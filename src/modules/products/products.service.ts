import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { I18nService } from 'nestjs-i18n';
import {
  DataSource,
  EntityManager,
  Repository,
  SelectQueryBuilder,
} from 'typeorm';
import { escapeIlikePattern } from '../../common/utils/escape-ilike-pattern.util';
import { isUniqueViolation } from '../../common/utils/postgres-unique-violation.util';
import { AttachmentsService } from '../attachments/attachments.service';
import { ATTACHMENT_ROUTE_PATH } from '../attachments/constants/attachments.constants';
import { AttachmentMimeType } from '../attachments/interfaces/attachment-mime-type.type';
import { Category } from '../categories/entities/category.entity';
import {
  FACEBOOK_SHARE_BASE_URL,
  PRODUCTS_ROUTE_PATH,
  X_SHARE_BASE_URL,
} from './constants/products.constants';
import { AdminListProductsQueryDto } from './dto/admin-list-products-query.dto';
import { CreateProductDto } from './dto/create-product.dto';
import { ListProductsQueryDto } from './dto/list-products-query.dto';
import { PatchProductDto } from './dto/patch-product.dto';
import {
  ProductResponseDto,
  ProductsResponseDto,
} from './dto/product-response.dto';
import { ShareLinksResponseDto } from './dto/share-links-response.dto';
import { Product } from './entities/product.entity';
import { CategoryDisplayFields } from './interfaces/category-display-fields.interface';

@Injectable()
export class ProductsService {
  private readonly logger = new Logger(ProductsService.name);
  private readonly attachmentsBasePath: string;

  constructor(
    @InjectRepository(Product)
    private readonly productsRepository: Repository<Product>,
    @InjectRepository(Category)
    private readonly categoriesRepository: Repository<Category>,
    private readonly dataSource: DataSource,
    private readonly attachmentsService: AttachmentsService,
    private readonly config: ConfigService,
    private readonly i18n: I18nService,
  ) {
    this.attachmentsBasePath = `/${this.config.getOrThrow<string>('API_PREFIX')}/${ATTACHMENT_ROUTE_PATH}`;
  }

  /** `GET /products` — public, chỉ product/category active (api-contract.md dòng 54, 56). */
  async listPublicProducts(
    query: ListProductsQueryDto,
  ): Promise<ProductsResponseDto> {
    const queryBuilder = this.baseProductListQuery()
      .andWhere('product.isActive = true')
      .andWhere('category.isActive = true');
    this.applyProductFilters(queryBuilder, query);
    queryBuilder.take(query.limit).skip(query.offset);

    const [products, productsCount] = await queryBuilder.getManyAndCount();
    return ProductsResponseDto.fromEntities(
      products,
      productsCount,
      this.attachmentsBasePath,
    );
  }

  /** `GET /products/:id` — 404 nếu không tồn tại hoặc không visible (cùng rule với list). */
  async getPublicProductDetail(id: string): Promise<ProductResponseDto> {
    const product = await this.baseProductListQuery()
      .andWhere('product.id = :id', { id })
      .andWhere('product.isActive = true')
      .andWhere('category.isActive = true')
      .getOne();
    if (!product) {
      throw new NotFoundException(this.i18n.t('errors.productNotFound'));
    }
    return ProductResponseDto.fromEntity(product, this.attachmentsBasePath);
  }

  /**
   * `GET /products/:id/share-links` — cùng rule visibility với product detail (api-contract.md dòng
   * 492). Chỉ select id/name (không cần description/price/stock/image) — không dùng
   * `baseProductListQuery()` vì nó kéo nhiều cột không dùng tới ở đây.
   */
  async getShareLinks(id: string): Promise<ShareLinksResponseDto> {
    const product = await this.productsRepository
      .createQueryBuilder('product')
      .innerJoin('product.category', 'category')
      .select(['product.id', 'product.name'])
      .where('product.id = :id', { id })
      .andWhere('product.isActive = true')
      .andWhere('category.isActive = true')
      .getOne();
    if (!product) {
      throw new NotFoundException(this.i18n.t('errors.productNotFound'));
    }

    const canonicalUrl = `${this.config.getOrThrow<string>('PUBLIC_WEB_URL')}/${PRODUCTS_ROUTE_PATH}/${product.id}`;
    const encodedUrl = encodeURIComponent(canonicalUrl);
    const encodedTitle = encodeURIComponent(product.name);

    const dto = new ShareLinksResponseDto();
    dto.canonicalUrl = canonicalUrl;
    dto.facebookUrl = `${FACEBOOK_SHARE_BASE_URL}?u=${encodedUrl}`;
    dto.xUrl = `${X_SHARE_BASE_URL}?url=${encodedUrl}&text=${encodedTitle}`;
    return dto;
  }

  /** `GET /admin/products` — thấy cả product/category inactive, filter `isActive` tùy chọn. */
  async listAdminProducts(
    query: AdminListProductsQueryDto,
  ): Promise<ProductsResponseDto> {
    const queryBuilder = this.baseProductListQuery();
    this.applyProductFilters(queryBuilder, query);
    if (query.isActive) {
      queryBuilder.andWhere('product.isActive = :isActive', {
        isActive: query.isActive === 'true',
      });
    }
    queryBuilder.take(query.limit).skip(query.offset);

    const [products, productsCount] = await queryBuilder.getManyAndCount();
    return ProductsResponseDto.fromEntities(
      products,
      productsCount,
      this.attachmentsBasePath,
    );
  }

  async createProduct(
    dto: CreateProductDto,
    actorId: string,
  ): Promise<ProductResponseDto> {
    const category = await this.loadUsableCategory(dto.categoryId);
    const product = this.productsRepository.create({
      categoryId: dto.categoryId,
      name: dto.name,
      description: dto.description ?? '',
      sku: dto.sku,
      priceVnd: dto.priceVnd,
      stock: dto.stock,
      isActive: dto.isActive ?? true,
      isFeatured: dto.isFeatured ?? false,
    });
    try {
      await this.productsRepository.save(product);
    } catch (error) {
      throw this.toConflictOrRethrow(error);
    }
    product.category = category as Category;
    product.image = null;
    this.logger.log(`Admin ${actorId} created product ${product.id}`);
    return ProductResponseDto.fromEntity(product, this.attachmentsBasePath);
  }

  /**
   * `stock` là tồn khả dụng TUYỆT ĐỐI (ghi đè). Khóa product (`pessimistic_write`) trước khi ghi,
   * kể cả khi patch không đụng `stock` — cùng kỷ luật lock với archive để 2 thao tác không đua
   * nhau trên cùng row (CODING_STANDARD.md mục 22). Không dùng `relations` cùng lock: Postgres
   * cấm `FOR UPDATE` trên vế NULL-able của outer join — category/image được nạp lại RIÊNG, không
   * lock, sau khi ghi xong.
   */
  async patchProduct(
    id: string,
    dto: PatchProductDto,
    actorId: string,
  ): Promise<ProductResponseDto> {
    if (
      dto.categoryId === undefined &&
      dto.name === undefined &&
      dto.description === undefined &&
      dto.sku === undefined &&
      dto.priceVnd === undefined &&
      dto.stock === undefined &&
      dto.isActive === undefined &&
      dto.isFeatured === undefined
    ) {
      throw new BadRequestException(
        this.i18n.t('errors.atLeastOneFieldRequired'),
      );
    }

    return this.dataSource.transaction(async (manager) => {
      const productRepository = manager.getRepository(Product);
      const lockedProduct = await productRepository.findOne({
        where: { id },
        lock: { mode: 'pessimistic_write' },
      });
      if (!lockedProduct) {
        throw new NotFoundException(this.i18n.t('errors.productNotFound'));
      }

      const category: CategoryDisplayFields =
        dto.categoryId !== undefined
          ? await this.loadUsableCategory(dto.categoryId, manager)
          : await this.loadCategoryDisplayFields(
              lockedProduct.categoryId,
              manager,
            );

      const changes: Partial<Product> = {
        ...(dto.categoryId !== undefined && { categoryId: dto.categoryId }),
        ...(dto.name !== undefined && { name: dto.name }),
        ...(dto.description !== undefined && {
          description: dto.description,
        }),
        ...(dto.sku !== undefined && { sku: dto.sku }),
        ...(dto.priceVnd !== undefined && { priceVnd: dto.priceVnd }),
        ...(dto.stock !== undefined && { stock: dto.stock }),
        ...(dto.isActive !== undefined && { isActive: dto.isActive }),
        ...(dto.isFeatured !== undefined && { isFeatured: dto.isFeatured }),
      };
      try {
        await productRepository.update(id, changes);
      } catch (error) {
        throw this.toConflictOrRethrow(error);
      }

      const image = lockedProduct.imageId
        ? await manager
            .getRepository(Product)
            .createQueryBuilder('product')
            .leftJoin('product.image', 'image')
            .select([
              'product.id',
              'image.id',
              'image.mimeType',
              'image.sizeBytes',
            ])
            .where('product.id = :id', { id })
            .getOne()
        : null;

      Object.assign(lockedProduct, changes);
      lockedProduct.category = category as Category;
      lockedProduct.image = image?.image ?? null;
      this.logger.log(
        `Admin ${actorId} updated product ${id}: ${Object.keys(changes).join(', ')}`,
      );
      return ProductResponseDto.fromEntity(
        lockedProduct,
        this.attachmentsBasePath,
      );
    });
  }

  /** `DELETE /admin/products/:id` = archive, không hard-delete (lịch sử đơn giữ nguyên). */
  async archiveProduct(id: string, actorId: string): Promise<void> {
    await this.dataSource.transaction(async (manager) => {
      const productRepository = manager.getRepository(Product);
      const lockedProduct = await productRepository.findOne({
        select: { id: true },
        where: { id },
        lock: { mode: 'pessimistic_write' },
      });
      if (!lockedProduct) {
        throw new NotFoundException(this.i18n.t('errors.productNotFound'));
      }
      await productRepository.update(id, { isActive: false });
    });
    this.logger.log(`Admin ${actorId} archived product ${id}`);
  }

  /**
   * FILE-02 — ghi file mới trước khi mở transaction; transaction chỉ gồm thao tác DB (insert
   * `Attachment` mới, update `product.imageId`, xóa row `Attachment` cũ). Transaction lỗi → dọn
   * file mới vừa ghi, giữ nguyên ảnh cũ. Thành công → chỉ dọn file cũ SAU khi commit (database.md
   * "attachments").
   */
  async replaceProductImage(
    id: string,
    file: Express.Multer.File | undefined,
    actorId: string,
  ): Promise<ProductResponseDto> {
    if (!file) {
      throw new BadRequestException(this.i18n.t('errors.missingImageFile'));
    }
    this.attachmentsService.validateImageFile(file);
    const mimeType = file.mimetype as AttachmentMimeType;
    const newStorageKey = await this.attachmentsService.writeImageFile(
      file.buffer,
      mimeType,
    );

    let outcome: {
      product: Product;
      newImage: { id: string; mimeType: AttachmentMimeType; sizeBytes: number };
      previousStorageKey: string | null;
    };
    try {
      outcome = await this.dataSource.transaction(async (manager) => {
        const productRepository = manager.getRepository(Product);
        const lockedProduct = await productRepository.findOne({
          where: { id },
          lock: { mode: 'pessimistic_write' },
        });
        if (!lockedProduct) {
          throw new NotFoundException(this.i18n.t('errors.productNotFound'));
        }

        const attachment = await this.attachmentsService.createAttachmentRecord(
          { storageKey: newStorageKey, mimeType, sizeBytes: file.size },
          manager,
        );
        await productRepository.update(id, { imageId: attachment.id });

        let previousStorageKey: string | null = null;
        if (lockedProduct.imageId) {
          previousStorageKey = await this.attachmentsService.findStorageKeyById(
            lockedProduct.imageId,
            manager,
          );
          await this.attachmentsService.deleteAttachmentRecord(
            lockedProduct.imageId,
            manager,
          );
        }
        return {
          product: lockedProduct,
          newImage: {
            id: attachment.id,
            mimeType: attachment.mimeType,
            sizeBytes: attachment.sizeBytes,
          },
          previousStorageKey,
        };
      });
    } catch (error) {
      await this.attachmentsService.deleteFileByStorageKey(newStorageKey);
      throw error;
    }

    if (outcome.previousStorageKey) {
      await this.attachmentsService.deleteFileByStorageKey(
        outcome.previousStorageKey,
      );
    }
    this.logger.log(
      `Admin ${actorId} replaced image of product ${id} with attachment ${outcome.newImage.id}`,
    );

    const category = await this.loadCategoryDisplayFields(
      outcome.product.categoryId,
    );
    outcome.product.category = category as Category;
    outcome.product.imageId = outcome.newImage.id;
    outcome.product.image = outcome.newImage as Product['image'];
    return ProductResponseDto.fromEntity(
      outcome.product,
      this.attachmentsBasePath,
    );
  }

  /** FILE-03 — 204 kể cả khi product chưa có ảnh; file chỉ dọn sau khi DB commit thành công. */
  async deleteProductImage(id: string, actorId: string): Promise<void> {
    let oldStorageKey: string | null = null;
    let hasImage = false;

    await this.dataSource.transaction(async (manager) => {
      const productRepository = manager.getRepository(Product);
      const lockedProduct = await productRepository.findOne({
        select: { id: true, imageId: true },
        where: { id },
        lock: { mode: 'pessimistic_write' },
      });
      if (!lockedProduct) {
        throw new NotFoundException(this.i18n.t('errors.productNotFound'));
      }
      if (!lockedProduct.imageId) {
        return;
      }
      hasImage = true;
      oldStorageKey = await this.attachmentsService.findStorageKeyById(
        lockedProduct.imageId,
        manager,
      );
      await productRepository.update(id, { imageId: null });
      await this.attachmentsService.deleteAttachmentRecord(
        lockedProduct.imageId,
        manager,
      );
    });

    if (oldStorageKey) {
      await this.attachmentsService.deleteFileByStorageKey(oldStorageKey);
    }
    if (hasImage) {
      this.logger.log(`Admin ${actorId} removed image of product ${id}`);
    }
  }

  private baseProductListQuery(): SelectQueryBuilder<Product> {
    return this.productsRepository
      .createQueryBuilder('product')
      .innerJoin('product.category', 'category')
      .leftJoin('product.image', 'image')
      .select([
        'product.id',
        'product.name',
        'product.description',
        'product.priceVnd',
        'product.stock',
        'product.isActive',
        'product.isFeatured',
        'product.createdAt',
        'product.updatedAt',
        'category.id',
        'category.name',
        'category.isActive',
        'image.id',
        'image.mimeType',
        'image.sizeBytes',
      ])
      .orderBy('product.createdAt', 'DESC')
      .addOrderBy('product.id', 'DESC');
  }

  private applyProductFilters(
    queryBuilder: SelectQueryBuilder<Product>,
    query: ListProductsQueryDto,
  ): void {
    if (query.categoryId) {
      queryBuilder.andWhere('product.categoryId = :categoryId', {
        categoryId: query.categoryId,
      });
    }
    if (query.q) {
      const q = `%${escapeIlikePattern(query.q)}%`;
      queryBuilder
        .addSelect(
          "CASE WHEN unaccent(product.name) ILIKE unaccent(:q) ESCAPE '\\' THEN 0 ELSE 1 END",
          'name_match_rank',
        )
        .andWhere(
          "(unaccent(product.name) ILIKE unaccent(:q) ESCAPE '\\' OR unaccent(product.description) ILIKE unaccent(:q) ESCAPE '\\')",
          { q },
        )
        // Khớp tên xếp trước khớp description-only (đúng thứ tự liên quan cao hơn), rồi mới tới
        // tiebreak mặc định — `.orderBy()` reset toàn bộ ORDER BY nên phải khai lại 2 dòng tiebreak.
        // Order theo 1 alias đã `addSelect` (không phải raw string chứa "alias.column") vì
        // `getManyAndCount()` kết hợp join + take/skip dùng lại orderBy để dựng subquery phân trang
        // theo alias — 1 raw CASE chứa dấu "." khiến TypeORM parse nhầm thành tên alias không tồn tại.
        .orderBy('name_match_rank', 'ASC')
        .addOrderBy('product.createdAt', 'DESC')
        .addOrderBy('product.id', 'DESC');
    }
    if (
      query.minPrice !== undefined &&
      query.maxPrice !== undefined &&
      Number(query.minPrice) > Number(query.maxPrice)
    ) {
      throw new BadRequestException(
        this.i18n.t('errors.minPriceExceedsMaxPrice'),
      );
    }
    if (query.minPrice !== undefined) {
      queryBuilder.andWhere('product.priceVnd >= :minPrice', {
        minPrice: query.minPrice,
      });
    }
    if (query.maxPrice !== undefined) {
      queryBuilder.andWhere('product.priceVnd <= :maxPrice', {
        maxPrice: query.maxPrice,
      });
    }
    if (query.featured) {
      queryBuilder.andWhere('product.isFeatured = :featured', {
        featured: query.featured === 'true',
      });
    }
  }

  /** Validate category tồn tại + active — dùng cho create và khi patch đổi `categoryId`. */
  private async loadUsableCategory(
    categoryId: string,
    manager?: EntityManager,
  ): Promise<CategoryDisplayFields> {
    const repository = manager
      ? manager.getRepository(Category)
      : this.categoriesRepository;
    const category = await repository.findOne({
      select: { id: true, name: true, isActive: true },
      where: { id: categoryId },
    });
    if (!category) {
      throw new NotFoundException(this.i18n.t('errors.categoryNotFound'));
    }
    if (!category.isActive) {
      throw new ConflictException(this.i18n.t('errors.categoryInactive'));
    }
    return category;
  }

  /**
   * Chỉ để dựng response (không validate) — category của 1 product đã tồn tại luôn tồn tại
   * (`ON DELETE RESTRICT`), kể cả khi đã bị deactivate sau đó.
   */
  private async loadCategoryDisplayFields(
    categoryId: string,
    manager?: EntityManager,
  ): Promise<CategoryDisplayFields> {
    const repository = manager
      ? manager.getRepository(Category)
      : this.categoriesRepository;
    const category = await repository.findOne({
      select: { id: true, name: true, isActive: true },
      where: { id: categoryId },
    });
    return category as CategoryDisplayFields;
  }

  private toConflictOrRethrow(error: unknown): unknown {
    if (!isUniqueViolation(error)) {
      return error;
    }
    return new ConflictException(this.i18n.t('errors.productSkuAlreadyTaken'));
  }
}
