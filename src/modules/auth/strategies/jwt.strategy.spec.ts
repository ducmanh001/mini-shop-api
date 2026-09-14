import { UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { I18nService } from 'nestjs-i18n';
import { UserRole } from '../../../common/enums/user-role.enum';
import { RedisService } from '../../../redis/redis.service';
import { UserStatus } from '../../users/enums/user-status.enum';
import { UsersService } from '../../users/users.service';
import { JwtStrategy } from './jwt.strategy';

describe('JwtStrategy', () => {
  let usersService: { findById: jest.Mock };
  let redisService: { isTokenBlacklisted: jest.Mock };
  let strategy: JwtStrategy;

  beforeEach(() => {
    usersService = { findById: jest.fn() };
    redisService = { isTokenBlacklisted: jest.fn().mockResolvedValue(false) };
    const config = {
      getOrThrow: jest.fn().mockReturnValue('a'.repeat(32)),
    };
    const i18n = { t: jest.fn((key: string) => key) };
    strategy = new JwtStrategy(
      config as unknown as ConfigService,
      usersService as unknown as UsersService,
      redisService as unknown as RedisService,
      i18n as unknown as I18nService,
    );
  });

  const payload = { sub: 'user-1', jti: 'token-1', tokenVersion: 0 };

  it('rejects a blacklisted token without querying the user', async () => {
    redisService.isTokenBlacklisted.mockResolvedValue(true);

    await expect(strategy.validate(payload)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
    expect(usersService.findById).not.toHaveBeenCalled();
  });

  it('rejects when the user no longer exists', async () => {
    usersService.findById.mockResolvedValue(null);

    await expect(strategy.validate(payload)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it('rejects when the user is not ACTIVE', async () => {
    usersService.findById.mockResolvedValue({
      id: 'user-1',
      role: UserRole.CUSTOMER,
      status: UserStatus.INACTIVE,
      tokenVersion: 0,
    });

    await expect(strategy.validate(payload)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it('rejects when tokenVersion no longer matches the DB', async () => {
    usersService.findById.mockResolvedValue({
      id: 'user-1',
      role: UserRole.CUSTOMER,
      status: UserStatus.ACTIVE,
      tokenVersion: 1,
    });

    await expect(strategy.validate(payload)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it('returns the AuthenticatedUser for a valid, current token', async () => {
    usersService.findById.mockResolvedValue({
      id: 'user-1',
      role: UserRole.ADMIN,
      status: UserStatus.ACTIVE,
      tokenVersion: 0,
    });

    await expect(strategy.validate(payload)).resolves.toEqual({
      id: 'user-1',
      role: UserRole.ADMIN,
      status: UserStatus.ACTIVE,
      tokenId: 'token-1',
      tokenVersion: 0,
    });
  });
});
