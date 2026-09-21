import { ConflictException, NotFoundException } from '@nestjs/common';
import { I18nService } from 'nestjs-i18n';
import { DataSource, EntityManager, Repository } from 'typeorm';
import { CreateSuggestionDto } from './dto/create-suggestion.dto';
import { ReviewSuggestionDto } from './dto/review-suggestion.dto';
import { ProductSuggestion } from './entities/product-suggestion.entity';
import { ProductSuggestionStatus } from './enums/product-suggestion-status.enum';
import { ProductSuggestionsService } from './product-suggestions.service';

function mockQueryBuilder() {
  const builder: Record<string, jest.Mock> = {};
  for (const method of [
    'innerJoin',
    'select',
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

function sampleSuggestion(
  overrides: Partial<ProductSuggestion> = {},
): ProductSuggestion {
  return {
    id: 'suggestion-1',
    customerId: 'customer-1',
    name: 'Bàn phím cơ',
    description: null,
    categoryName: null,
    status: ProductSuggestionStatus.PENDING,
    reviewedBy: null,
    reviewReason: null,
    reviewedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  } as ProductSuggestion;
}

describe('ProductSuggestionsService', () => {
  let suggestionsRepository: jest.Mocked<
    Pick<
      Repository<ProductSuggestion>,
      'exists' | 'create' | 'save' | 'createQueryBuilder'
    >
  >;
  let i18n: { t: jest.Mock };
  let dataSource: { transaction: jest.Mock };
  let managerSuggestionsRepository: {
    findOne: jest.Mock;
    update: jest.Mock;
    findOneOrFail: jest.Mock;
  };
  let manager: { getRepository: jest.Mock };
  let service: ProductSuggestionsService;

  beforeEach(() => {
    suggestionsRepository = {
      exists: jest.fn().mockResolvedValue(false),
      create: jest.fn(
        (data: Partial<ProductSuggestion>) => data as ProductSuggestion,
      ),
      save: jest.fn((entity: ProductSuggestion) => {
        entity.id ??= 'suggestion-1';
        entity.createdAt ??= new Date();
        entity.updatedAt ??= new Date();
        return Promise.resolve(entity);
      }),
      createQueryBuilder: jest.fn(),
    };
    i18n = { t: jest.fn((key: string) => key) };

    managerSuggestionsRepository = {
      findOne: jest.fn(),
      update: jest.fn().mockResolvedValue({ affected: 1 }),
      findOneOrFail: jest.fn(),
    };
    manager = {
      getRepository: jest.fn((entity: unknown) => {
        if (entity === ProductSuggestion) return managerSuggestionsRepository;
        throw new Error('unexpected entity requested from manager');
      }),
    };
    dataSource = {
      transaction: jest.fn((callback: (m: EntityManager) => Promise<unknown>) =>
        callback(manager as unknown as EntityManager),
      ),
    };

    service = new ProductSuggestionsService(
      suggestionsRepository as unknown as Repository<ProductSuggestion>,
      dataSource as unknown as DataSource,
      i18n as unknown as I18nService,
    );
  });

  describe('create', () => {
    const dto: CreateSuggestionDto = { name: 'Bàn phím cơ' };

    it('throws ConflictException when the customer already has a PENDING suggestion with the same name', async () => {
      suggestionsRepository.exists.mockResolvedValue(true);

      await expect(service.create('customer-1', dto)).rejects.toBeInstanceOf(
        ConflictException,
      );
      expect(suggestionsRepository.save).not.toHaveBeenCalled();
    });

    it('checks for a duplicate via .exists() rather than findOne()', async () => {
      await service.create('customer-1', dto);

      expect(suggestionsRepository.exists).toHaveBeenCalledWith({
        where: {
          customerId: 'customer-1',
          name: 'Bàn phím cơ',
          status: ProductSuggestionStatus.PENDING,
        },
      });
    });

    it('creates the suggestion with status PENDING, ignoring any client-sent status', async () => {
      const result = await service.create('customer-1', dto);

      expect(suggestionsRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          customerId: 'customer-1',
          name: 'Bàn phím cơ',
          status: ProductSuggestionStatus.PENDING,
        }),
      );
      expect(result.suggestion.status).toBe(ProductSuggestionStatus.PENDING);
    });
  });

  describe('listForCustomer', () => {
    it('filters to the current customer only', async () => {
      const builder = mockQueryBuilder();
      suggestionsRepository.createQueryBuilder.mockReturnValue(builder);

      await service.listForCustomer('customer-1', { limit: 20, offset: 0 });

      expect(builder.where).toHaveBeenCalledWith(
        'suggestion.customerId = :customerId',
        { customerId: 'customer-1' },
      );
    });
  });

  describe('listForAdmin', () => {
    it('does not filter by customer by default', async () => {
      const builder = mockQueryBuilder();
      suggestionsRepository.createQueryBuilder.mockReturnValue(builder);

      await service.listForAdmin({ limit: 20, offset: 0 });

      expect(builder.andWhere).not.toHaveBeenCalledWith(
        expect.stringContaining('customerId'),
        expect.anything(),
      );
    });

    it('applies status, userId and escaped keyword filters when provided', async () => {
      const builder = mockQueryBuilder();
      suggestionsRepository.createQueryBuilder.mockReturnValue(builder);

      await service.listForAdmin({
        limit: 20,
        offset: 0,
        status: ProductSuggestionStatus.PENDING,
        userId: 'customer-1',
        keyword: '50%_off',
      });

      expect(builder.andWhere).toHaveBeenCalledWith(
        'suggestion.status = :status',
        { status: ProductSuggestionStatus.PENDING },
      );
      expect(builder.andWhere).toHaveBeenCalledWith(
        'suggestion.customerId = :userId',
        { userId: 'customer-1' },
      );
      expect(builder.andWhere).toHaveBeenCalledWith(
        expect.stringContaining('ILIKE'),
        { keyword: '%50\\%\\_off%' },
      );
    });
  });

  describe('getDetailForAdmin', () => {
    it('throws NotFoundException when missing', async () => {
      const builder = mockQueryBuilder();
      builder.getOne.mockResolvedValue(null);
      suggestionsRepository.createQueryBuilder.mockReturnValue(builder);

      await expect(
        service.getDetailForAdmin('missing-id'),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('only selects customer id/username, never email/password/token', async () => {
      const builder = mockQueryBuilder();
      builder.getOne.mockResolvedValue({
        ...sampleSuggestion(),
        customer: { id: 'customer-1', username: 'seed_alice' },
      });
      suggestionsRepository.createQueryBuilder.mockReturnValue(builder);

      await service.getDetailForAdmin('suggestion-1');

      expect(builder.select).toHaveBeenCalledWith(
        expect.arrayContaining(['customer.id', 'customer.username']),
      );
      expect(builder.select).not.toHaveBeenCalledWith(
        expect.arrayContaining([expect.stringContaining('email')]),
      );
      expect(builder.select).not.toHaveBeenCalledWith(
        expect.arrayContaining([expect.stringContaining('password')]),
      );
    });
  });

  describe('reviewByAdmin', () => {
    const reviewDto: ReviewSuggestionDto = {
      status: ProductSuggestionStatus.APPROVED,
    };

    it('locks the suggestion row with pessimistic_write', async () => {
      managerSuggestionsRepository.findOne.mockResolvedValue(
        sampleSuggestion(),
      );
      managerSuggestionsRepository.findOneOrFail.mockResolvedValue(
        sampleSuggestion({ status: ProductSuggestionStatus.APPROVED }),
      );

      await service.reviewByAdmin('suggestion-1', 'admin-1', reviewDto);

      expect(managerSuggestionsRepository.findOne).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'suggestion-1' },
          lock: { mode: 'pessimistic_write' },
        }),
      );
    });

    it('throws NotFoundException when the suggestion does not exist', async () => {
      managerSuggestionsRepository.findOne.mockResolvedValue(null);

      await expect(
        service.reviewByAdmin('missing-id', 'admin-1', reviewDto),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('throws ConflictException when the suggestion is no longer PENDING', async () => {
      managerSuggestionsRepository.findOne.mockResolvedValue(
        sampleSuggestion({ status: ProductSuggestionStatus.APPROVED }),
      );

      await expect(
        service.reviewByAdmin('suggestion-1', 'admin-1', reviewDto),
      ).rejects.toBeInstanceOf(ConflictException);
      expect(managerSuggestionsRepository.update).not.toHaveBeenCalled();
    });

    it('approves without a reviewReason', async () => {
      managerSuggestionsRepository.findOne.mockResolvedValue(
        sampleSuggestion(),
      );
      managerSuggestionsRepository.findOneOrFail.mockResolvedValue(
        sampleSuggestion({ status: ProductSuggestionStatus.APPROVED }),
      );

      await service.reviewByAdmin('suggestion-1', 'admin-1', reviewDto);

      expect(managerSuggestionsRepository.update).toHaveBeenCalledWith(
        'suggestion-1',
        expect.objectContaining({
          status: ProductSuggestionStatus.APPROVED,
          reviewedBy: 'admin-1',
          reviewReason: null,
        }),
      );
    });

    it('rejects with a trimmed reviewReason', async () => {
      managerSuggestionsRepository.findOne.mockResolvedValue(
        sampleSuggestion(),
      );
      managerSuggestionsRepository.findOneOrFail.mockResolvedValue(
        sampleSuggestion({ status: ProductSuggestionStatus.REJECTED }),
      );

      await service.reviewByAdmin('suggestion-1', 'admin-1', {
        status: ProductSuggestionStatus.REJECTED,
        reason: '  not a good fit  ',
      });

      expect(managerSuggestionsRepository.update).toHaveBeenCalledWith(
        'suggestion-1',
        expect.objectContaining({
          status: ProductSuggestionStatus.REJECTED,
          reviewReason: 'not a good fit',
        }),
      );
    });
  });
});
