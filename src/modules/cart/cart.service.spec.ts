import { ConflictException, NotFoundException } from '@nestjs/common';
import { I18nService } from 'nestjs-i18n';
import { DataSource, EntityManager, Repository } from 'typeorm';
import { Product } from '../products/entities/product.entity';
import { User } from '../users/entities/user.entity';
import { CartService } from './cart.service';
import { MAX_CART_LINES_PER_USER } from './constants/cart.constants';
import { CartItem } from './entities/cart-item.entity';

function mockQueryBuilder() {
  const builder: Record<string, jest.Mock> = {};
  for (const method of [
    'innerJoin',
    'select',
    'where',
    'andWhere',
    'orderBy',
    'addOrderBy',
  ]) {
    builder[method] = jest.fn().mockReturnThis();
  }
  builder.getOne = jest.fn();
  builder.getMany = jest.fn().mockResolvedValue([]);
  return builder;
}

function sampleProduct(overrides: Record<string, unknown> = {}) {
  return {
    id: 'product-1',
    name: 'Sổ tay NestJS',
    priceVnd: '150000',
    stock: 10,
    isActive: true,
    category: { id: 'category-1', isActive: true },
    ...overrides,
  };
}

function sampleCartItem(overrides: Record<string, unknown> = {}): CartItem {
  return {
    id: 'cart-item-1',
    productId: 'product-1',
    quantity: 2,
    product: sampleProduct(),
    ...overrides,
  } as unknown as CartItem;
}

describe('CartService', () => {
  let cartItemsRepository: jest.Mocked<
    Pick<Repository<CartItem>, 'createQueryBuilder'>
  >;
  let i18n: { t: jest.Mock };
  let dataSource: { transaction: jest.Mock };
  let managerUserRepository: { findOne: jest.Mock };
  let managerProductRepository: { createQueryBuilder: jest.Mock };
  let managerCartItemRepository: {
    findOne: jest.Mock;
    count: jest.Mock;
    create: jest.Mock;
    insert: jest.Mock;
    update: jest.Mock;
    delete: jest.Mock;
    createQueryBuilder: jest.Mock;
  };
  let manager: { getRepository: jest.Mock };
  let service: CartService;

  beforeEach(() => {
    cartItemsRepository = { createQueryBuilder: jest.fn() };
    i18n = { t: jest.fn((key: string) => key) };

    managerUserRepository = {
      findOne: jest.fn().mockResolvedValue({ id: 'user-1' }),
    };
    managerProductRepository = { createQueryBuilder: jest.fn() };
    managerCartItemRepository = {
      findOne: jest.fn(),
      count: jest.fn(),
      create: jest.fn((data: Partial<CartItem>) => data as CartItem),
      insert: jest.fn(),
      update: jest.fn(),
      delete: jest.fn().mockResolvedValue({ affected: 0 }),
      createQueryBuilder: jest.fn(),
    };
    manager = {
      getRepository: jest.fn((entity: unknown) => {
        if (entity === User) return managerUserRepository;
        if (entity === Product) return managerProductRepository;
        if (entity === CartItem) return managerCartItemRepository;
        throw new Error('unexpected entity requested from manager');
      }),
    };
    dataSource = {
      transaction: jest.fn((callback: (m: EntityManager) => Promise<unknown>) =>
        callback(manager as unknown as EntityManager),
      ),
    };

    service = new CartService(
      cartItemsRepository as unknown as Repository<CartItem>,
      dataSource as unknown as DataSource,
      i18n as unknown as I18nService,
    );
  });

  describe('getCart', () => {
    it('marks a line unavailable when stock is below the requested quantity', async () => {
      const builder = mockQueryBuilder();
      builder.getMany.mockResolvedValue([
        sampleCartItem({ quantity: 20, product: sampleProduct({ stock: 5 }) }),
      ]);
      cartItemsRepository.createQueryBuilder.mockReturnValue(builder);

      const result = await service.getCart('user-1');

      expect(result.cart.items[0].available).toBe(false);
    });

    it('sums lineTotalVnd across all lines into totalVnd, including unavailable lines', async () => {
      const builder = mockQueryBuilder();
      builder.getMany.mockResolvedValue([
        sampleCartItem({ productId: 'product-1', quantity: 2 }),
        sampleCartItem({
          productId: 'product-2',
          quantity: 1,
          product: sampleProduct({ id: 'product-2', isActive: false }),
        }),
      ]);
      cartItemsRepository.createQueryBuilder.mockReturnValue(builder);

      const result = await service.getCart('user-1');

      expect(result.cart.totalVnd).toBe('450000');
      expect(result.cart.items[1].available).toBe(false);
    });

    it('returns an empty cart with totalVnd "0" when there are no lines', async () => {
      const builder = mockQueryBuilder();
      cartItemsRepository.createQueryBuilder.mockReturnValue(builder);

      const result = await service.getCart('user-1');

      expect(result.cart).toEqual({ items: [], totalVnd: '0' });
    });
  });

  describe('setCartItem', () => {
    function stubVisibleProduct(stock: number): void {
      const productBuilder = mockQueryBuilder();
      productBuilder.getOne.mockResolvedValue({ id: 'product-1', stock });
      managerProductRepository.createQueryBuilder.mockReturnValue(
        productBuilder,
      );
    }

    function stubFinalCartRead(): void {
      const cartBuilder = mockQueryBuilder();
      cartBuilder.getMany.mockResolvedValue([]);
      managerCartItemRepository.createQueryBuilder.mockReturnValue(cartBuilder);
    }

    it('throws NotFoundException when the product is not visible', async () => {
      const productBuilder = mockQueryBuilder();
      productBuilder.getOne.mockResolvedValue(null);
      managerProductRepository.createQueryBuilder.mockReturnValue(
        productBuilder,
      );

      await expect(
        service.setCartItem('user-1', 'product-1', 2),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('locks the user row before touching the cart', async () => {
      stubVisibleProduct(10);
      managerCartItemRepository.findOne.mockResolvedValue(null);
      managerCartItemRepository.count.mockResolvedValue(0);
      stubFinalCartRead();

      await service.setCartItem('user-1', 'product-1', 2);

      expect(managerUserRepository.findOne).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'user-1' },
          lock: { mode: 'pessimistic_write' },
        }),
      );
    });

    it('throws NotFoundException when the authenticated user row is missing', async () => {
      managerUserRepository.findOne.mockResolvedValue(null);

      await expect(
        service.setCartItem('user-1', 'product-1', 2),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('throws ConflictException when quantity exceeds stock', async () => {
      stubVisibleProduct(1);

      await expect(
        service.setCartItem('user-1', 'product-1', 2),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it('inserts a new line via create()+insert() when none exists', async () => {
      stubVisibleProduct(10);
      managerCartItemRepository.findOne.mockResolvedValue(null);
      managerCartItemRepository.count.mockResolvedValue(0);
      stubFinalCartRead();

      await service.setCartItem('user-1', 'product-1', 3);

      expect(managerCartItemRepository.create).toHaveBeenCalledWith({
        userId: 'user-1',
        productId: 'product-1',
        quantity: 3,
      });
      expect(managerCartItemRepository.insert).toHaveBeenCalled();
      expect(managerCartItemRepository.update).not.toHaveBeenCalled();
    });

    it('updates the existing line via update() instead of inserting a duplicate', async () => {
      stubVisibleProduct(10);
      managerCartItemRepository.findOne.mockResolvedValue({
        id: 'cart-item-1',
      });
      stubFinalCartRead();

      await service.setCartItem('user-1', 'product-1', 5);

      expect(managerCartItemRepository.update).toHaveBeenCalledWith(
        'cart-item-1',
        { quantity: 5 },
      );
      expect(managerCartItemRepository.insert).not.toHaveBeenCalled();
      expect(managerCartItemRepository.count).not.toHaveBeenCalled();
    });

    it('throws ConflictException when adding a new line would exceed the 20-line limit', async () => {
      stubVisibleProduct(10);
      managerCartItemRepository.findOne.mockResolvedValue(null);
      managerCartItemRepository.count.mockResolvedValue(
        MAX_CART_LINES_PER_USER,
      );

      await expect(
        service.setCartItem('user-1', 'product-1', 1),
      ).rejects.toBeInstanceOf(ConflictException);
      expect(managerCartItemRepository.insert).not.toHaveBeenCalled();
    });
  });

  describe('removeCartItem', () => {
    it('locks the user row, then deletes by userId+productId', async () => {
      await service.removeCartItem('user-1', 'product-1');

      expect(managerUserRepository.findOne).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'user-1' },
          lock: { mode: 'pessimistic_write' },
        }),
      );
      expect(managerCartItemRepository.delete).toHaveBeenCalledWith({
        userId: 'user-1',
        productId: 'product-1',
      });
    });

    it('resolves even when no matching line exists (idempotent)', async () => {
      managerCartItemRepository.delete.mockResolvedValue({ affected: 0 });

      await expect(
        service.removeCartItem('user-1', 'product-1'),
      ).resolves.toBeUndefined();
    });
  });
});
