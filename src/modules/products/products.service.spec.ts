import {
  BadRequestException,
  ConflictException,
  NotFoundException,
  UnsupportedMediaTypeException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { I18nService } from 'nestjs-i18n';
import {
  DataSource,
  EntityManager,
  QueryFailedError,
  Repository,
} from 'typeorm';
import { AttachmentsService } from '../attachments/attachments.service';
import { Category } from '../categories/entities/category.entity';
import { Product } from './entities/product.entity';
import { ProductsService } from './products.service';

function buildUniqueViolation(constraint: string): QueryFailedError {
  const error = new QueryFailedError('INSERT', [], new Error('duplicate'));
  (error as unknown as { driverError: unknown }).driverError = {
    code: '23505',
    constraint,
  };
  return error;
}

function mockQueryBuilder() {
  const builder: Record<string, jest.Mock> = {};
  for (const method of [
    'innerJoin',
    'leftJoin',
    'select',
    'addSelect',
    'where',
    'andWhere',
    'orderBy',
    'addOrderBy',
    'take',
    'skip',
  ]) {
    builder[method] = jest.fn().mockReturnThis();
  }
  builder.getOne = jest.fn();
  builder.getManyAndCount = jest.fn().mockResolvedValue([[], 0]);
  return builder;
}

function sampleCategory(overrides: Partial<Category> = {}): Category {
  return {
    id: 'category-1',
    name: 'Sách',
    isActive: true,
    ...overrides,
  } as Category;
}

function sampleProduct(overrides: Partial<Product> = {}): Product {
  return {
    id: 'product-1',
    name: 'Sổ tay NestJS',
    description: '',
    priceVnd: '150000',
    stock: 10,
    isActive: true,
    isFeatured: false,
    category: sampleCategory(),
    image: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  } as Product;
}

describe('ProductsService', () => {
  let productsRepository: jest.Mocked<
    Pick<Repository<Product>, 'create' | 'save' | 'createQueryBuilder'>
  >;
  let categoriesRepository: jest.Mocked<Pick<Repository<Category>, 'findOne'>>;
  let attachmentsService: jest.Mocked<
    Pick<
      AttachmentsService,
      | 'validateImageFile'
      | 'writeImageFile'
      | 'deleteFileByStorageKey'
      | 'createAttachmentRecord'
      | 'deleteAttachmentRecord'
      | 'findStorageKeyById'
    >
  >;
  let config: { getOrThrow: jest.Mock };
  let i18n: { t: jest.Mock };
  let dataSource: { transaction: jest.Mock };
  let managerProductRepository: {
    findOne: jest.Mock;
    update: jest.Mock;
    createQueryBuilder: jest.Mock;
  };
  let managerCategoryRepository: { findOne: jest.Mock };
  let manager: { getRepository: jest.Mock };
  let service: ProductsService;

  beforeEach(() => {
    productsRepository = {
      create: jest.fn((data: Partial<Product>) => data as Product),
      save: jest.fn((entity: Product) => {
        entity.createdAt ??= new Date();
        entity.updatedAt ??= new Date();
        return Promise.resolve(entity);
      }),
      createQueryBuilder: jest.fn(),
    };
    categoriesRepository = { findOne: jest.fn() };
    attachmentsService = {
      validateImageFile: jest.fn(),
      writeImageFile: jest.fn(),
      deleteFileByStorageKey: jest.fn(),
      createAttachmentRecord: jest.fn(),
      deleteAttachmentRecord: jest.fn(),
      findStorageKeyById: jest.fn(),
    };
    config = {
      getOrThrow: jest.fn((key: string) =>
        key === 'PUBLIC_WEB_URL' ? 'http://localhost:3001' : 'api/v1',
      ),
    };
    i18n = { t: jest.fn((key: string) => key) };

    managerProductRepository = {
      findOne: jest.fn(),
      update: jest.fn().mockResolvedValue({ affected: 1 }),
      createQueryBuilder: jest.fn(),
    };
    managerCategoryRepository = { findOne: jest.fn() };
    manager = {
      getRepository: jest.fn((entity: unknown) => {
        if (entity === Product) return managerProductRepository;
        if (entity === Category) return managerCategoryRepository;
        throw new Error('unexpected entity requested from manager');
      }),
    };
    dataSource = {
      transaction: jest.fn((callback: (m: EntityManager) => Promise<unknown>) =>
        callback(manager as unknown as EntityManager),
      ),
    };

    service = new ProductsService(
      productsRepository as unknown as Repository<Product>,
      categoriesRepository as unknown as Repository<Category>,
      dataSource as unknown as DataSource,
      attachmentsService as unknown as AttachmentsService,
      config as unknown as ConfigService,
      i18n as unknown as I18nService,
    );
  });

  describe('listPublicProducts', () => {
    it('always filters to active product and active category', async () => {
      const builder = mockQueryBuilder();
      productsRepository.createQueryBuilder.mockReturnValue(builder);

      await service.listPublicProducts({ limit: 20, offset: 0 });

      expect(builder.andWhere).toHaveBeenCalledWith('product.isActive = true');
      expect(builder.andWhere).toHaveBeenCalledWith('category.isActive = true');
    });

    it('rejects minPrice greater than maxPrice with 400', async () => {
      productsRepository.createQueryBuilder.mockReturnValue(mockQueryBuilder());

      await expect(
        service.listPublicProducts({
          limit: 20,
          offset: 0,
          minPrice: '500000',
          maxPrice: '100000',
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('applies featured strictly as a literal string comparison', async () => {
      const builder = mockQueryBuilder();
      productsRepository.createQueryBuilder.mockReturnValue(builder);

      await service.listPublicProducts({
        limit: 20,
        offset: 0,
        featured: 'false',
      });

      expect(builder.andWhere).toHaveBeenCalledWith(
        'product.isFeatured = :featured',
        { featured: false },
      );
    });

    it('applies categoryId, q (escaped ILIKE) and price bounds when provided', async () => {
      const builder = mockQueryBuilder();
      productsRepository.createQueryBuilder.mockReturnValue(builder);

      await service.listPublicProducts({
        limit: 20,
        offset: 0,
        categoryId: 'category-1',
        q: 'sổ tay',
        minPrice: '100000',
        maxPrice: '200000',
      });

      expect(builder.andWhere).toHaveBeenCalledWith(
        'product.categoryId = :categoryId',
        { categoryId: 'category-1' },
      );
      expect(builder.andWhere).toHaveBeenCalledWith(
        expect.stringContaining('unaccent(product.name) ILIKE unaccent(:q)'),
        { q: '%sổ tay%' },
      );
      expect(builder.andWhere).toHaveBeenCalledWith(
        'product.priceVnd >= :minPrice',
        { minPrice: '100000' },
      );
      expect(builder.andWhere).toHaveBeenCalledWith(
        'product.priceVnd <= :maxPrice',
        { maxPrice: '200000' },
      );
    });

    it('ranks name matches before description-only matches when q is provided', async () => {
      const builder = mockQueryBuilder();
      productsRepository.createQueryBuilder.mockReturnValue(builder);

      await service.listPublicProducts({ limit: 20, offset: 0, q: 'chuot' });

      expect(builder.addSelect).toHaveBeenCalledWith(
        expect.stringContaining('CASE WHEN unaccent(product.name) ILIKE'),
        'name_match_rank',
      );
      expect(builder.orderBy).toHaveBeenCalledWith('name_match_rank', 'ASC');
      expect(builder.addOrderBy).toHaveBeenCalledWith(
        'product.createdAt',
        'DESC',
      );
      expect(builder.addOrderBy).toHaveBeenCalledWith('product.id', 'DESC');
    });
  });

  describe('getPublicProductDetail', () => {
    it('throws NotFoundException when not visible or missing', async () => {
      const builder = mockQueryBuilder();
      builder.getOne.mockResolvedValue(null);
      productsRepository.createQueryBuilder.mockReturnValue(builder);

      await expect(
        service.getPublicProductDetail('missing-id'),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('returns the product when it is visible', async () => {
      const builder = mockQueryBuilder();
      builder.getOne.mockResolvedValue(sampleProduct());
      productsRepository.createQueryBuilder.mockReturnValue(builder);

      const result = await service.getPublicProductDetail('product-1');

      expect(result.product.id).toBe('product-1');
    });
  });

  describe('getShareLinks', () => {
    it('throws NotFoundException when not visible or missing', async () => {
      const builder = mockQueryBuilder();
      builder.getOne.mockResolvedValue(null);
      productsRepository.createQueryBuilder.mockReturnValue(builder);

      await expect(service.getShareLinks('missing-id')).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it('builds the canonical URL from PUBLIC_WEB_URL and encodes the name into share URLs', async () => {
      const builder = mockQueryBuilder();
      builder.getOne.mockResolvedValue(
        sampleProduct({ id: 'product-1', name: 'Sổ tay & bút' }),
      );
      productsRepository.createQueryBuilder.mockReturnValue(builder);

      const result = await service.getShareLinks('product-1');

      expect(result.canonicalUrl).toBe(
        'http://localhost:3001/products/product-1',
      );
      expect(result.facebookUrl).toBe(
        `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(result.canonicalUrl)}`,
      );
      expect(result.xUrl).toBe(
        `https://twitter.com/intent/tweet?url=${encodeURIComponent(result.canonicalUrl)}&text=${encodeURIComponent('Sổ tay & bút')}`,
      );
    });
  });

  describe('listAdminProducts', () => {
    it('does not force a visibility filter', async () => {
      const builder = mockQueryBuilder();
      productsRepository.createQueryBuilder.mockReturnValue(builder);

      await service.listAdminProducts({ limit: 20, offset: 0 });

      expect(builder.andWhere).not.toHaveBeenCalledWith(
        'product.isActive = true',
      );
    });

    it('applies isActive when provided', async () => {
      const builder = mockQueryBuilder();
      productsRepository.createQueryBuilder.mockReturnValue(builder);

      await service.listAdminProducts({
        limit: 20,
        offset: 0,
        isActive: 'false',
      });

      expect(builder.andWhere).toHaveBeenCalledWith(
        'product.isActive = :isActive',
        { isActive: false },
      );
    });
  });

  describe('createProduct', () => {
    const createDto = {
      categoryId: 'category-1',
      name: 'Sổ tay NestJS',
      description: '',
      sku: 'NOTE-001',
      priceVnd: '150000',
      stock: 10,
      isActive: true,
      isFeatured: false,
    };

    it('creates the product when the category is usable', async () => {
      categoriesRepository.findOne.mockResolvedValue(sampleCategory());

      const result = await service.createProduct(createDto, 'admin-1');

      expect(productsRepository.save).toHaveBeenCalled();
      expect(result.product.category.id).toBe('category-1');
      expect(result.product.image).toBeNull();
    });

    it('throws NotFoundException when the category does not exist', async () => {
      categoriesRepository.findOne.mockResolvedValue(null);

      await expect(
        service.createProduct(createDto, 'admin-1'),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(productsRepository.save).not.toHaveBeenCalled();
    });

    it('throws ConflictException when the category is inactive', async () => {
      categoriesRepository.findOne.mockResolvedValue(
        sampleCategory({ isActive: false }),
      );

      await expect(
        service.createProduct(createDto, 'admin-1'),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it('maps a duplicate SKU into ConflictException', async () => {
      categoriesRepository.findOne.mockResolvedValue(sampleCategory());
      productsRepository.save.mockRejectedValue(
        buildUniqueViolation('uq_products_sku'),
      );

      await expect(
        service.createProduct(createDto, 'admin-1'),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it('rethrows an unrelated database error unchanged', async () => {
      categoriesRepository.findOne.mockResolvedValue(sampleCategory());
      const unrelatedError = new Error('connection lost');
      productsRepository.save.mockRejectedValue(unrelatedError);

      await expect(service.createProduct(createDto, 'admin-1')).rejects.toBe(
        unrelatedError,
      );
    });
  });

  describe('patchProduct', () => {
    it('rejects an empty body with BadRequestException', async () => {
      await expect(
        service.patchProduct('id-1', {}, 'admin-1'),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(dataSource.transaction).not.toHaveBeenCalled();
    });

    it('throws NotFoundException when the product does not exist, via a locked read', async () => {
      managerProductRepository.findOne.mockResolvedValue(null);

      await expect(
        service.patchProduct('id-1', { name: 'New name' }, 'admin-1'),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(managerProductRepository.findOne).toHaveBeenCalledWith({
        where: { id: 'id-1' },
        lock: { mode: 'pessimistic_write' },
      });
    });

    it('validates the new category when categoryId changes', async () => {
      managerProductRepository.findOne.mockResolvedValue({
        id: 'id-1',
        categoryId: 'category-1',
        imageId: null,
      });
      managerCategoryRepository.findOne.mockResolvedValue(null);

      await expect(
        service.patchProduct('id-1', { categoryId: 'category-2' }, 'admin-1'),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('updates via the transaction manager, never the default repository', async () => {
      managerProductRepository.findOne.mockResolvedValue({
        id: 'id-1',
        categoryId: 'category-1',
        imageId: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      managerCategoryRepository.findOne.mockResolvedValue(sampleCategory());

      const result = await service.patchProduct(
        'id-1',
        {
          priceVnd: '160000',
        },
        'admin-1',
      );

      expect(managerProductRepository.update).toHaveBeenCalledWith('id-1', {
        priceVnd: '160000',
      });
      expect(productsRepository.createQueryBuilder).not.toHaveBeenCalled();
      expect(result.product.priceVnd).toBe('160000');
    });

    it('moves the product to a new active category', async () => {
      managerProductRepository.findOne.mockResolvedValue({
        id: 'id-1',
        categoryId: 'category-1',
        imageId: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      managerCategoryRepository.findOne.mockResolvedValue(
        sampleCategory({ id: 'category-2', name: 'Đồ chơi' }),
      );

      const result = await service.patchProduct(
        'id-1',
        {
          categoryId: 'category-2',
        },
        'admin-1',
      );

      expect(managerProductRepository.update).toHaveBeenCalledWith('id-1', {
        categoryId: 'category-2',
      });
      expect(result.product.category.id).toBe('category-2');
    });

    it('re-fetches the current image when the product already has one', async () => {
      managerProductRepository.findOne.mockResolvedValue({
        id: 'id-1',
        categoryId: 'category-1',
        imageId: 'attachment-1',
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      managerCategoryRepository.findOne.mockResolvedValue(sampleCategory());
      const imageBuilder = mockQueryBuilder();
      imageBuilder.getOne.mockResolvedValue({
        id: 'id-1',
        image: { id: 'attachment-1', mimeType: 'image/png', sizeBytes: 10 },
      });
      managerProductRepository.createQueryBuilder.mockReturnValue(imageBuilder);

      const result = await service.patchProduct(
        'id-1',
        {
          isFeatured: true,
        },
        'admin-1',
      );

      expect(result.product.image?.id).toBe('attachment-1');
    });

    it('maps a duplicate SKU into ConflictException', async () => {
      managerProductRepository.findOne.mockResolvedValue({
        id: 'id-1',
        categoryId: 'category-1',
        imageId: null,
      });
      managerCategoryRepository.findOne.mockResolvedValue(sampleCategory());
      managerProductRepository.update.mockRejectedValue(
        buildUniqueViolation('uq_products_sku'),
      );

      await expect(
        service.patchProduct('id-1', { sku: 'DUP-001' }, 'admin-1'),
      ).rejects.toBeInstanceOf(ConflictException);
    });
  });

  describe('archiveProduct', () => {
    it('throws NotFoundException for an unknown product', async () => {
      managerProductRepository.findOne.mockResolvedValue(null);

      await expect(
        service.archiveProduct('id-1', 'admin-1'),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('sets isActive=false via the transaction manager', async () => {
      managerProductRepository.findOne.mockResolvedValue({ id: 'id-1' });

      await service.archiveProduct('id-1', 'admin-1');

      expect(managerProductRepository.update).toHaveBeenCalledWith('id-1', {
        isActive: false,
      });
    });
  });

  describe('replaceProductImage', () => {
    const file = {
      mimetype: 'image/png',
      buffer: Buffer.from('fake'),
      size: 4,
    } as Express.Multer.File;

    it('rejects when no file is provided', async () => {
      await expect(
        service.replaceProductImage('id-1', undefined, 'admin-1'),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(attachmentsService.validateImageFile).not.toHaveBeenCalled();
    });

    it('propagates validation failure from AttachmentsService without writing a file', async () => {
      attachmentsService.validateImageFile.mockImplementation(() => {
        throw new UnsupportedMediaTypeException('bad file');
      });

      await expect(
        service.replaceProductImage('id-1', file, 'admin-1'),
      ).rejects.toBeInstanceOf(UnsupportedMediaTypeException);
      expect(attachmentsService.writeImageFile).not.toHaveBeenCalled();
    });

    it('cleans up the new file when the transaction fails, and keeps no leftover state', async () => {
      attachmentsService.writeImageFile.mockResolvedValue('new-key.png');
      managerProductRepository.findOne.mockResolvedValue(null); // product not found -> throws inside tx

      await expect(
        service.replaceProductImage('id-1', file, 'admin-1'),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(attachmentsService.deleteFileByStorageKey).toHaveBeenCalledWith(
        'new-key.png',
      );
    });

    it('links the new attachment and deletes the old one only after commit (no previous image)', async () => {
      attachmentsService.writeImageFile.mockResolvedValue('new-key.png');
      managerProductRepository.findOne.mockResolvedValue({
        id: 'id-1',
        categoryId: 'category-1',
        imageId: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      attachmentsService.createAttachmentRecord.mockResolvedValue({
        id: 'attachment-1',
        mimeType: 'image/png',
        sizeBytes: 4,
      });
      categoriesRepository.findOne.mockResolvedValue(sampleCategory());

      const result = await service.replaceProductImage('id-1', file, 'admin-1');

      expect(managerProductRepository.update).toHaveBeenCalledWith('id-1', {
        imageId: 'attachment-1',
      });
      expect(attachmentsService.findStorageKeyById).not.toHaveBeenCalled();
      expect(attachmentsService.deleteAttachmentRecord).not.toHaveBeenCalled();
      expect(attachmentsService.deleteFileByStorageKey).not.toHaveBeenCalled();
      expect(result.product.image?.id).toBe('attachment-1');
    });

    it('deletes the previous attachment row and its file after replacing the image', async () => {
      attachmentsService.writeImageFile.mockResolvedValue('new-key.png');
      managerProductRepository.findOne.mockResolvedValue({
        id: 'id-1',
        categoryId: 'category-1',
        imageId: 'old-attachment',
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      attachmentsService.createAttachmentRecord.mockResolvedValue({
        id: 'attachment-1',
        mimeType: 'image/png',
        sizeBytes: 4,
      });
      attachmentsService.findStorageKeyById.mockResolvedValue('old-key.png');
      categoriesRepository.findOne.mockResolvedValue(sampleCategory());

      await service.replaceProductImage('id-1', file, 'admin-1');

      expect(attachmentsService.deleteAttachmentRecord).toHaveBeenCalledWith(
        'old-attachment',
        manager,
      );
      expect(attachmentsService.deleteFileByStorageKey).toHaveBeenCalledWith(
        'old-key.png',
      );
      expect(
        attachmentsService.deleteFileByStorageKey,
      ).not.toHaveBeenCalledWith('new-key.png');
    });
  });

  describe('deleteProductImage', () => {
    it('throws NotFoundException for an unknown product', async () => {
      managerProductRepository.findOne.mockResolvedValue(null);

      await expect(
        service.deleteProductImage('id-1', 'admin-1'),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('is a no-op (still 204) when the product has no image', async () => {
      managerProductRepository.findOne.mockResolvedValue({
        id: 'id-1',
        imageId: null,
      });

      await service.deleteProductImage('id-1', 'admin-1');

      expect(attachmentsService.findStorageKeyById).not.toHaveBeenCalled();
      expect(managerProductRepository.update).not.toHaveBeenCalled();
    });

    it('unlinks the image and deletes the file only after commit', async () => {
      managerProductRepository.findOne.mockResolvedValue({
        id: 'id-1',
        imageId: 'attachment-1',
      });
      attachmentsService.findStorageKeyById.mockResolvedValue('key.png');

      await service.deleteProductImage('id-1', 'admin-1');

      expect(managerProductRepository.update).toHaveBeenCalledWith('id-1', {
        imageId: null,
      });
      expect(attachmentsService.deleteAttachmentRecord).toHaveBeenCalledWith(
        'attachment-1',
        manager,
      );
      expect(attachmentsService.deleteFileByStorageKey).toHaveBeenCalledWith(
        'key.png',
      );
    });
  });
});
