import { Injectable, NestMiddleware } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { NextFunction, Request, Response } from 'express';
import { REQUEST_ID_PATTERN } from '../constants/request-id.constants';

export const REQUEST_ID_HEADER = 'x-request-id';

/**
 * Gắn correlation ID cho mọi request — bắt buộc theo Definition of Done ở
 * docs/planning/full-scope-plan.md ("log có correlation ID và không chứa secret"). Nhận lại ID
 * upstream nếu proxy/load balancer đã gửi (để trace xuyên nhiều service) VÀ ID đó hợp lệ
 * (`REQUEST_ID_PATTERN`); thiếu hoặc không hợp lệ thì tự sinh UUID — ID do client gửi không được tin
 * nguyên văn vì nó đi thẳng vào log. `AllExceptionsFilter` đọc `req.id` để log kèm mọi lỗi chưa xử
 * lý (mục 9 CODING_STANDARD.md).
 */
@Injectable()
export class RequestIdMiddleware implements NestMiddleware {
  use(req: Request & { id?: string }, res: Response, next: NextFunction): void {
    const incoming = req.headers[REQUEST_ID_HEADER];
    const requestId =
      typeof incoming === 'string' && REQUEST_ID_PATTERN.test(incoming)
        ? incoming
        : randomUUID();

    req.id = requestId;
    res.setHeader(REQUEST_ID_HEADER, requestId);
    next();
  }
}
