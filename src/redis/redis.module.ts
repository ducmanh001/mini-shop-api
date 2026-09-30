import { Global, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';
import { REDIS_CLIENT } from './redis.constants';
import { RedisService } from './redis.service';

@Global()
@Module({
  providers: [
    {
      provide: REDIS_CLIENT,
      inject: [ConfigService],
      useFactory: (config: ConfigService) =>
        new Redis({
          host: config.getOrThrow<string>('REDIS_HOST'),
          port: config.getOrThrow<number>('REDIS_PORT'),
          maxRetriesPerRequest: 2,
        }),
    },
    RedisService,
  ],
  // `REDIS_CLIENT` export riêng cho `RateLimitModule`: `@nest-lab/throttler-storage-redis` cần đúng
  // instance ioredis này để dùng chung một connection, không mở thêm connection thứ hai.
  exports: [RedisService, REDIS_CLIENT],
})
export class RedisModule {}
