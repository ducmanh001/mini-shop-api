import { OrderResponseDto } from '../dto/order-response.dto';

/**
 * `isNew` quyết định status code ở controller (201 lần đầu, 200 khi replay cùng
 * Idempotency-Key/body) — api-contract.md dòng 438.
 */
export interface CheckoutResult {
  order: OrderResponseDto;
  isNew: boolean;
}
