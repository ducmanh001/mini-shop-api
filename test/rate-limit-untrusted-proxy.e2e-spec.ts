import { INestApplication } from '@nestjs/common';
import { randomInt, randomUUID } from 'crypto';
import Redis from 'ioredis';
import request from 'supertest';
import type { App } from 'supertest/types';
import { REDIS_CLIENT } from '../src/redis/redis.constants';
import { createTestApp } from './utils/create-test-app';
import { overrideEnv } from './utils/override-env';

/**
 * Khi không tin proxy nào (mặc định), `X-Forwarded-For` do client tự gửi phải bị bỏ qua — nếu không
 * kẻ tấn công đổi header mỗi request là né sạch giới hạn theo IP.
 */
describe('Rate limit with an untrusted proxy (e2e)', () => {
  let app: INestApplication<App>;

  /**
   * Không thể chọn IP riêng cho từng test (mọi request đều tới từ 127.0.0.1), mà bộ đếm Redis sống
   * qua các file e2e chạy trước nên phải dọn bộ đếm theo IP để đo từ 0.
   */
  async function clearIpCounters(redis: Redis): Promise<void> {
    let cursor = '0';
    do {
      const [next, keys] = await redis.scan(
        cursor,
        'MATCH',
        '{*:ip}:*',
        'COUNT',
        500,
      );
      if (keys.length > 0) {
        await redis.del(...keys);
      }
      cursor = next;
    } while (cursor !== '0');
  }

  beforeAll(async () => {
    // Cố ý không đặt TRUST_PROXY_HOPS: phải chạy với mặc định 0.
    overrideEnv({
      THROTTLE_AUTH_IP_LIMIT: '3',
      THROTTLE_AUTH_IP_TTL_SECONDS: '3',
      THROTTLE_AUTH_ACCOUNT_LIMIT: '100000',
    });
    app = await createTestApp();
    await clearIpCounters(app.get<Redis>(REDIS_CLIENT, { strict: false }));
  });

  afterAll(async () => {
    if (app) {
      await app.close();
    }
  });

  function login(spoofedIp: string) {
    return request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .set('X-Forwarded-For', spoofedIp)
      .send({
        email: `spoof-${randomUUID().replace(/-/g, '').slice(0, 12)}@example.test`,
        password: 'Wrong@12345',
      });
  }

  function randomIp(): string {
    return `10.${randomInt(0, 256)}.${randomInt(0, 256)}.${randomInt(1, 255)}`;
  }

  it('cannot dodge the per-IP limit by changing X-Forwarded-For on every request', async () => {
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const response = await login(randomIp());
      expect(response.status).not.toBe(429);
    }

    await login(randomIp()).expect(429);
  });
});
