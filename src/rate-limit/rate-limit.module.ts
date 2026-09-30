import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ThrottlerModule } from '@nestjs/throttler';
import Redis from 'ioredis';
import { I18nService } from 'nestjs-i18n';
import { REDIS_CLIENT } from '../redis/redis.constants';
import { buildThrottlerOptions } from './rate-limit.config';

/**
 * `ThrottlerModule` tự là `@Global()` nên `RateLimitGuard` dùng được ở mọi module mà không cần
 * import lại. Đếm bằng Redis (dùng chung `REDIS_CLIENT`) để giới hạn sống sót qua restart và
 * đúng khi chạy nhiều replica — bộ nhớ trong tiến trình sẽ reset mỗi lần deploy.
 */
@Module({
  imports: [
    ThrottlerModule.forRootAsync({
      inject: [ConfigService, REDIS_CLIENT, I18nService],
      useFactory: (config: ConfigService, redis: Redis, i18n: I18nService) =>
        buildThrottlerOptions(config, redis, i18n),
    }),
  ],
})
export class RateLimitModule {}
