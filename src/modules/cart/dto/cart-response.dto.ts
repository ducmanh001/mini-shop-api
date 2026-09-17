import { ApiProperty } from '@nestjs/swagger';
import { CartItem } from '../entities/cart-item.entity';

/**
 * Một dòng giỏ ghép với giá/tồn hiện tại của product (api-contract.md — `CartResponse`).
 * `available` = product active + category active + đủ tồn cho `quantity`; không giữ chỗ tồn kho.
 */
export class CartItemFields {
  @ApiProperty()
  productId: string;

  @ApiProperty()
  productName: string;

  @ApiProperty()
  unitPriceVnd: string;

  @ApiProperty()
  quantity: number;

  @ApiProperty()
  stock: number;

  @ApiProperty()
  available: boolean;

  @ApiProperty()
  lineTotalVnd: string;

  static fromEntity(cartItem: CartItem): CartItemFields {
    const fields = new CartItemFields();
    fields.productId = cartItem.productId;
    fields.productName = cartItem.product.name;
    fields.unitPriceVnd = cartItem.product.priceVnd;
    fields.quantity = cartItem.quantity;
    fields.stock = cartItem.product.stock;
    fields.available =
      cartItem.product.isActive &&
      cartItem.product.category.isActive &&
      cartItem.product.stock >= cartItem.quantity;
    fields.lineTotalVnd = String(
      Number(cartItem.product.priceVnd) * cartItem.quantity,
    );
    return fields;
  }
}

class CartFields {
  @ApiProperty({ type: [CartItemFields] })
  items: CartItemFields[];

  @ApiProperty()
  totalVnd: string;
}

/**
 * `totalVnd` cộng dồn MỌI dòng theo giá hiện tại, kể cả dòng `available=false` — chỉ tham khảo,
 * checkout mới chốt giá/tồn thật (api-contract.md dòng 311). Giỏ tối đa 20 dòng * 99 * giá tối đa
 * 1 tỷ VND vẫn nằm trong `Number.MAX_SAFE_INTEGER` (database.md mục 2), cộng bằng Number an toàn.
 */
export class CartResponseDto {
  @ApiProperty({ type: CartFields })
  cart: CartFields;

  static fromEntities(cartItems: CartItem[]): CartResponseDto {
    const dto = new CartResponseDto();
    const items = cartItems.map((cartItem) =>
      CartItemFields.fromEntity(cartItem),
    );
    const totalVnd = items.reduce(
      (sum, item) => sum + Number(item.lineTotalVnd),
      0,
    );
    dto.cart = { items, totalVnd: String(totalVnd) };
    return dto;
  }
}
