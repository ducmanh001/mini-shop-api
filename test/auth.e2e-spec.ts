import { INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { getRepositoryToken } from '@nestjs/typeorm';
import { randomUUID } from 'crypto';
import request from 'supertest';
import type { App } from 'supertest/types';
import { Repository } from 'typeorm';
import { decryptNotificationSecret } from '../src/common/utils/notification-secret-cipher.util';
import { AuthToken } from '../src/modules/auth/entities/auth-token.entity';
import { EmailNotification } from '../src/modules/notifications/entities/email-notification.entity';
import { UserResponseDto } from '../src/modules/users/dto/user-response.dto';
import { User } from '../src/modules/users/entities/user.entity';
import { UserStatus } from '../src/modules/users/enums/user-status.enum';
import { createTestApp } from './utils/create-test-app';
import { SEED_ALICE_EMAIL, SEED_PASSWORD } from './utils/seed-database';

/**
 * Chứng minh flow AUTH-01/02/03/06 end-to-end trên Postgres thật, kể cả token activation thật —
 * giải mã `secretCiphertext` bằng đúng `NOTIFICATION_SECRET_KEY` mà `AuthService.register()` đã
 * dùng để mã hoá (test/utils/seed-database.ts cấp sẵn seed_alice ACTIVE cho các case login/logout).
 */
describe('Auth (e2e)', () => {
  let app: INestApplication<App>;
  let usersRepository: Repository<User>;
  let authTokenRepository: Repository<AuthToken>;
  let notificationsRepository: Repository<EmailNotification>;
  let notificationSecretKey: Buffer;

  beforeAll(async () => {
    app = await createTestApp();
    usersRepository = app.get(getRepositoryToken(User));
    authTokenRepository = app.get(getRepositoryToken(AuthToken));
    notificationsRepository = app.get(getRepositoryToken(EmailNotification));
    notificationSecretKey = Buffer.from(
      app.get(ConfigService).getOrThrow<string>('NOTIFICATION_SECRET_KEY'),
      'base64',
    );
  });

  afterAll(async () => {
    if (app) {
      await app.close();
    }
  });

  function uniqueRegisterDto(): {
    email: string;
    username: string;
    password: string;
  } {
    const suffix = randomUUID().replace(/-/g, '').slice(0, 12);
    return {
      email: `auth-${suffix}@example.test`,
      username: `auth_${suffix}`,
      password: 'DemoPass123!',
    };
  }

  async function registerUser(dto: {
    email: string;
    username: string;
    password: string;
  }): Promise<void> {
    await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send(dto)
      .expect(201);
  }

  async function extractVerificationToken(email: string): Promise<string> {
    const user = await usersRepository.findOneOrFail({ where: { email } });
    const authToken = await authTokenRepository.findOneOrFail({
      where: { userId: user.id },
    });
    const notification = await notificationsRepository.findOneOrFail({
      where: { authTokenId: authToken.id },
    });
    return decryptNotificationSecret(
      notification.secretCiphertext as Buffer,
      notificationSecretKey,
    );
  }

  describe('POST /auth/register', () => {
    it('creates a PENDING account without an access token', async () => {
      const dto = uniqueRegisterDto();

      const response = await request(app.getHttpServer())
        .post('/api/v1/auth/register')
        .send(dto)
        .expect(201);
      const body = response.body as UserResponseDto;

      expect(body.user.email).toBe(dto.email);
      expect(body.user.username).toBe(dto.username);
      expect(body.user.status).toBe(UserStatus.PENDING);
      expect(body.user.emailVerifiedAt).toBeNull();
      expect(body.user.token).toBeUndefined();
    });

    it('rejects a duplicate email with 409', async () => {
      const dto = uniqueRegisterDto();
      await registerUser(dto);

      await request(app.getHttpServer())
        .post('/api/v1/auth/register')
        .send({ ...dto, username: `${dto.username}2` })
        .expect(409);
    });

    it('rejects a duplicate username with 409', async () => {
      const dto = uniqueRegisterDto();
      await registerUser(dto);

      await request(app.getHttpServer())
        .post('/api/v1/auth/register')
        .send({ ...dto, email: `dup-${dto.email}` })
        .expect(409);
    });

    it('rejects a request that tries to set role/status with 400', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/auth/register')
        .send({ ...uniqueRegisterDto(), role: 'ADMIN' })
        .expect(400);
    });
  });

  describe('POST /auth/verify-email', () => {
    it('activates a PENDING account with the real emailed token', async () => {
      const dto = uniqueRegisterDto();
      await registerUser(dto);
      const token = await extractVerificationToken(dto.email);

      await request(app.getHttpServer())
        .post('/api/v1/auth/verify-email')
        .send({ token })
        .expect(204);

      const user = await usersRepository.findOneOrFail({
        where: { email: dto.email },
      });
      expect(user.status).toBe(UserStatus.ACTIVE);
      expect(user.emailVerifiedAt).not.toBeNull();
    });

    it('rejects reusing the same token twice', async () => {
      const dto = uniqueRegisterDto();
      await registerUser(dto);
      const token = await extractVerificationToken(dto.email);

      await request(app.getHttpServer())
        .post('/api/v1/auth/verify-email')
        .send({ token })
        .expect(204);
      await request(app.getHttpServer())
        .post('/api/v1/auth/verify-email')
        .send({ token })
        .expect(400);
    });

    it('rejects an unknown token with 400', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/auth/verify-email')
        .send({ token: 'z'.repeat(64) })
        .expect(400);
    });

    it('rejects verifying an account an admin already deactivated with 409', async () => {
      const dto = uniqueRegisterDto();
      await registerUser(dto);
      const token = await extractVerificationToken(dto.email);
      await usersRepository.update(
        { email: dto.email },
        { status: UserStatus.INACTIVE },
      );

      await request(app.getHttpServer())
        .post('/api/v1/auth/verify-email')
        .send({ token })
        .expect(409);
    });
  });

  describe('POST /auth/login', () => {
    it('logs in an ACTIVE account and returns an access token', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({ email: SEED_ALICE_EMAIL, password: SEED_PASSWORD })
        .expect(200);
      const body = response.body as UserResponseDto;

      expect(typeof body.user.token).toBe('string');
      expect(body.user.token?.length).toBeGreaterThan(0);
    });

    it('rejects a PENDING account (not yet verified) with 401', async () => {
      const dto = uniqueRegisterDto();
      await registerUser(dto);

      await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({ email: dto.email, password: dto.password })
        .expect(401);
    });

    it('rejects a wrong password with 401', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({ email: SEED_ALICE_EMAIL, password: 'WrongPass123!' })
        .expect(401);
    });

    it('rejects an unknown email with 401', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({ email: 'nobody@example.test', password: 'DemoPass123!' })
        .expect(401);
    });
  });

  describe('POST /auth/logout', () => {
    async function loginAsSeedAlice(): Promise<string> {
      const response = await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({ email: SEED_ALICE_EMAIL, password: SEED_PASSWORD })
        .expect(200);
      const body = response.body as UserResponseDto;
      return body.user.token as string;
    }

    it('revokes the current token so a second call with it is rejected', async () => {
      const token = await loginAsSeedAlice();

      await request(app.getHttpServer())
        .post('/api/v1/auth/logout')
        .set('Authorization', `Bearer ${token}`)
        .expect(204);

      await request(app.getHttpServer())
        .post('/api/v1/auth/logout')
        .set('Authorization', `Bearer ${token}`)
        .expect(401);
    });

    it('rejects logout without a token', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/auth/logout')
        .expect(401);
    });
  });
});
