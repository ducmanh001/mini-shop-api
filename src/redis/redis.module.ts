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
          // Redis local (docker-compose) không cần auth — chỉ set khi có REDIS_PASSWORD (managed
          // Redis như Railway bắt buộc auth).
          password: config.get<string>('REDIS_PASSWORD'),
          maxRetriesPerRequest: 2,
        }),
    },
    RedisService,
  ],
  exports: [RedisService],
})
export class RedisModule {}
