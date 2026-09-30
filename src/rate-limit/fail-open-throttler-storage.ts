import { Logger } from '@nestjs/common';
import type { ThrottlerStorage } from '@nestjs/throttler';
import { RATE_LIMIT_ALLOW_RECORD } from './rate-limit.constants';
import type { ThrottlerStorageRecord } from './throttler-storage-record.type';

/**
 * Redis lỗi thì cho request đi qua thay vì trả 500: `register`/`login`/`forgot-password` không
 * phụ thuộc Redis, và mất rate limit tạm thời đỡ tệ hơn khiến cả đăng nhập ngừng hoạt động
 * (PR05: Redis down không được làm mất luồng nghiệp vụ). Mỗi lần bỏ qua đều có log warn.
 */
export class FailOpenThrottlerStorage implements ThrottlerStorage {
  private readonly logger = new Logger(FailOpenThrottlerStorage.name);

  constructor(private readonly delegate: ThrottlerStorage) {}

  async increment(
    key: string,
    ttl: number,
    limit: number,
    blockDuration: number,
    throttlerName: string,
  ): Promise<ThrottlerStorageRecord> {
    try {
      return await this.delegate.increment(
        key,
        ttl,
        limit,
        blockDuration,
        throttlerName,
      );
    } catch (error) {
      this.logger.warn(
        `Rate-limit store unavailable, allowing request (throttler=${throttlerName}): ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      return { ...RATE_LIMIT_ALLOW_RECORD };
    }
  }
}
