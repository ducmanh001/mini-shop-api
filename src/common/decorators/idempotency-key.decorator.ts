import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import type { Request } from 'express';
import { IDEMPOTENCY_KEY_HEADER } from '../constants/idempotency.constants';

/**
 * `@Headers()` không hỗ trợ truyền pipe (chỉ nhận tên field, xem `.d.ts` của `@nestjs/common`) nên
 * không thể viết `@Headers(name, ParseUUIDPipe)` như `@Param()`. Decorator riêng này giữ đúng cách
 * dùng `@IdempotencyKey(new ParseUUIDPipe())` ở controller — Nest áp pipe cho custom param
 * decorator giống hệt decorator có sẵn. Dùng chung bởi orders (PR12) và chat (PR15).
 */
export const IdempotencyKey = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): string | undefined => {
    const request = ctx.switchToHttp().getRequest<Request>();
    const value = request.headers[IDEMPOTENCY_KEY_HEADER];
    return Array.isArray(value) ? value[0] : value;
  },
);
