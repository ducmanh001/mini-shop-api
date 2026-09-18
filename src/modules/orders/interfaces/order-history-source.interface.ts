import { OrderStatusHistory } from '../entities/order-status-history.entity';

/** Cột đủ dùng để dựng `OrderHistoryFields` trong `OrderResponse` (api-contract.md dòng 358). */
export type OrderHistorySource = Pick<
  OrderStatusHistory,
  'id' | 'fromStatus' | 'toStatus' | 'actorUserId' | 'reason' | 'createdAt'
>;
