import { ConfigService } from '@nestjs/config';
import { ThrottlerModuleOptions } from '@nestjs/throttler';
import { ThrottlerStorageRedisService } from '@nest-lab/throttler-storage-redis';
import Redis from 'ioredis';
import { I18nService } from 'nestjs-i18n';
import { normalizeIdentifier } from '../common/utils/normalize-identifier.util';
import { FailOpenThrottlerStorage } from './fail-open-throttler-storage';
import {
  ACCOUNT_THROTTLER_NAME,
  IP_THROTTLER_NAME,
  MILLISECONDS_PER_SECOND,
} from './rate-limit.constants';
import { RateLimitedRequest } from './rate-limited-request.interface';

/**
 * Email trong body đã trim + lowercase (cùng chuẩn hoá với DTO đăng nhập), hoặc chuỗi rỗng nếu body
 * không có email hợp lệ.
 */
export function getEmailFromBody(request: RateLimitedRequest): string {
  const { email } = (request.body ?? {}) as { email?: unknown };
  const normalized = normalizeIdentifier(email);
  return typeof normalized === 'string' ? normalized : '';
}

/**
 * Hai bộ đếm chạy song song trên mỗi route gắn `@RateLimited()`, key sinh theo class + handler nên
 * mỗi route có ngân sách riêng. `ip` đến trước vì `ttl` ngắn hơn (thư viện sắp xếp theo ttl).
 * `account` bị bỏ qua khi body không có email (verify-email, reset-password chỉ mang token).
 */
export function buildThrottlerOptions(
  config: ConfigService,
  redis: Redis,
  i18n: I18nService,
): ThrottlerModuleOptions {
  return {
    storage: new FailOpenThrottlerStorage(
      new ThrottlerStorageRedisService(redis),
    ),
    errorMessage: () => i18n.t('errors.tooManyRequests'),
    throttlers: [
      {
        name: IP_THROTTLER_NAME,
        limit: config.getOrThrow<number>('THROTTLE_AUTH_IP_LIMIT'),
        ttl:
          config.getOrThrow<number>('THROTTLE_AUTH_IP_TTL_SECONDS') *
          MILLISECONDS_PER_SECOND,
      },
      {
        name: ACCOUNT_THROTTLER_NAME,
        limit: config.getOrThrow<number>('THROTTLE_AUTH_ACCOUNT_LIMIT'),
        ttl:
          config.getOrThrow<number>('THROTTLE_AUTH_ACCOUNT_TTL_SECONDS') *
          MILLISECONDS_PER_SECOND,
        getTracker: getEmailFromBody,
        skipIf: (context) =>
          getEmailFromBody(
            context.switchToHttp().getRequest<RateLimitedRequest>(),
          ) === '',
      },
    ],
  };
}
