import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import type { App } from 'supertest/types';
import { UserResponseDto } from '../src/modules/users/dto/user-response.dto';
import { createTestApp } from './utils/create-test-app';
import { SEED_ALICE_EMAIL, SEED_PASSWORD } from './utils/seed-database';

/** Chứng minh USER-01/02/03 (PR07) end-to-end trên Postgres thật: GET/PATCH me, đổi mật khẩu. */
describe('Users (e2e)', () => {
  let app: INestApplication<App>;

  beforeAll(async () => {
    app = await createTestApp();
  });

  afterAll(async () => {
    if (app) {
      await app.close();
    }
  });

  async function loginAsSeedAlice(): Promise<string> {
    const response = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email: SEED_ALICE_EMAIL, password: SEED_PASSWORD })
      .expect(200);
    const body = response.body as UserResponseDto;
    return body.user.token as string;
  }

  describe('GET /users/me', () => {
    it("returns the current account's profile without a token or password hash", async () => {
      const token = await loginAsSeedAlice();

      const response = await request(app.getHttpServer())
        .get('/api/v1/users/me')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);
      const body = response.body as UserResponseDto;

      expect(body.user.email).toBe(SEED_ALICE_EMAIL);
      expect(body.user.username).toBe('seed_alice');
      expect(body.user.token).toBeUndefined();
      expect(
        (body.user as unknown as Record<string, unknown>).passwordHash,
      ).toBeUndefined();
    });

    it('rejects a request without a token with 401', async () => {
      await request(app.getHttpServer()).get('/api/v1/users/me').expect(401);
    });
  });

  describe('PATCH /users/me', () => {
    it('updates the username and persists the change', async () => {
      const token = await loginAsSeedAlice();

      const response = await request(app.getHttpServer())
        .patch('/api/v1/users/me')
        .set('Authorization', `Bearer ${token}`)
        .send({ username: 'seed_alice_renamed' })
        .expect(200);
      const body = response.body as UserResponseDto;
      expect(body.user.username).toBe('seed_alice_renamed');

      const refreshed = await request(app.getHttpServer())
        .get('/api/v1/users/me')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);
      expect((refreshed.body as UserResponseDto).user.username).toBe(
        'seed_alice_renamed',
      );
    });

    it('rejects an empty body with 400', async () => {
      const token = await loginAsSeedAlice();

      await request(app.getHttpServer())
        .patch('/api/v1/users/me')
        .set('Authorization', `Bearer ${token}`)
        .send({})
        .expect(400);
    });

    it('rejects a username already taken by another account with 409', async () => {
      const token = await loginAsSeedAlice();

      await request(app.getHttpServer())
        .patch('/api/v1/users/me')
        .set('Authorization', `Bearer ${token}`)
        .send({ username: 'seed_bob' })
        .expect(409);
    });

    it('rejects a request without a token with 401', async () => {
      await request(app.getHttpServer())
        .patch('/api/v1/users/me')
        .send({ username: 'someone_else' })
        .expect(401);
    });
  });

  describe('PATCH /users/me/password', () => {
    it('rejects a wrong currentPassword with 401', async () => {
      const token = await loginAsSeedAlice();

      await request(app.getHttpServer())
        .patch('/api/v1/users/me/password')
        .set('Authorization', `Bearer ${token}`)
        .send({
          currentPassword: 'WrongPass123!',
          newPassword: 'NewSeedPass456!',
          confirmPassword: 'NewSeedPass456!',
        })
        .expect(401);
    });

    it('rejects a confirmPassword that does not match newPassword with 400', async () => {
      const token = await loginAsSeedAlice();

      await request(app.getHttpServer())
        .patch('/api/v1/users/me/password')
        .set('Authorization', `Bearer ${token}`)
        .send({
          currentPassword: SEED_PASSWORD,
          newPassword: 'NewSeedPass456!',
          confirmPassword: 'SomethingElse789!',
        })
        .expect(400);
    });

    it('rejects a newPassword equal to currentPassword with 400', async () => {
      const token = await loginAsSeedAlice();

      await request(app.getHttpServer())
        .patch('/api/v1/users/me/password')
        .set('Authorization', `Bearer ${token}`)
        .send({
          currentPassword: SEED_PASSWORD,
          newPassword: SEED_PASSWORD,
          confirmPassword: SEED_PASSWORD,
        })
        .expect(400);
    });

    it('changes the password and revokes previously issued access tokens', async () => {
      const oldToken = await loginAsSeedAlice();

      await request(app.getHttpServer())
        .patch('/api/v1/users/me/password')
        .set('Authorization', `Bearer ${oldToken}`)
        .send({
          currentPassword: SEED_PASSWORD,
          newPassword: 'NewSeedPass456!',
          confirmPassword: 'NewSeedPass456!',
        })
        .expect(204);

      await request(app.getHttpServer())
        .get('/api/v1/users/me')
        .set('Authorization', `Bearer ${oldToken}`)
        .expect(401);

      await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({ email: SEED_ALICE_EMAIL, password: SEED_PASSWORD })
        .expect(401);
      await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({ email: SEED_ALICE_EMAIL, password: 'NewSeedPass456!' })
        .expect(200);
    });

    it('rejects a request without a token with 401', async () => {
      await request(app.getHttpServer())
        .patch('/api/v1/users/me/password')
        .send({
          currentPassword: SEED_PASSWORD,
          newPassword: 'NewSeedPass456!',
          confirmPassword: 'NewSeedPass456!',
        })
        .expect(401);
    });
  });
});
