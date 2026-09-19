import { Order } from '../entities/order.entity';

/** Cột đủ dùng để dựng `OrderSummaryFields` trong `OrdersResponse` (api-contract.md dòng 374). */
export type OrderSummarySource = Pick<
  Order,
  | 'id'
  | 'userId'
  | 'status'
  | 'paymentMethod'
  | 'totalVnd'
  | 'createdAt'
  | 'updatedAt'
>;
