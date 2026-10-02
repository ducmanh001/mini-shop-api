import { INestApplication } from '@nestjs/common';
import { getRepositoryToken } from '@nestjs/typeorm';
import * as bcrypt from 'bcrypt';
import { randomInt, randomUUID } from 'crypto';
import request from 'supertest';
import type { App } from 'supertest/types';
import { Repository } from 'typeorm';
import { UserRole } from '../src/common/enums/user-role.enum';
import { SALT_ROUNDS } from '../src/modules/users/constants/users.constants';
import { User } from '../src/modules/users/entities/user.entity';
import { UserStatus } from '../src/modules/users/enums/user-status.enum';
import { createTestApp } from './utils/create-test-app';
import { overrideEnv } from './utils/override-env';
import { SEED_PASSWORD } from './utils/seed-database';

const TOO_MANY_REQUESTS_MESSAGE = 'Too many requests, please try again later';
const TOO_MANY_REQUESTS_MESSAGE_VI =
  'Bạn thao tác quá nhiều lần, vui lòng thử lại sau';

interface ErrorBody {
  errors: { body: string[] };
}

/**
 * Rate limit endpoint auth công khai (AUTH-03/04): đếm theo IP và theo email trong body, bằng Redis
 * thật. Giới hạn ghi đè ở đầu file: IP 5/60s, email 3/60s. Mỗi test dùng email và IP riêng vì bộ
 * đếm nằm ở Redis, không bị truncate giữa các test như DB.
 */
describe('Rate limit on auth endpoints (e2e)', () => {
  let app: INestApplication<App>;
  let usersRepository: Repository<User>;

  beforeAll(async () => {
    // `TRUST_PROXY_HOPS=1` để mỗi test tự chọn IP qua `X-Forwarded-For`.
    overrideEnv({
      TRUST_PROXY_HOPS: '1',
      THROTTLE_AUTH_IP_LIMIT: '5',
      THROTTLE_AUTH_IP_TTL_SECONDS: '60',
      THROTTLE_AUTH_ACCOUNT_LIMIT: '3',
      THROTTLE_AUTH_ACCOUNT_TTL_SECONDS: '60',
    });
    app = await createTestApp();
    usersRepository = app.get(getRepositoryToken(User));
  });

  afterAll(async () => {
    if (app) {
      await app.close();
    }
  });

  function uniqueIp(): string {
    return `10.${randomInt(0, 256)}.${randomInt(0, 256)}.${randomInt(1, 255)}`;
  }

  function uniqueEmail(): string {
    return `rate-${randomUUID().replace(/-/g, '').slice(0, 12)}@example.test`;
  }

  function post(path: string, body: Record<string, unknown>, ip = uniqueIp()) {
    return request(app.getHttpServer())
      .post(`/api/v1/auth/${path}`)
      .set('X-Forwarded-For', ip)
      .send(body);
  }

  function login(email: string, password: string, ip?: string) {
    return post('login', { email, password }, ip);
  }

  async function createActiveCustomer(): Promise<string> {
    const email = uniqueEmail();
    await usersRepository.save(
      usersRepository.create({
        email,
        username: `rate_${randomUUID().replace(/-/g, '').slice(0, 12)}`,
        passwordHash: await bcrypt.hash(SEED_PASSWORD, SALT_ROUNDS),
        role: UserRole.CUSTOMER,
        status: UserStatus.ACTIVE,
        emailVerifiedAt: new Date(),
      }),
    );
    return email;
  }

  describe('POST /auth/login', () => {
    it('blocks the 4th attempt on one email from any IP, even with the right password', async () => {
      const email = await createActiveCustomer();
      for (let attempt = 0; attempt < 3; attempt += 1) {
        await login(email, 'Wrong@12345').expect(401);
      }

      const response = await login(email, SEED_PASSWORD).expect(429);

      expect((response.body as ErrorBody).errors.body).toEqual([
        TOO_MANY_REQUESTS_MESSAGE,
      ]);
      const retryAfter = Number(response.headers['retry-after']);
      expect(retryAfter).toBeGreaterThan(0);
      expect(retryAfter).toBeLessThanOrEqual(60);
    });

    it('counts the same account regardless of email case and surrounding spaces', async () => {
      const email = uniqueEmail();
      const variants = [` ${email.toUpperCase()} `, email, email.toUpperCase()];
      for (const variant of variants) {
        const response = await login(variant, 'Wrong@12345');
        expect(response.status).not.toBe(429);
      }

      await login(email, 'Wrong@12345').expect(429);
    });

    it('does not throttle a different email', async () => {
      const blockedEmail = uniqueEmail();
      for (let attempt = 0; attempt < 3; attempt += 1) {
        await login(blockedEmail, 'Wrong@12345');
      }
      await login(blockedEmail, 'Wrong@12345').expect(429);

      await login(uniqueEmail(), 'Wrong@12345').expect(401);
    });

    it('limits one IP across different emails independently of the per-email budget', async () => {
      const ip = uniqueIp();
      for (let attempt = 0; attempt < 5; attempt += 1) {
        const response = await login(uniqueEmail(), 'Wrong@12345', ip);
        expect(response.status).not.toBe(429);
      }

      await login(uniqueEmail(), 'Wrong@12345', ip).expect(429);
    });

    it('localizes the 429 message', async () => {
      const email = uniqueEmail();
      for (let attempt = 0; attempt < 3; attempt += 1) {
        await login(email, 'Wrong@12345');
      }

      const response = await post('login', {
        email,
        password: 'Wrong@12345',
      })
        .set('Accept-Language', 'vi')
        .expect(429);

      expect((response.body as ErrorBody).errors.body).toEqual([
        TOO_MANY_REQUESTS_MESSAGE_VI,
      ]);
    });
  });

  describe('POST /auth/forgot-password (AUTH-04)', () => {
    it('answers 202 three times, then 429 for the same email', async () => {
      const email = uniqueEmail();
      for (let attempt = 0; attempt < 3; attempt += 1) {
        await post('forgot-password', { email }).expect(202);
      }

      await post('forgot-password', { email }).expect(429);
    });

    it('keeps a budget separate from login for the same email', async () => {
      const email = uniqueEmail();
      for (let attempt = 0; attempt < 3; attempt += 1) {
        await login(email, 'Wrong@12345');
      }
      await login(email, 'Wrong@12345').expect(429);

      await post('forgot-password', { email }).expect(202);
    });
  });

  describe('POST /auth/register', () => {
    it('is limited per email too (invalid bodies still count)', async () => {
      const email = uniqueEmail();
      for (let attempt = 0; attempt < 3; attempt += 1) {
        await post('register', { email }).expect(400);
      }

      await post('register', { email }).expect(429);
    });
  });

  describe('routes whose body carries no email', () => {
    it('verify-email is only limited per IP, never per account', async () => {
      const ip = uniqueIp();
      const body = { token: 'a'.repeat(64) };
      // Giới hạn account là 3: nếu bị áp dụng nhầm, request thứ 4 đã là 429.
      for (let attempt = 0; attempt < 5; attempt += 1) {
        await post('verify-email', body, ip).expect(400);
      }

      await post('verify-email', body, ip).expect(429);
    });
  });

  describe('routes without @RateLimited()', () => {
    it('never throttles /health, even far beyond the IP limit', async () => {
      const ip = uniqueIp();
      for (let attempt = 0; attempt < 12; attempt += 1) {
        await request(app.getHttpServer())
          .get('/api/v1/health')
          .set('X-Forwarded-For', ip)
          .expect(200);
      }
    });
  });
});
