import { ExecutionContext, Injectable, Logger } from '@nestjs/common';
import { ThrottlerGuard, ThrottlerLimitDetail } from '@nestjs/throttler';
import {
  MILLISECONDS_PER_SECOND,
  RETRY_AFTER_HEADER,
} from './rate-limit.constants';
import { RateLimitedRequest } from './rate-limited-request.interface';

/**
 * Thêm `Retry-After` chuẩn vào response 429 và ghi log lúc chặn; đếm, chặn và message lỗi vẫn do
 * `ThrottlerGuard` và options ở `RateLimitModule` quyết định. Không khai constructor: dependency
 * kế thừa từ lớp cha.
 */
@Injectable()
export class RateLimitGuard extends ThrottlerGuard {
  protected logger = new Logger(RateLimitGuard.name);

  protected async throwThrottlingException(
    context: ExecutionContext,
    throttlerLimitDetail: ThrottlerLimitDetail,
  ): Promise<void> {
    const { req, res } = this.getRequestResponse(context);
    this.setResponseHeader(
      res,
      RETRY_AFTER_HEADER,
      throttlerLimitDetail.timeToBlockExpire,
    );
    this.logExceeded(context, req as RateLimitedRequest, throttlerLimitDetail);
    await super.throwThrottlingException(context, throttlerLimitDetail);
  }

  /**
   * Chỉ log lần vượt ngưỡng ĐẦU TIÊN của mỗi cửa sổ (`totalHits === limit + 1`): các request bị chặn
   * sau đó không thêm thông tin nào và sẽ làm ngập log đúng lúc hệ thống đang bị tấn công. Ghi
   * IP + route, KHÔNG ghi email (tracker của bộ đếm `account` là email) để log không chứa PII.
   */
  private logExceeded(
    context: ExecutionContext,
    request: RateLimitedRequest,
    detail: ThrottlerLimitDetail,
  ): void {
    if (detail.totalHits !== detail.limit + 1) {
      return;
    }
    this.logger.warn(
      `Rate limit exceeded [route=${context.getClass().name}.${context.getHandler().name}, ip=${request.ip}, limit=${detail.limit}, windowSeconds=${detail.ttl / MILLISECONDS_PER_SECOND}, retryAfterSeconds=${detail.timeToBlockExpire}, requestId=${request.id}]`,
    );
  }
}
