import { OrderItem } from '../entities/order-item.entity';

/** Cột đủ dùng để dựng `OrderItemFields` trong `OrderResponse` (api-contract.md dòng 348). */
export type OrderItemSource = Pick<
  OrderItem,
  | 'id'
  | 'productId'
  | 'productNameSnapshot'
  | 'unitPriceVnd'
  | 'quantity'
  | 'lineTotalVnd'
>;
