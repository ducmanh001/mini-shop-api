import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { I18nService } from 'nestjs-i18n';
import { QueryFailedError, Repository } from 'typeorm';
import { Product } from '../products/entities/product.entity';
import { CategoriesService } from './categories.service';
import { Category } from './entities/category.entity';

function buildDriverError(code: string, constraint?: string): QueryFailedError {
  const error = new QueryFailedError('INSERT', [], new Error('db error'));
  (error as unknown as { driverError: unknown }).driverError = {
    code,
    constraint,
  };
  return error;
}

function mockListQueryBuilder(repository: { createQueryBuilder: jest.Mock }) {
  const builder = {
    select: jest.fn().mockReturnThis(),
    orderBy: jest.fn().mockReturnThis(),
    addOrderBy: jest.fn().mockReturnThis(),
    andWhere: jest.fn().mockReturnThis(),
    take: jest.fn().mockReturnThis(),
    skip: jest.fn().mockReturnThis(),
    getManyAndCount: jest.fn().mockResolvedValue([[], 0]),
  };
  repository.createQueryBuilder.mockReturnValue(builder);
  return builder;
}

describe('CategoriesService', () => {
  let categoriesRepository: jest.Mocked<
    Pick<
      Repository<Category>,
      'create' | 'save' | 'update' | 'findOneBy' | 'exists' | 'delete'
    >
  > & { createQueryBuilder: jest.Mock };
  let productsRepository: jest.Mocked<Pick<Repository<Product>, 'exists'>>;
  let i18n: { t: jest.Mock };
  let service: CategoriesService;

  beforeEach(() => {
    categoriesRepository = {
      create: jest.fn((data) => data as Category),
      // Mô phỏng Postgres tự sinh created_at/updated_at khi insert (như DB thật trả về sau save()).
      save: jest.fn((entity: Category) => {
        entity.createdAt ??= new Date();
        entity.updatedAt ??= new Date();
        return entity;
      }),
      update: jest.fn(),
      findOneBy: jest.fn(),
      exists: jest.fn(),
      delete: jest.fn(),
      createQueryBuilder: jest.fn(),
    };
    productsRepository = {
      exists: jest.fn(),
    };
    i18n = { t: jest.fn((key: string) => key) };
    service = new CategoriesService(
      categoriesRepository as unknown as Repository<Category>,
      productsRepository as unknown as Repository<Product>,
      i18n as unknown as I18nService,
    );
  });

  describe('listPublicCategories', () => {
    it('filters to active categories only', async () => {
      const builder = mockListQueryBuilder(categoriesRepository);

      await service.listPublicCategories({ limit: 20, offset: 0 });

      expect(builder.andWhere).toHaveBeenCalledWith('category.isActive = true');
    });
  });

  describe('listAdminCategories', () => {
    it('does not filter by isActive when not provided', async () => {
      const builder = mockListQueryBuilder(categoriesRepository);

      await service.listAdminCategories({ limit: 20, offset: 0 });

      expect(builder.andWhere).not.toHaveBeenCalled();
    });

    it('applies q and isActive filters when provided', async () => {
      const builder = mockListQueryBuilder(categoriesRepository);

      await service.listAdminCategories({
        limit: 20,
        offset: 0,
        q: 'sach',
        isActive: 'false',
      });

      expect(builder.andWhere).toHaveBeenCalledWith(
        'category.isActive = :isActive',
        { isActive: false },
      );
      expect(builder.andWhere).toHaveBeenCalledWith(
        expect.stringContaining('unaccent(category.name) ILIKE unaccent(:q)'),
        { q: '%sach%' },
      );
    });
  });

  describe('createCategory', () => {
    it('creates a category with the given fields', async () => {
      const result = await service.createCategory(
        {
          name: 'Sách',
          slug: 'sach',
          isActive: true,
        },
        'admin-1',
      );

      expect(categoriesRepository.save).toHaveBeenCalled();
      expect(result.category.slug).toBe('sach');
    });

    it('maps a duplicate slug into ConflictException', async () => {
      categoriesRepository.save.mockRejectedValue(
        buildDriverError('23505', 'uq_categories_slug'),
      );

      await expect(
        service.createCategory({ name: 'Sách', slug: 'sach' }, 'admin-1'),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it('rethrows an unrelated database error unchanged', async () => {
      const unrelatedError = new Error('connection lost');
      categoriesRepository.save.mockRejectedValue(unrelatedError);

      await expect(
        service.createCategory({ name: 'Sách', slug: 'sach' }, 'admin-1'),
      ).rejects.toBe(unrelatedError);
    });
  });

  describe('patchCategory', () => {
    it('rejects an empty body', async () => {
      await expect(
        service.patchCategory('id-1', {}, 'admin-1'),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('throws NotFoundException when the category no longer exists', async () => {
      categoriesRepository.findOneBy.mockResolvedValue(null);

      await expect(
        service.patchCategory('id-1', { name: 'Sách mới' }, 'admin-1'),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('updates and returns the fresh category', async () => {
      categoriesRepository.findOneBy.mockResolvedValue({
        id: 'id-1',
        name: 'Sách mới',
        slug: 'sach',
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const result = await service.patchCategory(
        'id-1',
        { name: 'Sách mới' },
        'admin-1',
      );

      expect(categoriesRepository.update).toHaveBeenCalledWith('id-1', {
        name: 'Sách mới',
      });
      expect(result.category.name).toBe('Sách mới');
    });

    it('only patches the fields provided (isActive alone)', async () => {
      categoriesRepository.findOneBy.mockResolvedValue({
        id: 'id-1',
        name: 'Sách',
        slug: 'sach',
        isActive: false,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      await service.patchCategory('id-1', { isActive: false }, 'admin-1');

      expect(categoriesRepository.update).toHaveBeenCalledWith('id-1', {
        isActive: false,
      });
    });

    it('maps a duplicate slug into ConflictException', async () => {
      categoriesRepository.update.mockRejectedValue(
        buildDriverError('23505', 'uq_categories_slug'),
      );

      await expect(
        service.patchCategory('id-1', { slug: 'sach' }, 'admin-1'),
      ).rejects.toBeInstanceOf(ConflictException);
    });
  });

  describe('deleteCategory', () => {
    it('throws NotFoundException when the category does not exist', async () => {
      categoriesRepository.exists.mockResolvedValue(false);

      await expect(
        service.deleteCategory('id-1', 'admin-1'),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('throws ConflictException when the category still has products', async () => {
      categoriesRepository.exists.mockResolvedValue(true);
      productsRepository.exists.mockResolvedValue(true);

      await expect(
        service.deleteCategory('id-1', 'admin-1'),
      ).rejects.toBeInstanceOf(ConflictException);
      expect(categoriesRepository.delete).not.toHaveBeenCalled();
    });

    it('deletes the category when it is empty', async () => {
      categoriesRepository.exists.mockResolvedValue(true);
      productsRepository.exists.mockResolvedValue(false);

      await service.deleteCategory('id-1', 'admin-1');

      expect(categoriesRepository.delete).toHaveBeenCalledWith('id-1');
    });

    it('maps a race-condition FK violation on delete into ConflictException', async () => {
      categoriesRepository.exists.mockResolvedValue(true);
      productsRepository.exists.mockResolvedValue(false);
      categoriesRepository.delete.mockRejectedValue(
        buildDriverError('23503', 'products_category_id_fkey'),
      );

      await expect(
        service.deleteCategory('id-1', 'admin-1'),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it('rethrows an unrelated database error unchanged', async () => {
      categoriesRepository.exists.mockResolvedValue(true);
      productsRepository.exists.mockResolvedValue(false);
      const unrelatedError = new Error('connection lost');
      categoriesRepository.delete.mockRejectedValue(unrelatedError);

      await expect(service.deleteCategory('id-1', 'admin-1')).rejects.toBe(
        unrelatedError,
      );
    });
  });
});
