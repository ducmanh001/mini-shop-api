import { ConflictException, NotFoundException } from '@nestjs/common';
import { I18nService } from 'nestjs-i18n';
import { DataSource, EntityManager } from 'typeorm';
import { Category } from '../categories/entities/category.entity';
import { CartItem } from '../cart/entities/cart-item.entity';
import { EmailNotification } from '../notifications/entities/email-notification.entity';
import { EmailNotificationEventType } from '../notifications/enums/email-notification-event-type.enum';
import { Product } from '../products/entities/product.entity';
import { User } from '../users/entities/user.entity';
import { CreateOrderDto } from './dto/create-order.dto';
import { OrderItem } from './entities/order-item.entity';
import { OrderStatusHistory } from './entities/order-status-history.entity';
import { Order } from './entities/order.entity';
import { OrderStatus } from './enums/order-status.enum';
import { OrdersService } from './orders.service';

function mockQueryBuilder() {
  const builder: Record<string, jest.Mock> = {};
  for (const method of [
    'select',
    'where',
    'andWhere',
    'orderBy',
    'addOrderBy',
    'take',
    'skip',
    'setLock',
    'update',
    'set',
  ]) {
    builder[method] = jest.fn().mockReturnThis();
  }
  builder.getMany = jest.fn().mockResolvedValue([]);
  builder.getManyAndCount = jest.fn().mockResolvedValue([[], 0]);
  builder.execute = jest.fn().mockResolvedValue({ affected: 1 });
  return builder;
}

function sampleDto(overrides: Partial<CreateOrderDto> = {}): CreateOrderDto {
  return {
    recipientName: 'Nguyen An',
    phone: '+84901234567',
    address: '123 Sample Street',
    customerNote: undefined,
    ...overrides,
  };
}

function sampleProduct(overrides: Record<string, unknown> = {}) {
  return {
    id: 'product-1',
    categoryId: 'category-1',
    name: 'Product A',
    sku: 'SKU-A',
    priceVnd: '100000',
    stock: 10,
    isActive: true,
    ...overrides,
  };
}

describe('OrdersService', () => {
  let i18n: { t: jest.Mock };
  let dataSource: { transaction: jest.Mock };
  let manager: { getRepository: jest.Mock };
  let managerUserRepository: { findOne: jest.Mock };
  let managerCartItemRepository: { find: jest.Mock; delete: jest.Mock };
  let managerProductRepository: { createQueryBuilder: jest.Mock };
  let managerCategoryRepository: { createQueryBuilder: jest.Mock };
  let managerOrderRepository: {
    findOne: jest.Mock;
    create: jest.Mock;
    save: jest.Mock;
    update: jest.Mock;
    createQueryBuilder: jest.Mock;
  };
  let managerOrderItemRepository: {
    find: jest.Mock;
    create: jest.Mock;
    save: jest.Mock;
  };
  let managerHistoryRepository: {
    find: jest.Mock;
    create: jest.Mock;
    save: jest.Mock;
  };
  let managerNotificationRepository: { create: jest.Mock; save: jest.Mock };
  let dataSourceOrderRepository: {
    findOne: jest.Mock;
    createQueryBuilder: jest.Mock;
  };
  let dataSourceOrderItemRepository: { find: jest.Mock };
  let dataSourceOrderStatusHistoryRepository: { find: jest.Mock };
  let service: OrdersService;

  beforeEach(() => {
    i18n = { t: jest.fn((key: string) => key) };

    managerUserRepository = {
      findOne: jest
        .fn()
        .mockResolvedValue({ id: 'user-1', email: 'user1@example.test' }),
    };
    managerCartItemRepository = {
      find: jest
        .fn()
        .mockResolvedValue([{ productId: 'product-1', quantity: 2 }]),
      delete: jest.fn().mockResolvedValue({ affected: 1 }),
    };
    managerProductRepository = {
      createQueryBuilder: jest.fn(() => mockQueryBuilder()),
    };
    managerCategoryRepository = {
      createQueryBuilder: jest.fn(() => mockQueryBuilder()),
    };
    managerOrderRepository = {
      findOne: jest.fn().mockResolvedValue(null),
      create: jest.fn((data: Partial<Order>) => data as Order),
      save: jest.fn((data: Order) =>
        Promise.resolve({
          ...data,
          id: 'order-1',
          status: OrderStatus.PENDING,
          createdAt: new Date('2026-01-01T00:00:00.000Z'),
          updatedAt: new Date('2026-01-01T00:00:00.000Z'),
        }),
      ),
      update: jest.fn().mockResolvedValue({ affected: 1 }),
      createQueryBuilder: jest.fn(() => mockQueryBuilder()),
    };
    managerOrderItemRepository = {
      find: jest.fn().mockResolvedValue([]),
      create: jest.fn((data: Partial<OrderItem>) => data as OrderItem),
      save: jest.fn((data: Partial<OrderItem>[]) =>
        Promise.resolve(
          data.map((item, index) => ({ ...item, id: `order-item-${index}` })),
        ),
      ),
    };
    managerHistoryRepository = {
      find: jest.fn().mockResolvedValue([]),
      create: jest.fn(
        (data: Partial<OrderStatusHistory>) => data as OrderStatusHistory,
      ),
      save: jest.fn((data: Partial<OrderStatusHistory>) =>
        Promise.resolve({
          ...data,
          id: 'history-1',
          createdAt: new Date('2026-01-01T00:00:00.000Z'),
        }),
      ),
    };
    managerNotificationRepository = {
      create: jest.fn(
        (data: Partial<EmailNotification>) => data as EmailNotification,
      ),
      save: jest.fn((data: EmailNotification) => Promise.resolve(data)),
    };

    manager = {
      getRepository: jest.fn((entity: unknown) => {
        if (entity === User) return managerUserRepository;
        if (entity === CartItem) return managerCartItemRepository;
        if (entity === Product) return managerProductRepository;
        if (entity === Category) return managerCategoryRepository;
        if (entity === Order) return managerOrderRepository;
        if (entity === OrderItem) return managerOrderItemRepository;
        if (entity === OrderStatusHistory) return managerHistoryRepository;
        if (entity === EmailNotification) return managerNotificationRepository;
        throw new Error('unexpected entity requested from manager');
      }),
    };
    dataSourceOrderRepository = {
      findOne: jest.fn().mockResolvedValue(null),
      createQueryBuilder: jest.fn(() => mockQueryBuilder()),
    };
    dataSourceOrderItemRepository = { find: jest.fn().mockResolvedValue([]) };
    dataSourceOrderStatusHistoryRepository = {
      find: jest.fn().mockResolvedValue([]),
    };

    dataSource = {
      transaction: jest.fn((callback: (m: EntityManager) => Promise<unknown>) =>
        callback(manager as unknown as EntityManager),
      ),
      getRepository: jest.fn((entity: unknown) => {
        if (entity === Order) return dataSourceOrderRepository;
        if (entity === OrderItem) return dataSourceOrderItemRepository;
        if (entity === OrderStatusHistory)
          return dataSourceOrderStatusHistoryRepository;
        throw new Error('unexpected entity requested from dataSource');
      }),
    };

    service = new OrdersService(
      dataSource as unknown as DataSource,
      i18n as unknown as I18nService,
    );
  });

  function stubLockedProduct(overrides: Record<string, unknown> = {}): void {
    const productBuilder = mockQueryBuilder();
    productBuilder.getMany.mockResolvedValue([sampleProduct(overrides)]);
    const categoryBuilder = mockQueryBuilder();
    categoryBuilder.getMany.mockResolvedValue([
      { id: 'category-1', isActive: true },
    ]);
    managerProductRepository.createQueryBuilder
      .mockReturnValueOnce(productBuilder)
      .mockReturnValueOnce(mockQueryBuilder()); // decrement-stock update query
    managerCategoryRepository.createQueryBuilder.mockReturnValueOnce(
      categoryBuilder,
    );
  }

  it('throws NotFoundException when the authenticated user row is missing', async () => {
    managerUserRepository.findOne.mockResolvedValue(null);

    await expect(
      service.checkout(
        'user-1',
        sampleDto(),
        '11111111-1111-4111-8111-111111111111',
      ),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('locks the user row with pessimistic_write before anything else', async () => {
    stubLockedProduct();

    await service.checkout(
      'user-1',
      sampleDto(),
      '11111111-1111-4111-8111-111111111111',
    );

    expect(managerUserRepository.findOne).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'user-1' },
        lock: { mode: 'pessimistic_write' },
      }),
    );
  });

  it('throws ConflictException when the cart is empty', async () => {
    managerCartItemRepository.find.mockResolvedValue([]);

    await expect(
      service.checkout(
        'user-1',
        sampleDto(),
        '11111111-1111-4111-8111-111111111111',
      ),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('throws ConflictException when a cart product is inactive', async () => {
    stubLockedProduct({ isActive: false });

    await expect(
      service.checkout(
        'user-1',
        sampleDto(),
        '11111111-1111-4111-8111-111111111111',
      ),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it("throws ConflictException when a cart product's category is inactive", async () => {
    const productBuilder = mockQueryBuilder();
    productBuilder.getMany.mockResolvedValue([sampleProduct()]);
    const categoryBuilder = mockQueryBuilder();
    categoryBuilder.getMany.mockResolvedValue([
      { id: 'category-1', isActive: false },
    ]);
    managerProductRepository.createQueryBuilder.mockReturnValueOnce(
      productBuilder,
    );
    managerCategoryRepository.createQueryBuilder.mockReturnValueOnce(
      categoryBuilder,
    );

    await expect(
      service.checkout(
        'user-1',
        sampleDto(),
        '11111111-1111-4111-8111-111111111111',
      ),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('throws ConflictException when the requested quantity exceeds locked stock', async () => {
    stubLockedProduct({ stock: 1 });

    await expect(
      service.checkout(
        'user-1',
        sampleDto(),
        '11111111-1111-4111-8111-111111111111',
      ),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('throws ConflictException when the atomic stock decrement affects zero rows', async () => {
    const productBuilder = mockQueryBuilder();
    productBuilder.getMany.mockResolvedValue([sampleProduct()]);
    const decrementBuilder = mockQueryBuilder();
    decrementBuilder.execute.mockResolvedValue({ affected: 0 });
    const categoryBuilder = mockQueryBuilder();
    categoryBuilder.getMany.mockResolvedValue([
      { id: 'category-1', isActive: true },
    ]);
    managerProductRepository.createQueryBuilder
      .mockReturnValueOnce(productBuilder)
      .mockReturnValueOnce(decrementBuilder);
    managerCategoryRepository.createQueryBuilder.mockReturnValueOnce(
      categoryBuilder,
    );

    await expect(
      service.checkout(
        'user-1',
        sampleDto(),
        '11111111-1111-4111-8111-111111111111',
      ),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('creates the order, items, history and notification, then clears the cart', async () => {
    stubLockedProduct();

    const result = await service.checkout(
      'user-1',
      sampleDto(),
      '11111111-1111-4111-8111-111111111111',
    );

    expect(result.isNew).toBe(true);
    expect(result.order.order.id).toBe('order-1');
    expect(result.order.order.totalVnd).toBe('200000');
    expect(managerOrderRepository.save).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'user-1',
        idempotencyKey: '11111111-1111-4111-8111-111111111111',
      }),
    );
    expect(managerHistoryRepository.save).toHaveBeenCalledWith(
      expect.objectContaining({
        fromStatus: null,
        toStatus: OrderStatus.PENDING,
      }),
    );
    expect(managerNotificationRepository.save).toHaveBeenCalledWith(
      expect.objectContaining({
        orderId: 'order-1',
        recipientEmail: 'user1@example.test',
      }),
    );
    expect(managerCartItemRepository.delete).toHaveBeenCalledWith({
      userId: 'user-1',
    });
  });

  it('sorts product IDs ascending before locking to keep a consistent lock order', async () => {
    managerCartItemRepository.find.mockResolvedValue([
      { productId: 'product-2', quantity: 1 },
      { productId: 'product-1', quantity: 1 },
    ]);
    const productBuilder = mockQueryBuilder();
    productBuilder.getMany.mockResolvedValue([
      sampleProduct({ id: 'product-1' }),
      sampleProduct({ id: 'product-2' }),
    ]);
    const categoryBuilder = mockQueryBuilder();
    categoryBuilder.getMany.mockResolvedValue([
      { id: 'category-1', isActive: true },
    ]);
    const decrementBuilder = mockQueryBuilder();
    decrementBuilder.execute.mockResolvedValue({ affected: 2 });
    managerProductRepository.createQueryBuilder
      .mockReturnValueOnce(productBuilder)
      .mockReturnValueOnce(decrementBuilder);
    managerCategoryRepository.createQueryBuilder.mockReturnValueOnce(
      categoryBuilder,
    );

    await service.checkout(
      'user-1',
      sampleDto(),
      '11111111-1111-4111-8111-111111111111',
    );

    expect(productBuilder.where).toHaveBeenCalledWith(expect.any(String), {
      productIds: ['product-1', 'product-2'],
    });
    expect(productBuilder.setLock).toHaveBeenCalledWith('pessimistic_write');
    expect(categoryBuilder.setLock).toHaveBeenCalledWith('pessimistic_read');
  });

  it('decrements stock for every cart line in a single UPDATE instead of one per line', async () => {
    managerCartItemRepository.find.mockResolvedValue([
      { productId: 'product-1', quantity: 2 },
      { productId: 'product-2', quantity: 5 },
    ]);
    const productBuilder = mockQueryBuilder();
    productBuilder.getMany.mockResolvedValue([
      sampleProduct({ id: 'product-1' }),
      sampleProduct({ id: 'product-2' }),
    ]);
    const categoryBuilder = mockQueryBuilder();
    categoryBuilder.getMany.mockResolvedValue([
      { id: 'category-1', isActive: true },
    ]);
    const decrementBuilder = mockQueryBuilder();
    decrementBuilder.execute.mockResolvedValue({ affected: 2 });
    managerProductRepository.createQueryBuilder
      .mockReturnValueOnce(productBuilder)
      .mockReturnValueOnce(decrementBuilder);
    managerCategoryRepository.createQueryBuilder.mockReturnValueOnce(
      categoryBuilder,
    );

    await service.checkout(
      'user-1',
      sampleDto(),
      '11111111-1111-4111-8111-111111111111',
    );

    expect(managerProductRepository.createQueryBuilder).toHaveBeenCalledTimes(
      2,
    );
    expect(decrementBuilder.where).toHaveBeenCalledWith(expect.any(String), {
      productId0: 'product-1',
      quantity0: 2,
      productId1: 'product-2',
      quantity1: 5,
    });
  });

  it('throws ConflictException when fewer rows are updated than cart lines (one line ran out of stock)', async () => {
    managerCartItemRepository.find.mockResolvedValue([
      { productId: 'product-1', quantity: 1 },
      { productId: 'product-2', quantity: 1 },
    ]);
    const productBuilder = mockQueryBuilder();
    productBuilder.getMany.mockResolvedValue([
      sampleProduct({ id: 'product-1' }),
      sampleProduct({ id: 'product-2' }),
    ]);
    const categoryBuilder = mockQueryBuilder();
    categoryBuilder.getMany.mockResolvedValue([
      { id: 'category-1', isActive: true },
    ]);
    const decrementBuilder = mockQueryBuilder();
    decrementBuilder.execute.mockResolvedValue({ affected: 1 });
    managerProductRepository.createQueryBuilder
      .mockReturnValueOnce(productBuilder)
      .mockReturnValueOnce(decrementBuilder);
    managerCategoryRepository.createQueryBuilder.mockReturnValueOnce(
      categoryBuilder,
    );

    await expect(
      service.checkout(
        'user-1',
        sampleDto(),
        '11111111-1111-4111-8111-111111111111',
      ),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  describe('replay (same Idempotency-Key)', () => {
    const existingOrder = {
      id: 'order-1',
      userId: 'user-1',
      idempotencyKey: '11111111-1111-4111-8111-111111111111',
      requestHash: 'existing-hash',
      status: OrderStatus.PENDING,
      totalVnd: '200000',
      paymentMethod: 'COD' as const,
      recipientName: 'Nguyen An',
      phone: '+84901234567',
      addressSnapshot: '123 Sample Street',
      customerNote: null,
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
      updatedAt: new Date('2026-01-01T00:00:00.000Z'),
    };

    it('returns the existing order with isNew=false when the hash matches, without touching the cart', async () => {
      managerOrderRepository.findOne.mockResolvedValue(existingOrder);
      jest
        .spyOn(
          service as unknown as { hashRequest(canonical: string): string },
          'hashRequest',
        )
        .mockReturnValue('existing-hash');

      const result = await service.checkout(
        'user-1',
        sampleDto(),
        '11111111-1111-4111-8111-111111111111',
      );

      expect(result.isNew).toBe(false);
      expect(result.order.order.id).toBe('order-1');
      expect(managerCartItemRepository.find).not.toHaveBeenCalled();
      expect(managerCartItemRepository.delete).not.toHaveBeenCalled();
    });

    it('throws ConflictException when the same key is replayed with a different body', async () => {
      managerOrderRepository.findOne.mockResolvedValue(existingOrder);
      jest
        .spyOn(
          service as unknown as { hashRequest(canonical: string): string },
          'hashRequest',
        )
        .mockReturnValue('a-different-hash');

      await expect(
        service.checkout(
          'user-1',
          sampleDto(),
          '11111111-1111-4111-8111-111111111111',
        ),
      ).rejects.toBeInstanceOf(ConflictException);
      expect(managerCartItemRepository.find).not.toHaveBeenCalled();
    });
  });

  /** Cho `.update()` trên order ảnh hưởng tới lần `.findOne()` kế tiếp — mô phỏng tối thiểu 1 row thật. */
  function stubStatefulOrderRow(initial: Record<string, unknown>) {
    let row = { ...initial };
    managerOrderRepository.findOne.mockImplementation(() =>
      Promise.resolve({ ...row }),
    );
    managerOrderRepository.update.mockImplementation(
      (_id: string, payload: Record<string, unknown>) => {
        row = { ...row, ...payload };
        return Promise.resolve({ affected: 1 });
      },
    );
  }

  function stubRestock(
    items: { productId: string; quantity: number }[] = [
      { productId: 'product-1', quantity: 2 },
    ],
  ): void {
    managerOrderItemRepository.find.mockResolvedValue(items);
    managerProductRepository.createQueryBuilder
      .mockReturnValueOnce(mockQueryBuilder()) // lockProducts (SELECT ... FOR UPDATE)
      .mockReturnValueOnce(mockQueryBuilder()); // restockProductStock (UPDATE ... CASE)
  }

  const samplePendingOrder = {
    id: 'order-1',
    userId: 'user-1',
    status: OrderStatus.PENDING,
    paymentMethod: 'COD' as const,
    recipientName: 'Nguyen An',
    phone: '+84901234567',
    addressSnapshot: '123 Sample Street',
    customerNote: null,
    totalVnd: '200000',
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    updatedAt: new Date('2026-01-01T00:00:00.000Z'),
  };

  describe('listForCustomer (ORDER-02)', () => {
    it('scopes the query to the current user and applies the status filter', async () => {
      const builder = mockQueryBuilder();
      builder.getManyAndCount.mockResolvedValue([
        [{ id: 'order-1', userId: 'user-1' }],
        1,
      ]);
      dataSourceOrderRepository.createQueryBuilder.mockReturnValue(builder);

      const result = await service.listForCustomer('user-1', {
        limit: 20,
        offset: 0,
        status: OrderStatus.PENDING,
      });

      expect(builder.where).toHaveBeenCalledWith('order.userId = :userId', {
        userId: 'user-1',
      });
      expect(builder.andWhere).toHaveBeenCalledWith('order.status = :status', {
        status: OrderStatus.PENDING,
      });
      expect(result.ordersCount).toBe(1);
      expect(result.orders).toHaveLength(1);
    });
  });

  describe('getDetailForCustomer (ORDER-03)', () => {
    it('throws NotFoundException for an order that does not belong to the user', async () => {
      dataSourceOrderRepository.findOne.mockResolvedValue(null);

      await expect(
        service.getDetailForCustomer('user-1', 'order-1'),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(dataSourceOrderRepository.findOne).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'order-1', userId: 'user-1' },
        }),
      );
    });

    it('returns the order with its items and history when owned by the user', async () => {
      dataSourceOrderRepository.findOne.mockResolvedValue(samplePendingOrder);

      const result = await service.getDetailForCustomer('user-1', 'order-1');

      expect(result.order.id).toBe('order-1');
      expect(result.order.status).toBe(OrderStatus.PENDING);
    });
  });

  describe('cancel (ORDER-04)', () => {
    it('throws NotFoundException when the order does not exist or is not owned by the user', async () => {
      managerOrderRepository.findOne.mockResolvedValue(null);

      await expect(service.cancel('user-1', 'order-1')).rejects.toBeInstanceOf(
        NotFoundException,
      );
      expect(managerOrderRepository.findOne).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'order-1', userId: 'user-1' },
          lock: { mode: 'pessimistic_write' },
        }),
      );
    });

    it('throws ConflictException when the order is no longer PENDING', async () => {
      managerOrderRepository.findOne.mockResolvedValue({
        ...samplePendingOrder,
        status: OrderStatus.CONFIRMED,
      });

      await expect(service.cancel('user-1', 'order-1')).rejects.toBeInstanceOf(
        ConflictException,
      );
      expect(managerOrderRepository.update).not.toHaveBeenCalled();
    });

    it('restores stock exactly once, appends history, and creates no notification', async () => {
      stubStatefulOrderRow(samplePendingOrder);
      stubRestock([{ productId: 'product-1', quantity: 2 }]);

      const result = await service.cancel('user-1', 'order-1');

      expect(managerOrderRepository.update).toHaveBeenCalledTimes(1);
      expect(managerOrderRepository.update).toHaveBeenCalledWith('order-1', {
        status: OrderStatus.CANCELLED,
      });
      expect(managerProductRepository.createQueryBuilder).toHaveBeenCalledTimes(
        2,
      );
      expect(managerHistoryRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({
          orderId: 'order-1',
          fromStatus: OrderStatus.PENDING,
          toStatus: OrderStatus.CANCELLED,
          actorUserId: 'user-1',
          reason: null,
        }),
      );
      expect(managerNotificationRepository.save).not.toHaveBeenCalled();
      expect(result.order.status).toBe(OrderStatus.CANCELLED);
    });
  });

  describe('listForAdmin (ORDER-05)', () => {
    it('applies both the status and userId filters when provided', async () => {
      const builder = mockQueryBuilder();
      dataSourceOrderRepository.createQueryBuilder.mockReturnValue(builder);

      await service.listForAdmin({
        limit: 20,
        offset: 0,
        status: OrderStatus.REJECTED,
        userId: 'user-2',
      });

      expect(builder.andWhere).toHaveBeenCalledWith('order.status = :status', {
        status: OrderStatus.REJECTED,
      });
      expect(builder.andWhere).toHaveBeenCalledWith('order.userId = :userId', {
        userId: 'user-2',
      });
    });
  });

  describe('getDetailForAdmin (ORDER-06)', () => {
    it('does not filter by owner and throws NotFoundException for an unknown id', async () => {
      dataSourceOrderRepository.findOne.mockResolvedValue(null);

      await expect(service.getDetailForAdmin('order-1')).rejects.toBeInstanceOf(
        NotFoundException,
      );
      expect(dataSourceOrderRepository.findOne).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 'order-1' } }),
      );
    });
  });

  describe('updateStatusByAdmin (ORDER-07)', () => {
    function dto(overrides: Record<string, unknown> = {}) {
      return { status: OrderStatus.CONFIRMED, ...overrides } as {
        status: OrderStatus;
        reason?: string;
      };
    }

    it('throws NotFoundException when the order does not exist', async () => {
      managerOrderRepository.findOne.mockResolvedValue(null);

      await expect(
        service.updateStatusByAdmin('order-1', 'admin-1', dto()),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it.each([
      [OrderStatus.PENDING, OrderStatus.COMPLETED],
      [OrderStatus.REJECTED, OrderStatus.CONFIRMED],
      [OrderStatus.CANCELLED, OrderStatus.CONFIRMED],
      [OrderStatus.COMPLETED, OrderStatus.CONFIRMED],
    ])('throws ConflictException moving %s -> %s', async (from, to) => {
      managerOrderRepository.findOne.mockResolvedValue({
        ...samplePendingOrder,
        status: from,
      });

      await expect(
        service.updateStatusByAdmin('order-1', 'admin-1', dto({ status: to })),
      ).rejects.toBeInstanceOf(ConflictException);
      expect(managerOrderRepository.update).not.toHaveBeenCalled();
    });

    it('throws NotFoundException if the customer row backing the order disappears', async () => {
      stubStatefulOrderRow(samplePendingOrder);
      managerUserRepository.findOne.mockResolvedValue(null);

      await expect(
        service.updateStatusByAdmin(
          'order-1',
          'admin-1',
          dto({ status: OrderStatus.CONFIRMED }),
        ),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('confirms a PENDING order without touching stock and sends ORDER_CONFIRMED', async () => {
      stubStatefulOrderRow(samplePendingOrder);

      const result = await service.updateStatusByAdmin(
        'order-1',
        'admin-1',
        dto({ status: OrderStatus.CONFIRMED }),
      );

      expect(
        managerProductRepository.createQueryBuilder,
      ).not.toHaveBeenCalled();
      expect(managerOrderRepository.update).toHaveBeenCalledWith('order-1', {
        status: OrderStatus.CONFIRMED,
      });
      expect(managerHistoryRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({
          fromStatus: OrderStatus.PENDING,
          toStatus: OrderStatus.CONFIRMED,
          actorUserId: 'admin-1',
          reason: null,
        }),
      );
      expect(managerNotificationRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({
          orderId: 'order-1',
          eventType: EmailNotificationEventType.ORDER_CONFIRMED,
          recipientEmail: 'user1@example.test',
        }),
      );
      expect(result.order.status).toBe(OrderStatus.CONFIRMED);
    });

    it('rejects a PENDING order, restores stock exactly once, and sends ORDER_REJECTED with the reason', async () => {
      stubStatefulOrderRow(samplePendingOrder);
      stubRestock([{ productId: 'product-1', quantity: 2 }]);

      const result = await service.updateStatusByAdmin(
        'order-1',
        'admin-1',
        dto({ status: OrderStatus.REJECTED, reason: 'Out of stock upstream' }),
      );

      expect(managerProductRepository.createQueryBuilder).toHaveBeenCalledTimes(
        2,
      );
      expect(managerOrderRepository.update).toHaveBeenCalledWith('order-1', {
        status: OrderStatus.REJECTED,
        rejectionReason: 'Out of stock upstream',
      });
      expect(managerHistoryRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({
          toStatus: OrderStatus.REJECTED,
          reason: 'Out of stock upstream',
        }),
      );
      expect(managerNotificationRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({
          eventType: EmailNotificationEventType.ORDER_REJECTED,
        }),
      );
      expect(result.order.status).toBe(OrderStatus.REJECTED);
    });

    it('completes a CONFIRMED order, sets completedAt, and sends no notification', async () => {
      stubStatefulOrderRow({
        ...samplePendingOrder,
        status: OrderStatus.CONFIRMED,
      });

      const result = await service.updateStatusByAdmin(
        'order-1',
        'admin-1',
        dto({ status: OrderStatus.COMPLETED }),
      );

      expect(
        managerProductRepository.createQueryBuilder,
      ).not.toHaveBeenCalled();
      expect(managerOrderRepository.update).toHaveBeenCalledWith(
        'order-1',
        expect.objectContaining({ status: OrderStatus.COMPLETED }),
      );
      const [, updatePayload] = managerOrderRepository.update.mock.calls[0] as [
        string,
        { completedAt?: Date },
      ];
      expect(updatePayload.completedAt).toBeInstanceOf(Date);
      expect(managerNotificationRepository.save).not.toHaveBeenCalled();
      expect(result.order.status).toBe(OrderStatus.COMPLETED);
    });
  });
});
