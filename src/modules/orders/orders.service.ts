import {
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { createHash } from 'crypto';
import { I18nContext, I18nService } from 'nestjs-i18n';
import { DataSource, EntityManager } from 'typeorm';
import { canonicalizeForHash } from '../../common/utils/idempotency.util';
import { Category } from '../categories/entities/category.entity';
import { CartItem } from '../cart/entities/cart-item.entity';
import { Product } from '../products/entities/product.entity';
import { EmailNotification } from '../notifications/entities/email-notification.entity';
import { EmailNotificationEventType } from '../notifications/enums/email-notification-event-type.enum';
import { User } from '../users/entities/user.entity';
import { AdminListOrdersQueryDto } from './dto/admin-list-orders-query.dto';
import { CreateOrderDto } from './dto/create-order.dto';
import { ListOrdersQueryDto } from './dto/list-orders-query.dto';
import { OrderResponseDto, OrdersResponseDto } from './dto/order-response.dto';
import { UpdateOrderStatusDto } from './dto/update-order-status.dto';
import { ADMIN_ORDER_TRANSITIONS } from './constants/orders.constants';
import { OrderItem } from './entities/order-item.entity';
import { OrderStatusHistory } from './entities/order-status-history.entity';
import { Order } from './entities/order.entity';
import { OrderStatus } from './enums/order-status.enum';
import { CheckoutOrderItem } from './interfaces/checkout-order-item.interface';
import { CheckoutResult } from './interfaces/checkout-result.interface';
import { LockedCategoryForCheckout } from './interfaces/locked-category-for-checkout.interface';
import { LockedProductForCheckout } from './interfaces/locked-product-for-checkout.interface';
import { LockedUserForCheckout } from './interfaces/locked-user-for-checkout.interface';
import { OrderHistorySource } from './interfaces/order-history-source.interface';
import { OrderItemSource } from './interfaces/order-item-source.interface';

@Injectable()
export class OrdersService {
  private readonly logger = new Logger(OrdersService.name);

  constructor(
    private readonly dataSource: DataSource,
    private readonly i18n: I18nService,
  ) {}

  /**
   * `POST /orders` (ORDER-01) — thứ tự cố định theo database.md mục 6: khoá user → tìm replay
   * theo (user, idempotency key) → đọc giỏ → khoá product tăng dần → khoá category tăng dần →
   * validate/tính tiền → ghi order/items/history/notification → trừ tồn → xoá giỏ.
   */
  async checkout(
    userId: string,
    dto: CreateOrderDto,
    idempotencyKey: string,
  ): Promise<CheckoutResult> {
    const customerNote = dto.customerNote?.trim() || null;
    const requestHash = this.hashRequest(
      canonicalizeForHash({
        recipientName: dto.recipientName.trim(),
        phone: dto.phone.trim(),
        address: dto.address.trim(),
        customerNote,
      }),
    );

    return this.dataSource.transaction(async (manager) => {
      const user = await this.lockUserRow(userId, manager);

      const replay = await this.findReplay(
        userId,
        idempotencyKey,
        requestHash,
        manager,
      );
      if (replay) {
        return { order: replay, isNew: false };
      }

      const cartItems = await manager.getRepository(CartItem).find({
        select: { productId: true, quantity: true },
        where: { userId },
        order: { createdAt: 'ASC' },
      });
      if (cartItems.length === 0) {
        throw new ConflictException(this.i18n.t('errors.checkoutCartEmpty'));
      }

      const productIds = [
        ...new Set(cartItems.map((item) => item.productId)),
      ].sort();
      const lockedProducts = await this.lockProducts(productIds, manager);
      const activeCategoryIds = await this.lockActiveCategoryIds(
        lockedProducts,
        manager,
      );

      const productById = new Map(
        lockedProducts.map((product) => [product.id, product]),
      );
      const orderItemsData = cartItems.map((cartItem) =>
        this.toCheckoutOrderItem(cartItem, productById, activeCategoryIds),
      );
      const totalVnd = orderItemsData.reduce(
        (sum, item) => sum + Number(item.lineTotalVnd),
        0,
      );

      const orderRepository = manager.getRepository(Order);
      const order = await orderRepository.save(
        orderRepository.create({
          userId,
          totalVnd: String(totalVnd),
          recipientName: dto.recipientName.trim(),
          phone: dto.phone.trim(),
          addressSnapshot: dto.address.trim(),
          customerNote,
          idempotencyKey,
          requestHash,
        }),
      );

      const orderItemRepository = manager.getRepository(OrderItem);
      const items = await orderItemRepository.save(
        orderItemsData.map((item) =>
          orderItemRepository.create({ orderId: order.id, ...item }),
        ),
      );

      const historyRepository = manager.getRepository(OrderStatusHistory);
      const history = await historyRepository.save(
        historyRepository.create({
          orderId: order.id,
          fromStatus: null,
          toStatus: OrderStatus.PENDING,
          actorUserId: userId,
          reason: null,
        }),
      );

      await this.decrementProductStock(orderItemsData, manager);
      await this.createOrderNotification(
        order.id,
        user.email,
        EmailNotificationEventType.ORDER_PLACED,
        manager,
      );
      await manager.getRepository(CartItem).delete({ userId });

      this.logger.log(`Customer ${userId} checked out order ${order.id}`);
      return {
        order: OrderResponseDto.fromEntity(order, items, [history]),
        isNew: true,
      };
    });
  }

  /** ORDER-02 — chỉ đơn của current user (api-requirements.csv), list summary không kéo items/history. */
  async listForCustomer(
    userId: string,
    query: ListOrdersQueryDto,
  ): Promise<OrdersResponseDto> {
    const queryBuilder = this.buildOrderSummaryQuery(query).where(
      'order.userId = :userId',
      { userId },
    );
    if (query.status) {
      queryBuilder.andWhere('order.status = :status', { status: query.status });
    }
    const [orders, ordersCount] = await queryBuilder.getManyAndCount();
    return OrdersResponseDto.fromEntities(orders, ordersCount);
  }

  /** ORDER-03 — ownership qua `id` + `userId` trong cùng WHERE; đơn của user khác trả 404. */
  async getDetailForCustomer(
    userId: string,
    orderId: string,
  ): Promise<OrderResponseDto> {
    return this.loadOrderResponse(orderId, { ownerUserId: userId });
  }

  /**
   * ORDER-04 — chỉ chủ đơn, chỉ khi còn PENDING. Khoá order trước (lock tối thiểu cột cần), hoàn
   * tồn đúng một lần nếu hợp lệ; không khoá user row ở luồng này, khác checkout (database.md mục 7).
   */
  async cancel(userId: string, orderId: string): Promise<OrderResponseDto> {
    return this.dataSource.transaction(async (manager) => {
      const order = await manager.getRepository(Order).findOne({
        select: { id: true, status: true },
        where: { id: orderId, userId },
        lock: { mode: 'pessimistic_write' },
      });
      if (!order) {
        throw new NotFoundException(this.i18n.t('errors.orderNotFound'));
      }
      if (order.status !== OrderStatus.PENDING) {
        throw new ConflictException(
          this.i18n.t('errors.invalidOrderTransition'),
        );
      }

      await this.restoreOrderStock(orderId, manager);
      await manager
        .getRepository(Order)
        .update(orderId, { status: OrderStatus.CANCELLED });
      await this.appendHistory(
        orderId,
        OrderStatus.PENDING,
        OrderStatus.CANCELLED,
        userId,
        null,
        manager,
      );

      this.logger.log(`Customer ${userId} cancelled order ${orderId}`);
      return this.loadOrderResponse(orderId, { manager });
    });
  }

  /** ORDER-05 — thêm filter `userId` so với bản customer, không giới hạn theo chủ đơn. */
  async listForAdmin(
    query: AdminListOrdersQueryDto,
  ): Promise<OrdersResponseDto> {
    const queryBuilder = this.buildOrderSummaryQuery(query);
    if (query.status) {
      queryBuilder.andWhere('order.status = :status', { status: query.status });
    }
    if (query.userId) {
      queryBuilder.andWhere('order.userId = :userId', { userId: query.userId });
    }
    const [orders, ordersCount] = await queryBuilder.getManyAndCount();
    return OrdersResponseDto.fromEntities(orders, ordersCount);
  }

  /** ORDER-06 — admin xem bất kỳ đơn nào, không lọc theo chủ đơn. */
  async getDetailForAdmin(orderId: string): Promise<OrderResponseDto> {
    return this.loadOrderResponse(orderId);
  }

  /**
   * ORDER-07 — admin confirm/reject/complete. Khoá order trước (không khoá user — database.md mục
   * 7), validate cạnh chuyển bằng `ADMIN_ORDER_TRANSITIONS`, hoàn tồn đúng một lần khi REJECTED, tạo
   * mail CONFIRMED/REJECTED (COMPLETED không có event_type mail tương ứng — database.md mục 4).
   */
  async updateStatusByAdmin(
    orderId: string,
    adminUserId: string,
    dto: UpdateOrderStatusDto,
  ): Promise<OrderResponseDto> {
    return this.dataSource.transaction(async (manager) => {
      const order = await manager.getRepository(Order).findOne({
        select: { id: true, userId: true, status: true },
        where: { id: orderId },
        lock: { mode: 'pessimistic_write' },
      });
      if (!order) {
        throw new NotFoundException(this.i18n.t('errors.orderNotFound'));
      }

      const allowedTargets = ADMIN_ORDER_TRANSITIONS[order.status] ?? [];
      if (!allowedTargets.includes(dto.status)) {
        throw new ConflictException(
          this.i18n.t('errors.invalidOrderTransition'),
        );
      }

      const isRejected = dto.status === OrderStatus.REJECTED;
      const rejectionReason = isRejected ? (dto.reason ?? '').trim() : null;
      if (isRejected) {
        await this.restoreOrderStock(orderId, manager);
      }

      await manager.getRepository(Order).update(orderId, {
        status: dto.status,
        ...(isRejected && { rejectionReason }),
        ...(dto.status === OrderStatus.COMPLETED && {
          completedAt: new Date(),
        }),
      });
      await this.appendHistory(
        orderId,
        order.status,
        dto.status,
        adminUserId,
        rejectionReason,
        manager,
      );

      if (dto.status === OrderStatus.CONFIRMED || isRejected) {
        const customer = await manager.getRepository(User).findOne({
          select: { email: true },
          where: { id: order.userId },
        });
        if (!customer) {
          throw new NotFoundException(this.i18n.t('errors.userNotFound'));
        }
        await this.createOrderNotification(
          orderId,
          customer.email,
          isRejected
            ? EmailNotificationEventType.ORDER_REJECTED
            : EmailNotificationEventType.ORDER_CONFIRMED,
          manager,
        );
      }

      this.logger.log(
        `Admin ${adminUserId} moved order ${orderId} to ${dto.status}`,
      );
      return this.loadOrderResponse(orderId, { manager });
    });
  }

  private async lockUserRow(
    userId: string,
    manager: EntityManager,
  ): Promise<LockedUserForCheckout> {
    const lockedUser = await manager.getRepository(User).findOne({
      select: { id: true, email: true },
      where: { id: userId },
      lock: { mode: 'pessimistic_write' },
    });
    if (!lockedUser) {
      throw new NotFoundException(this.i18n.t('errors.userNotFound'));
    }
    return lockedUser;
  }

  /**
   * Cùng key/cùng body → trả nguyên đơn cũ (200), kể cả giỏ đã rỗng. Cùng key/khác body → 409.
   * Không tìm thấy key → null, tiếp tục checkout mới (api-contract.md dòng 438).
   */
  private async findReplay(
    userId: string,
    idempotencyKey: string,
    requestHash: string,
    manager: EntityManager,
  ): Promise<OrderResponseDto | null> {
    const existingOrder = await manager.getRepository(Order).findOne({
      select: {
        id: true,
        userId: true,
        status: true,
        totalVnd: true,
        paymentMethod: true,
        recipientName: true,
        phone: true,
        addressSnapshot: true,
        customerNote: true,
        idempotencyKey: true,
        requestHash: true,
        createdAt: true,
        updatedAt: true,
      },
      where: { userId, idempotencyKey },
    });
    if (!existingOrder) {
      return null;
    }
    if (existingOrder.requestHash !== requestHash) {
      throw new ConflictException(
        this.i18n.t('errors.checkoutIdempotencyKeyConflict'),
      );
    }

    // Tuần tự, không Promise.all: cùng 1 connection của transaction manager — gọi client.query()
    // chồng lên nhau trên cùng connection bị pg deprecate (xem lý do đầy đủ ở decrementProductStock).
    const items = await this.fetchOrderItems(existingOrder.id, manager);
    const history = await this.fetchOrderHistory(existingOrder.id, manager);
    return OrderResponseDto.fromEntity(existingOrder, items, history);
  }

  /** Khoá product theo ID tăng dần trước khi đọc tồn (database.md mục 6, tránh deadlock với admin edit). */
  private async lockProducts(
    productIds: string[],
    manager: EntityManager,
  ): Promise<LockedProductForCheckout[]> {
    return manager
      .getRepository(Product)
      .createQueryBuilder('product')
      .select([
        'product.id',
        'product.categoryId',
        'product.name',
        'product.sku',
        'product.priceVnd',
        'product.stock',
        'product.isActive',
      ])
      .where('product.id IN (:...productIds)', { productIds })
      .orderBy('product.id', 'ASC')
      .setLock('pessimistic_write')
      .getMany();
  }

  /** Shared lock theo category ID tăng dần, SAU product lock — cùng thứ tự với admin sửa product. */
  private async lockActiveCategoryIds(
    lockedProducts: LockedProductForCheckout[],
    manager: EntityManager,
  ): Promise<ReadonlySet<string>> {
    const categoryIds = [
      ...new Set(lockedProducts.map((product) => product.categoryId)),
    ].sort();
    const categories: LockedCategoryForCheckout[] = await manager
      .getRepository(Category)
      .createQueryBuilder('category')
      .select(['category.id', 'category.isActive'])
      .where('category.id IN (:...categoryIds)', { categoryIds })
      .orderBy('category.id', 'ASC')
      .setLock('pessimistic_read')
      .getMany();
    return new Set(
      categories
        .filter((category) => category.isActive)
        .map((category) => category.id),
    );
  }

  private toCheckoutOrderItem(
    cartItem: Pick<CartItem, 'productId' | 'quantity'>,
    productById: ReadonlyMap<string, LockedProductForCheckout>,
    activeCategoryIds: ReadonlySet<string>,
  ): CheckoutOrderItem {
    const product = productById.get(cartItem.productId);
    if (
      !product ||
      !product.isActive ||
      !activeCategoryIds.has(product.categoryId)
    ) {
      throw new ConflictException(
        this.i18n.t('errors.checkoutProductUnavailable'),
      );
    }
    if (product.stock < cartItem.quantity) {
      throw new ConflictException(
        this.i18n.t('errors.checkoutInsufficientStock'),
      );
    }
    const lineTotalVnd = Number(product.priceVnd) * cartItem.quantity;
    return {
      productId: product.id,
      productNameSnapshot: product.name,
      skuSnapshot: product.sku,
      unitPriceVnd: product.priceVnd,
      quantity: cartItem.quantity,
      lineTotalVnd: String(lineTotalVnd),
    };
  }

  /**
   * Một UPDATE duy nhất cho mọi dòng đơn (CASE theo product ID), không lặp N round-trip riêng lẻ.
   * Cố ý KHÔNG dùng `Promise.all` cho N update: manager của transaction dùng chung 1 connection —
   * gọi `client.query()` chồng lên nhau trên cùng connection bị `pg` deprecate (loại bỏ ở pg@9,
   * xem `node_modules/pg/lib/client.js` — `queryQueueLengthDeprecationNotice`), và cũng không có
   * lợi ích tốc độ thật vì driver tuần tự hoá lại bên trong. Vẫn là atomic UPDATE có điều kiện +
   * kiểm affected rows — lớp bảo vệ bổ sung ngoài product lock đã giữ tới cuối transaction
   * (CODING_STANDARD.md mục 22, database.md mục 6 bước 7).
   */
  private async decrementProductStock(
    items: readonly Pick<CheckoutOrderItem, 'productId' | 'quantity'>[],
    manager: EntityManager,
  ): Promise<void> {
    const stockCases = items
      .map(
        (_, index) =>
          `WHEN id = :productId${index} THEN stock - :quantity${index}`,
      )
      .join(' ');
    const matchConditions = items
      .map(
        (_, index) =>
          `(id = :productId${index} AND stock >= :quantity${index})`,
      )
      .join(' OR ');
    const parameters: Record<string, string | number> = {};
    items.forEach((item, index) => {
      parameters[`productId${index}`] = item.productId;
      parameters[`quantity${index}`] = item.quantity;
    });

    const result = await manager
      .getRepository(Product)
      .createQueryBuilder()
      .update(Product)
      .set({ stock: () => `CASE ${stockCases} END` })
      .where(matchConditions, parameters)
      .execute();
    if (result.affected !== items.length) {
      throw new ConflictException(
        this.i18n.t('errors.checkoutInsufficientStock'),
      );
    }
  }

  private async createOrderNotification(
    orderId: string,
    recipientEmail: string,
    eventType: EmailNotificationEventType,
    manager: EntityManager,
  ): Promise<void> {
    const notificationRepository = manager.getRepository(EmailNotification);
    await notificationRepository.save(
      notificationRepository.create({
        orderId,
        eventType,
        recipientEmail,
        locale: this.resolveLocale(),
        payload: { templateVersion: 1 },
      }),
    );
  }

  /** Cột summary dùng chung cho `GET /orders` và `GET /admin/orders` (api-contract.md dòng 374). */
  private buildOrderSummaryQuery(query: { limit: number; offset: number }) {
    return this.dataSource
      .getRepository(Order)
      .createQueryBuilder('order')
      .select([
        'order.id',
        'order.userId',
        'order.status',
        'order.paymentMethod',
        'order.totalVnd',
        'order.createdAt',
        'order.updatedAt',
      ])
      .orderBy('order.createdAt', 'DESC')
      .addOrderBy('order.id', 'DESC')
      .take(query.limit)
      .skip(query.offset);
  }

  /**
   * Dựng `OrderResponse` đầy đủ (order + items + history) — dùng cho cả 2 GET detail (không có
   * `manager`, đọc thẳng qua `dataSource`) lẫn bước trả response cuối của `cancel`/
   * `updateStatusByAdmin` (có `manager`, đọc trong cùng transaction vừa ghi — mục 6 CODING_STANDARD.md).
   */
  private async loadOrderResponse(
    orderId: string,
    options: { ownerUserId?: string; manager?: EntityManager } = {},
  ): Promise<OrderResponseDto> {
    const { ownerUserId, manager } = options;
    const ordersRepository = manager
      ? manager.getRepository(Order)
      : this.dataSource.getRepository(Order);
    const order = await ordersRepository.findOne({
      select: {
        id: true,
        userId: true,
        status: true,
        paymentMethod: true,
        recipientName: true,
        phone: true,
        addressSnapshot: true,
        customerNote: true,
        totalVnd: true,
        createdAt: true,
        updatedAt: true,
      },
      where: ownerUserId
        ? { id: orderId, userId: ownerUserId }
        : { id: orderId },
    });
    if (!order) {
      throw new NotFoundException(this.i18n.t('errors.orderNotFound'));
    }
    const items = await this.fetchOrderItems(orderId, manager);
    const history = await this.fetchOrderHistory(orderId, manager);
    return OrderResponseDto.fromEntity(order, items, history);
  }

  /** Dùng cho `findReplay` (trong transaction) và `loadOrderResponse` (có hoặc không có transaction). */
  private async fetchOrderItems(
    orderId: string,
    manager?: EntityManager,
  ): Promise<OrderItemSource[]> {
    const repository = manager
      ? manager.getRepository(OrderItem)
      : this.dataSource.getRepository(OrderItem);
    return repository.find({
      select: {
        id: true,
        productId: true,
        productNameSnapshot: true,
        unitPriceVnd: true,
        quantity: true,
        lineTotalVnd: true,
      },
      where: { orderId },
      order: { createdAt: 'ASC' },
    });
  }

  /** Dùng cho `findReplay` (trong transaction) và `loadOrderResponse` (có hoặc không có transaction). */
  private async fetchOrderHistory(
    orderId: string,
    manager?: EntityManager,
  ): Promise<OrderHistorySource[]> {
    const repository = manager
      ? manager.getRepository(OrderStatusHistory)
      : this.dataSource.getRepository(OrderStatusHistory);
    return repository.find({
      select: {
        id: true,
        fromStatus: true,
        toStatus: true,
        actorUserId: true,
        reason: true,
        createdAt: true,
      },
      where: { orderId },
      order: { createdAt: 'ASC', id: 'ASC' },
    });
  }

  /** Hoàn tồn cho toàn bộ dòng hàng của 1 đơn — dùng chung bởi `cancel` (CUSTOMER) và REJECTED (ADMIN). */
  private async restoreOrderStock(
    orderId: string,
    manager: EntityManager,
  ): Promise<void> {
    const items = await this.fetchOrderItems(orderId, manager);
    const productIds = [...new Set(items.map((item) => item.productId))].sort();
    await this.lockProducts(productIds, manager);
    await this.restockProductStock(items, manager);
  }

  /**
   * Ngược chiều `decrementProductStock` — cộng tồn theo CASE trong 1 UPDATE duy nhất, không lặp N
   * round-trip/`Promise.all` (mục 6 CODING_STANDARD.md). Không kiểm `affected === items.length` như
   * decrement: cộng tồn không có điều kiện nghiệp vụ nào khiến nó "thất bại" hợp lệ (product không
   * bị hard-delete — database.md mục 4), khác chiều trừ tồn vốn có thể hết hàng thật.
   */
  private async restockProductStock(
    items: readonly Pick<OrderItemSource, 'productId' | 'quantity'>[],
    manager: EntityManager,
  ): Promise<void> {
    const stockCases = items
      .map(
        (_, index) =>
          `WHEN id = :productId${index} THEN stock + :quantity${index}`,
      )
      .join(' ');
    const idConditions = items
      .map((_, index) => `id = :productId${index}`)
      .join(' OR ');
    const parameters: Record<string, string | number> = {};
    items.forEach((item, index) => {
      parameters[`productId${index}`] = item.productId;
      parameters[`quantity${index}`] = item.quantity;
    });

    await manager
      .getRepository(Product)
      .createQueryBuilder()
      .update(Product)
      .set({ stock: () => `CASE ${stockCases} END` })
      .where(idConditions, parameters)
      .execute();
  }

  private async appendHistory(
    orderId: string,
    fromStatus: OrderStatus,
    toStatus: OrderStatus,
    actorUserId: string,
    reason: string | null,
    manager: EntityManager,
  ): Promise<void> {
    const historyRepository = manager.getRepository(OrderStatusHistory);
    await historyRepository.save(
      historyRepository.create({
        orderId,
        fromStatus,
        toStatus,
        actorUserId,
        reason,
      }),
    );
  }

  private hashRequest(canonical: string): string {
    return createHash('sha256').update(canonical).digest('hex');
  }

  private resolveLocale(): 'vi' | 'en' {
    return I18nContext.current()?.lang === 'vi' ? 'vi' : 'en';
  }
}
