import {
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { I18nService } from 'nestjs-i18n';
import { DataSource, EntityManager, Repository } from 'typeorm';
import { User } from '../users/entities/user.entity';
import { Product } from '../products/entities/product.entity';
import { MAX_CART_LINES_PER_USER } from './constants/cart.constants';
import { CartResponseDto } from './dto/cart-response.dto';
import { CartItem } from './entities/cart-item.entity';
import { ProductStockFields } from './interfaces/product-stock-fields.interface';

@Injectable()
export class CartService {
  private readonly logger = new Logger(CartService.name);

  constructor(
    @InjectRepository(CartItem)
    private readonly cartItemsRepository: Repository<CartItem>,
    private readonly dataSource: DataSource,
    private readonly i18n: I18nService,
  ) {}

  /** `GET /cart` (CART-01) — read-only, không cần khóa user row. */
  async getCart(userId: string): Promise<CartResponseDto> {
    const cartItems = await this.loadCartItems(
      this.cartItemsRepository,
      userId,
    );
    return CartResponseDto.fromEntities(cartItems);
  }

  /**
   * `PUT /cart/items/:productId` (CART-02) — absolute set (upsert theo unique user+product).
   * Khóa row `users` trước khi đụng giỏ vì giỏ có thể chưa có dòng nào để khóa (database.md mục 6).
   */
  async setCartItem(
    userId: string,
    productId: string,
    quantity: number,
  ): Promise<CartResponseDto> {
    return this.dataSource.transaction(async (manager) => {
      await this.lockUserRow(userId, manager);

      const product = await this.loadVisibleProduct(productId, manager);
      if (quantity > product.stock) {
        throw new ConflictException(
          this.i18n.t('errors.cartInsufficientStock'),
        );
      }

      const cartItemRepository = manager.getRepository(CartItem);
      const existingLine = await cartItemRepository.findOne({
        select: { id: true },
        where: { userId, productId },
      });
      if (existingLine) {
        await cartItemRepository.update(existingLine.id, { quantity });
      } else {
        const lineCount = await cartItemRepository.count({
          where: { userId },
        });
        if (lineCount >= MAX_CART_LINES_PER_USER) {
          throw new ConflictException(
            this.i18n.t('errors.cartLineLimitReached'),
          );
        }
        const cartItem = cartItemRepository.create({
          userId,
          productId,
          quantity,
        });
        await cartItemRepository.insert(cartItem);
      }

      this.logger.log(
        `Customer ${userId} set cart item ${productId} to quantity ${quantity}`,
      );
      const cartItems = await this.loadCartItems(cartItemRepository, userId);
      return CartResponseDto.fromEntities(cartItems);
    });
  }

  /**
   * `DELETE /cart/items/:productId` (CART-03) — idempotent, luôn 204 dù dòng có tồn tại hay không,
   * không tiết lộ giỏ của user khác (api-contract.md dòng 332).
   */
  async removeCartItem(userId: string, productId: string): Promise<void> {
    await this.dataSource.transaction(async (manager) => {
      await this.lockUserRow(userId, manager);
      await manager.getRepository(CartItem).delete({ userId, productId });
    });
    this.logger.log(`Customer ${userId} removed cart item ${productId}`);
  }

  private async lockUserRow(
    userId: string,
    manager: EntityManager,
  ): Promise<void> {
    const lockedUser = await manager.getRepository(User).findOne({
      select: { id: true },
      where: { id: userId },
      lock: { mode: 'pessimistic_write' },
    });
    if (!lockedUser) {
      throw new NotFoundException(this.i18n.t('errors.userNotFound'));
    }
  }

  /**
   * Chỉ product active + category active mới được set vào giỏ — cùng điều kiện visibility với
   * public product API. Đọc thường, không lock: check tồn ở đây không thay thế transaction checkout
   * (api-contract.md dòng 332), nên không cần bảo vệ race condition tuyệt đối.
   */
  private async loadVisibleProduct(
    productId: string,
    manager: EntityManager,
  ): Promise<ProductStockFields> {
    const product = await manager
      .getRepository(Product)
      .createQueryBuilder('product')
      .innerJoin('product.category', 'category')
      .select(['product.id', 'product.stock'])
      .where('product.id = :productId', { productId })
      .andWhere('product.isActive = true')
      .andWhere('category.isActive = true')
      .getOne();
    if (!product) {
      throw new NotFoundException(this.i18n.t('errors.productNotFound'));
    }
    return product;
  }

  private async loadCartItems(
    cartItemRepository: Repository<CartItem>,
    userId: string,
  ): Promise<CartItem[]> {
    return cartItemRepository
      .createQueryBuilder('cartItem')
      .innerJoin('cartItem.product', 'product')
      .innerJoin('product.category', 'category')
      .select([
        'cartItem.id',
        'cartItem.productId',
        'cartItem.quantity',
        'product.id',
        'product.name',
        'product.priceVnd',
        'product.stock',
        'product.isActive',
        'category.id',
        'category.isActive',
      ])
      .where('cartItem.userId = :userId', { userId })
      .orderBy('cartItem.createdAt', 'ASC')
      .addOrderBy('cartItem.id', 'ASC')
      .getMany();
  }
}
