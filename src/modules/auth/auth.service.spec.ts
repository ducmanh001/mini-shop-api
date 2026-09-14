import {
  BadRequestException,
  ConflictException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { I18nService } from 'nestjs-i18n';
import { DataSource, EntityManager } from 'typeorm';
import { UserRole } from '../../common/enums/user-role.enum';
import { RedisService } from '../../redis/redis.service';
import { EmailNotification } from '../notifications/entities/email-notification.entity';
import { EmailNotificationEventType } from '../notifications/enums/email-notification-event-type.enum';
import { UserStatus } from '../users/enums/user-status.enum';
import { UsersService } from '../users/users.service';
import { AuthService } from './auth.service';
import { AuthToken } from './entities/auth-token.entity';
import { AuthTokenType } from './enums/auth-token-type.enum';

jest.mock('bcrypt', () => ({
  hash: jest.fn(),
  compare: jest.fn(),
}));

const bcrypt = jest.requireMock<{ hash: jest.Mock; compare: jest.Mock }>(
  'bcrypt',
);

describe('AuthService', () => {
  let usersService: {
    create: jest.Mock;
    findByEmail: jest.Mock;
    markEmailVerified: jest.Mock;
    toResponseDto: jest.Mock;
  };
  let jwtService: { sign: jest.Mock };
  let redisService: {
    blacklistToken: jest.Mock;
    isTokenBlacklisted: jest.Mock;
  };
  let config: { getOrThrow: jest.Mock };
  let i18n: { t: jest.Mock };
  let dataSource: { transaction: jest.Mock };
  let authTokenRepository: {
    create: jest.Mock<AuthToken, [Partial<AuthToken>]>;
    save: jest.Mock<Promise<AuthToken>, [AuthToken]>;
    findOne: jest.Mock;
    createQueryBuilder: jest.Mock;
  };
  let notificationRepository: {
    create: jest.Mock<EmailNotification, [Partial<EmailNotification>]>;
    save: jest.Mock<Promise<EmailNotification>, [EmailNotification]>;
  };
  let manager: { getRepository: jest.Mock };
  let service: AuthService;

  beforeEach(() => {
    usersService = {
      create: jest.fn(),
      findByEmail: jest.fn(),
      markEmailVerified: jest.fn(),
      toResponseDto: jest.fn((user: object, token?: string) => ({
        user: { ...user, token },
      })),
    };
    jwtService = { sign: jest.fn().mockReturnValue('signed-jwt') };
    redisService = {
      blacklistToken: jest.fn(),
      isTokenBlacklisted: jest.fn(),
    };
    config = { getOrThrow: jest.fn().mockReturnValue(86400) };
    i18n = { t: jest.fn((key: string) => key) };

    authTokenRepository = {
      create: jest.fn(
        (data: Partial<AuthToken>) =>
          ({ id: 'auth-token-1', ...data }) as AuthToken,
      ),
      save: jest.fn((entity: AuthToken) => Promise.resolve(entity)),
      findOne: jest.fn(),
      createQueryBuilder: jest.fn(),
    };
    notificationRepository = {
      create: jest.fn(
        (data: Partial<EmailNotification>) =>
          ({ id: 'notif-1', ...data }) as EmailNotification,
      ),
      save: jest.fn((entity: EmailNotification) => Promise.resolve(entity)),
    };
    manager = {
      getRepository: jest.fn((entity: unknown) => {
        if (entity === AuthToken) return authTokenRepository;
        if (entity === EmailNotification) return notificationRepository;
        throw new Error('unexpected entity requested from manager');
      }),
    };
    dataSource = {
      transaction: jest.fn((callback: (m: EntityManager) => Promise<unknown>) =>
        callback(manager as unknown as EntityManager),
      ),
    };

    bcrypt.hash.mockResolvedValue('hashed-password');
    bcrypt.compare.mockResolvedValue(false);

    service = new AuthService(
      dataSource as unknown as DataSource,
      usersService as unknown as UsersService,
      jwtService as unknown as JwtService,
      redisService as unknown as RedisService,
      config as unknown as ConfigService,
      i18n as unknown as I18nService,
      Buffer.alloc(32, 1),
    );
  });

  describe('register', () => {
    it('creates the user, an EMAIL_VERIFICATION token and its notification inside one transaction', async () => {
      const createdUser = {
        id: 'user-1',
        email: 'a@example.test',
        username: 'alice',
        tokenVersion: 0,
      };
      usersService.create.mockResolvedValue(createdUser);

      await service.register({
        email: 'a@example.test',
        username: 'alice',
        password: 'DemoPass123!',
      });

      expect(dataSource.transaction).toHaveBeenCalledTimes(1);
      expect(usersService.create).toHaveBeenCalledWith(
        {
          email: 'a@example.test',
          username: 'alice',
          passwordHash: 'hashed-password',
        },
        manager,
      );

      expect(authTokenRepository.save).toHaveBeenCalledTimes(1);
      const insertedToken = authTokenRepository.save.mock.calls[0][0];
      expect(insertedToken.userId).toBe('user-1');
      expect(insertedToken.type).toBe(AuthTokenType.EMAIL_VERIFICATION);
      expect(insertedToken.tokenHash).toMatch(/^[0-9a-f]{64}$/);

      expect(notificationRepository.save).toHaveBeenCalledTimes(1);
      const insertedNotification = notificationRepository.save.mock.calls[0][0];
      expect(insertedNotification.authTokenId).toBe('auth-token-1');
      expect(insertedNotification.eventType).toBe(
        EmailNotificationEventType.EMAIL_VERIFICATION,
      );
      expect(insertedNotification.recipientEmail).toBe('a@example.test');
      expect(insertedNotification.secretCiphertext).toBeInstanceOf(Buffer);
      expect(insertedNotification.payload).toEqual({
        username: 'alice',
        templateVersion: 1,
      });

      expect(usersService.toResponseDto).toHaveBeenCalledWith(createdUser);
    });
  });

  describe('verifyEmail', () => {
    function mockQueryBuilder(affected: number) {
      const builder = {
        update: jest.fn().mockReturnThis(),
        set: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        execute: jest.fn().mockResolvedValue({ affected }),
      };
      authTokenRepository.createQueryBuilder.mockReturnValue(builder);
      return builder;
    }

    it('throws when no token matches the hash', async () => {
      authTokenRepository.findOne.mockResolvedValue(null);

      await expect(
        service.verifyEmail({ token: 'a'.repeat(64) }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('throws when the token was already used or expired (0 affected rows)', async () => {
      authTokenRepository.findOne.mockResolvedValue({
        id: 'auth-token-1',
        userId: 'user-1',
      });
      mockQueryBuilder(0);

      await expect(
        service.verifyEmail({ token: 'a'.repeat(64) }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('throws ConflictException when the account is no longer PENDING', async () => {
      authTokenRepository.findOne.mockResolvedValue({
        id: 'auth-token-1',
        userId: 'user-1',
      });
      mockQueryBuilder(1);
      usersService.markEmailVerified.mockResolvedValue(false);

      await expect(
        service.verifyEmail({ token: 'a'.repeat(64) }),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it('activates the account when the token is valid and unused', async () => {
      authTokenRepository.findOne.mockResolvedValue({
        id: 'auth-token-1',
        userId: 'user-1',
      });
      mockQueryBuilder(1);
      usersService.markEmailVerified.mockResolvedValue(true);

      await expect(
        service.verifyEmail({ token: 'a'.repeat(64) }),
      ).resolves.toBeUndefined();
      expect(usersService.markEmailVerified).toHaveBeenCalledWith(
        'user-1',
        manager,
      );
    });
  });

  describe('login', () => {
    const user = {
      id: 'user-1',
      email: 'a@example.test',
      passwordHash: 'hashed-password',
      tokenVersion: 0,
      status: UserStatus.ACTIVE,
    };

    it('throws generic invalidCredentials when the email is unknown', async () => {
      usersService.findByEmail.mockResolvedValue(null);

      await expect(
        service.login({ email: 'nobody@example.test', password: 'x' }),
      ).rejects.toBeInstanceOf(UnauthorizedException);
      expect(bcrypt.compare).toHaveBeenCalled();
    });

    it('throws generic invalidCredentials when the password is wrong', async () => {
      usersService.findByEmail.mockResolvedValue(user);
      bcrypt.compare.mockResolvedValue(false);

      await expect(
        service.login({ email: user.email, password: 'wrong' }),
      ).rejects.toBeInstanceOf(UnauthorizedException);
    });

    it('rejects a PENDING account even with correct credentials', async () => {
      usersService.findByEmail.mockResolvedValue({
        ...user,
        status: UserStatus.PENDING,
      });
      bcrypt.compare.mockResolvedValue(true);

      await expect(
        service.login({ email: user.email, password: 'right' }),
      ).rejects.toBeInstanceOf(UnauthorizedException);
    });

    it('rejects an INACTIVE account even with correct credentials', async () => {
      usersService.findByEmail.mockResolvedValue({
        ...user,
        status: UserStatus.INACTIVE,
      });
      bcrypt.compare.mockResolvedValue(true);

      await expect(
        service.login({ email: user.email, password: 'right' }),
      ).rejects.toBeInstanceOf(UnauthorizedException);
    });

    it('issues an access token for an ACTIVE account with correct credentials', async () => {
      usersService.findByEmail.mockResolvedValue(user);
      bcrypt.compare.mockResolvedValue(true);

      await service.login({ email: user.email, password: 'right' });

      expect(jwtService.sign).toHaveBeenCalledWith(
        expect.objectContaining({ sub: 'user-1', tokenVersion: 0 }),
      );
      expect(usersService.toResponseDto).toHaveBeenCalledWith(
        user,
        'signed-jwt',
      );
    });
  });

  describe('logout', () => {
    it('blacklists the current token for the configured JWT lifetime', async () => {
      await service.logout({
        id: 'user-1',
        role: UserRole.CUSTOMER,
        status: UserStatus.ACTIVE,
        tokenId: 'token-1',
        tokenVersion: 0,
      });

      expect(redisService.blacklistToken).toHaveBeenCalledWith(
        'token-1',
        86400,
      );
    });
  });
});
