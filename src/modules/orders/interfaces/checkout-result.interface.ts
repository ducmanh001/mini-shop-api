import { HttpStatus } from '@nestjs/common';
import { OrderResponseDto } from '../dto/order-response.dto';

/**
 * `statusCode` do service tự quyết định (201 lần đầu, 200 khi replay cùng
 * Idempotency-Key/body) — api-contract.md dòng 438. Controller chỉ forward,
 * không tự suy ra status code (CODING_STANDARD.md mục 3).
 */
export interface CheckoutResult {
  order: OrderResponseDto;
  statusCode: HttpStatus;
}
