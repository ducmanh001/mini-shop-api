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
import { CreateOrderDto } from './dto/create-order.dto';
import { OrderResponseDto } from './dto/order-response.dto';
import { OrderItem } from './entities/order-item.entity';
import { OrderStatusHistory } from './entities/order-status-history.entity';
import { Order } from './entities/order.entity';
import { OrderStatus } from './enums/order-status.enum';
import { CheckoutOrderItem } from './interfaces/checkout-order-item.interface';
import { CheckoutResult } from './interfaces/checkout-result.interface';
import { LockedCategoryForCheckout } from './interfaces/locked-category-for-checkout.interface';
import { LockedProductForCheckout } from './interfaces/locked-product-for-checkout.interface';
import { LockedUserForCheckout } from './interfaces/locked-user-for-checkout.interface';

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
      await this.createOrderPlacedNotification(order.id, user.email, manager);
      await manager.getRepository(CartItem).delete({ userId });

      this.logger.log(`Customer ${userId} checked out order ${order.id}`);
      return {
        order: OrderResponseDto.fromEntity(order, items, [history]),
        isNew: true,
      };
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
    const items = await manager.getRepository(OrderItem).find({
      select: {
        id: true,
        productId: true,
        productNameSnapshot: true,
        unitPriceVnd: true,
        quantity: true,
        lineTotalVnd: true,
      },
      where: { orderId: existingOrder.id },
      order: { createdAt: 'ASC' },
    });
    const history = await manager.getRepository(OrderStatusHistory).find({
      select: {
        id: true,
        fromStatus: true,
        toStatus: true,
        actorUserId: true,
        reason: true,
        createdAt: true,
      },
      where: { orderId: existingOrder.id },
      order: { createdAt: 'ASC', id: 'ASC' },
    });
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

  private async createOrderPlacedNotification(
    orderId: string,
    recipientEmail: string,
    manager: EntityManager,
  ): Promise<void> {
    const notificationRepository = manager.getRepository(EmailNotification);
    await notificationRepository.save(
      notificationRepository.create({
        orderId,
        eventType: EmailNotificationEventType.ORDER_PLACED,
        recipientEmail,
        locale: this.resolveLocale(),
        payload: { templateVersion: 1 },
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
