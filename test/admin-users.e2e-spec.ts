import { INestApplication } from '@nestjs/common';
import { getRepositoryToken } from '@nestjs/typeorm';
import { randomUUID } from 'crypto';
import request from 'supertest';
import type { App } from 'supertest/types';
import { Repository } from 'typeorm';
import { UserRole } from '../src/common/enums/user-role.enum';
import {
  AdminUserResponseDto,
  AdminUsersResponseDto,
} from '../src/modules/users/dto/admin-user-response.dto';
import { UserResponseDto } from '../src/modules/users/dto/user-response.dto';
import { User } from '../src/modules/users/entities/user.entity';
import { createTestApp } from './utils/create-test-app';
import {
  SEED_ALICE_EMAIL,
  SEED_BOB_EMAIL,
  SEED_PASSWORD,
} from './utils/seed-database';

/** Chứng minh ADMIN-USER-01/02/03 (PR08) end-to-end: RBAC, list/detail, active/inactive. */
describe('Admin users (e2e)', () => {
  let app: INestApplication<App>;
  let usersRepository: Repository<User>;

  beforeAll(async () => {
    app = await createTestApp();
    usersRepository = app.get(getRepositoryToken(User));
  });

  afterAll(async () => {
    if (app) {
      await app.close();
    }
  });

  async function loginAs(email: string): Promise<string> {
    const response = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email, password: SEED_PASSWORD })
      .expect(200);
    const body = response.body as UserResponseDto;
    return body.user.token as string;
  }

  async function idOf(email: string): Promise<string> {
    const user = await usersRepository.findOneOrFail({ where: { email } });
    return user.id;
  }

  function uniqueRegisterDto(): {
    email: string;
    username: string;
    password: string;
  } {
    const suffix = randomUUID().replace(/-/g, '').slice(0, 12);
    return {
      email: `pending-${suffix}@example.test`,
      username: `pending_${suffix}`,
      password: 'DemoPass123!',
    };
  }

  describe('GET /admin/users', () => {
    it('rejects a request without a token with 401', async () => {
      await request(app.getHttpServer()).get('/api/v1/admin/users').expect(401);
    });

    it('rejects a CUSTOMER token with 403', async () => {
      const token = await loginAs(SEED_ALICE_EMAIL);

      await request(app.getHttpServer())
        .get('/api/v1/admin/users')
        .set('Authorization', `Bearer ${token}`)
        .expect(403);
    });

    it('lists users without password/token for an ADMIN', async () => {
      const token = await loginAs(SEED_BOB_EMAIL);

      const response = await request(app.getHttpServer())
        .get('/api/v1/admin/users')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);
      const body = response.body as AdminUsersResponseDto;

      expect(body.usersCount).toBeGreaterThanOrEqual(2);
      const emails = body.users.map((user) => user.email);
      expect(emails).toEqual(expect.arrayContaining([SEED_ALICE_EMAIL]));
      expect(
        body.users.some((user) => 'passwordHash' in user || 'token' in user),
      ).toBe(false);
    });

    it('filters by role', async () => {
      const token = await loginAs(SEED_BOB_EMAIL);

      const response = await request(app.getHttpServer())
        .get('/api/v1/admin/users?role=ADMIN')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);
      const body = response.body as AdminUsersResponseDto;

      expect(body.users.every((user) => user.role === UserRole.ADMIN)).toBe(
        true,
      );
    });

    it('filters by search keyword matching username/email', async () => {
      const token = await loginAs(SEED_BOB_EMAIL);

      const response = await request(app.getHttpServer())
        .get('/api/v1/admin/users?q=seed_alice')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);
      const body = response.body as AdminUsersResponseDto;

      expect(body.users.map((user) => user.username)).toEqual(['seed_alice']);
    });

    it('rejects an out-of-range limit with 400', async () => {
      const token = await loginAs(SEED_BOB_EMAIL);

      await request(app.getHttpServer())
        .get('/api/v1/admin/users?limit=51')
        .set('Authorization', `Bearer ${token}`)
        .expect(400);
    });
  });

  describe('GET /admin/users/:id', () => {
    it('returns detail with emailVerifiedAt and orderCount for an ADMIN', async () => {
      const token = await loginAs(SEED_BOB_EMAIL);
      const aliceId = await idOf(SEED_ALICE_EMAIL);

      const response = await request(app.getHttpServer())
        .get(`/api/v1/admin/users/${aliceId}`)
        .set('Authorization', `Bearer ${token}`)
        .expect(200);
      const body = response.body as AdminUserResponseDto;

      expect(body.user.id).toBe(aliceId);
      expect(body.user.orderCount).toBe(0);
      expect(body.user.emailVerifiedAt).not.toBeNull();
    });

    it('returns 404 for an id that does not exist', async () => {
      const token = await loginAs(SEED_BOB_EMAIL);

      await request(app.getHttpServer())
        .get(`/api/v1/admin/users/${randomUUID()}`)
        .set('Authorization', `Bearer ${token}`)
        .expect(404);
    });

    it('returns 400 for a malformed id', async () => {
      const token = await loginAs(SEED_BOB_EMAIL);

      await request(app.getHttpServer())
        .get('/api/v1/admin/users/not-a-uuid')
        .set('Authorization', `Bearer ${token}`)
        .expect(400);
    });

    it('rejects a CUSTOMER token with 403', async () => {
      const token = await loginAs(SEED_ALICE_EMAIL);
      const bobId = await idOf(SEED_BOB_EMAIL);

      await request(app.getHttpServer())
        .get(`/api/v1/admin/users/${bobId}`)
        .set('Authorization', `Bearer ${token}`)
        .expect(403);
    });
  });

  describe('PATCH /admin/users/:id/status', () => {
    it('deactivates a user and blocks their existing token on the next request', async () => {
      const adminToken = await loginAs(SEED_BOB_EMAIL);
      const aliceToken = await loginAs(SEED_ALICE_EMAIL);
      const aliceId = await idOf(SEED_ALICE_EMAIL);

      await request(app.getHttpServer())
        .patch(`/api/v1/admin/users/${aliceId}/status`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ status: 'INACTIVE' })
        .expect(200);

      await request(app.getHttpServer())
        .get('/api/v1/users/me')
        .set('Authorization', `Bearer ${aliceToken}`)
        .expect(401);

      await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({ email: SEED_ALICE_EMAIL, password: SEED_PASSWORD })
        .expect(401);
    });

    it('reactivates a deactivated user', async () => {
      const adminToken = await loginAs(SEED_BOB_EMAIL);
      const aliceId = await idOf(SEED_ALICE_EMAIL);

      await request(app.getHttpServer())
        .patch(`/api/v1/admin/users/${aliceId}/status`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ status: 'INACTIVE' })
        .expect(200);

      const response = await request(app.getHttpServer())
        .patch(`/api/v1/admin/users/${aliceId}/status`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ status: 'ACTIVE' })
        .expect(200);
      const body = response.body as AdminUserResponseDto;

      expect(body.user.status).toBe('ACTIVE');
      await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({ email: SEED_ALICE_EMAIL, password: SEED_PASSWORD })
        .expect(200);
    });

    it('rejects an admin deactivating their own account with 409', async () => {
      const adminToken = await loginAs(SEED_BOB_EMAIL);
      const bobId = await idOf(SEED_BOB_EMAIL);

      await request(app.getHttpServer())
        .patch(`/api/v1/admin/users/${bobId}/status`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ status: 'INACTIVE' })
        .expect(409);
    });

    it('rejects re-sending the status the account already has with 409', async () => {
      const adminToken = await loginAs(SEED_BOB_EMAIL);
      const aliceId = await idOf(SEED_ALICE_EMAIL);

      await request(app.getHttpServer())
        .patch(`/api/v1/admin/users/${aliceId}/status`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ status: 'ACTIVE' })
        .expect(409);
    });

    it('rejects changing the status of a PENDING (unverified) account with 409', async () => {
      const adminToken = await loginAs(SEED_BOB_EMAIL);
      const dto = uniqueRegisterDto();
      await request(app.getHttpServer())
        .post('/api/v1/auth/register')
        .send(dto)
        .expect(201);
      const pendingId = await idOf(dto.email);

      await request(app.getHttpServer())
        .patch(`/api/v1/admin/users/${pendingId}/status`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ status: 'ACTIVE' })
        .expect(409);
    });

    it('rejects an invalid status value with 400', async () => {
      const adminToken = await loginAs(SEED_BOB_EMAIL);
      const aliceId = await idOf(SEED_ALICE_EMAIL);

      await request(app.getHttpServer())
        .patch(`/api/v1/admin/users/${aliceId}/status`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ status: 'PENDING' })
        .expect(400);
    });

    it('rejects a CUSTOMER token with 403', async () => {
      const customerToken = await loginAs(SEED_ALICE_EMAIL);
      const bobId = await idOf(SEED_BOB_EMAIL);

      await request(app.getHttpServer())
        .patch(`/api/v1/admin/users/${bobId}/status`)
        .set('Authorization', `Bearer ${customerToken}`)
        .send({ status: 'INACTIVE' })
        .expect(403);
    });

    it('rejects a request without a token with 401', async () => {
      const aliceId = await idOf(SEED_ALICE_EMAIL);

      await request(app.getHttpServer())
        .patch(`/api/v1/admin/users/${aliceId}/status`)
        .send({ status: 'INACTIVE' })
        .expect(401);
    });
  });
});
