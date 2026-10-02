import { INestApplication } from '@nestjs/common';
import { randomInt, randomUUID } from 'crypto';
import request from 'supertest';
import type { App } from 'supertest/types';
import { createTestApp } from './utils/create-test-app';
import { overrideEnv } from './utils/override-env';

const WINDOW_SECONDS = 3;
const SAFETY_MARGIN_MS = 700;

/**
 * Chứng minh TTL cấu hình bằng GIÂY thật sự thành cửa sổ đúng thời gian (nhầm giây/mili giây sẽ làm
 * cửa sổ lệch 1000 lần): bị chặn trong cửa sổ, và được đi tiếp ngay khi cửa sổ hết hạn.
 */
describe('Rate limit window (e2e)', () => {
  let app: INestApplication<App>;

  beforeAll(async () => {
    // TTL 3 giây để test được cửa sổ hết hạn mà không phải chờ lâu.
    overrideEnv({
      TRUST_PROXY_HOPS: '1',
      THROTTLE_AUTH_IP_LIMIT: '100000',
      THROTTLE_AUTH_ACCOUNT_LIMIT: '2',
      THROTTLE_AUTH_ACCOUNT_TTL_SECONDS: String(WINDOW_SECONDS),
    });
    app = await createTestApp();
  });

  afterAll(async () => {
    if (app) {
      await app.close();
    }
  });

  function login(email: string, ip: string) {
    return request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .set('X-Forwarded-For', ip)
      .send({ email, password: 'Wrong@12345' });
  }

  it('blocks inside the window and allows the account again after it expires', async () => {
    const email = `window-${randomUUID().replace(/-/g, '').slice(0, 12)}@example.test`;
    const ip = `10.${randomInt(0, 256)}.${randomInt(0, 256)}.${randomInt(1, 255)}`;
    await login(email, ip).expect(401);
    await login(email, ip).expect(401);
    await login(email, ip).expect(429);

    await new Promise((resolve) =>
      setTimeout(resolve, WINDOW_SECONDS * 1000 + SAFETY_MARGIN_MS),
    );

    await login(email, ip).expect(401);
  });
});
