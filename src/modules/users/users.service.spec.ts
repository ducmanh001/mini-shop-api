import { ConflictException } from '@nestjs/common';
import { I18nService } from 'nestjs-i18n';
import { EntityManager, QueryFailedError, Repository } from 'typeorm';
import { UserRole } from '../../common/enums/user-role.enum';
import { User } from './entities/user.entity';
import { UserStatus } from './enums/user-status.enum';
import { UsersService } from './users.service';

function buildUniqueViolation(constraint: string): QueryFailedError {
  const error = new QueryFailedError('INSERT', [], new Error('duplicate'));
  (error as unknown as { driverError: unknown }).driverError = {
    code: '23505',
    constraint,
  };
  return error;
}

describe('UsersService', () => {
  let usersRepository: jest.Mocked<
    Pick<Repository<User>, 'create' | 'save' | 'findOne'>
  >;
  let i18n: { t: jest.Mock };
  let service: UsersService;

  beforeEach(() => {
    usersRepository = {
      create: jest.fn((data) => data as User),
      save: jest.fn(),
      findOne: jest.fn(),
    };
    i18n = { t: jest.fn((key: string) => key) };
    service = new UsersService(
      usersRepository as unknown as Repository<User>,
      i18n as unknown as I18nService,
    );
  });

  describe('create', () => {
    it('creates a CUSTOMER/PENDING user regardless of input', async () => {
      const user = await service.create({
        email: 'a@example.test',
        username: 'alice',
        passwordHash: 'hash',
      });

      expect(user.role).toBe(UserRole.CUSTOMER);
      expect(user.status).toBe(UserStatus.PENDING);
      expect(usersRepository.save).toHaveBeenCalledWith(user);
    });

    it('maps a duplicate email into ConflictException', async () => {
      usersRepository.save.mockRejectedValue(
        buildUniqueViolation('uq_users_email'),
      );

      await expect(
        service.create({
          email: 'a@example.test',
          username: 'alice',
          passwordHash: 'hash',
        }),
      ).rejects.toBeInstanceOf(ConflictException);
      expect(i18n.t).toHaveBeenCalledWith('errors.emailAlreadyRegistered');
    });

    it('maps a duplicate username into ConflictException', async () => {
      usersRepository.save.mockRejectedValue(
        buildUniqueViolation('uq_users_username'),
      );

      await expect(
        service.create({
          email: 'a@example.test',
          username: 'alice',
          passwordHash: 'hash',
        }),
      ).rejects.toBeInstanceOf(ConflictException);
      expect(i18n.t).toHaveBeenCalledWith('errors.usernameAlreadyTaken');
    });

    it('rethrows non-unique-violation errors as-is', async () => {
      const unexpected = new Error('connection lost');
      usersRepository.save.mockRejectedValue(unexpected);

      await expect(
        service.create({
          email: 'a@example.test',
          username: 'alice',
          passwordHash: 'hash',
        }),
      ).rejects.toBe(unexpected);
    });
  });

  describe('findByEmail', () => {
    it('selects only the columns needed for login', async () => {
      const user = { id: 'u1', email: 'a@example.test' } as User;
      usersRepository.findOne.mockResolvedValue(user);

      await expect(service.findByEmail('a@example.test')).resolves.toBe(user);
      expect(usersRepository.findOne).toHaveBeenCalledWith(
        expect.objectContaining({ where: { email: 'a@example.test' } }),
      );
    });

    it('returns null when no user matches the email', async () => {
      usersRepository.findOne.mockResolvedValue(null);

      await expect(
        service.findByEmail('nobody@example.test'),
      ).resolves.toBeNull();
    });
  });

  describe('findById', () => {
    it('selects only the columns needed by JwtStrategy', async () => {
      const user = { id: 'u1', role: UserRole.CUSTOMER } as User;
      usersRepository.findOne.mockResolvedValue(user);

      await expect(service.findById('u1')).resolves.toBe(user);
      expect(usersRepository.findOne).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 'u1' } }),
      );
    });

    it('returns null when no user matches the id', async () => {
      usersRepository.findOne.mockResolvedValue(null);

      await expect(service.findById('missing')).resolves.toBeNull();
    });
  });

  describe('markEmailVerified', () => {
    it('returns true when a PENDING user was activated', async () => {
      const execute = jest.fn().mockResolvedValue({ affected: 1 });
      const manager = {
        createQueryBuilder: jest.fn().mockReturnValue({
          update: jest.fn().mockReturnThis(),
          set: jest.fn().mockReturnThis(),
          where: jest.fn().mockReturnThis(),
          andWhere: jest.fn().mockReturnThis(),
          execute,
        }),
      } as unknown as EntityManager;

      await expect(service.markEmailVerified('user-1', manager)).resolves.toBe(
        true,
      );
    });

    it('returns false when the user is no longer PENDING', async () => {
      const execute = jest.fn().mockResolvedValue({ affected: 0 });
      const manager = {
        createQueryBuilder: jest.fn().mockReturnValue({
          update: jest.fn().mockReturnThis(),
          set: jest.fn().mockReturnThis(),
          where: jest.fn().mockReturnThis(),
          andWhere: jest.fn().mockReturnThis(),
          execute,
        }),
      } as unknown as EntityManager;

      await expect(service.markEmailVerified('user-1', manager)).resolves.toBe(
        false,
      );
    });
  });

  describe('toResponseDto', () => {
    it('builds the envelope without a token by default', () => {
      const user = {
        id: 'u1',
        email: 'a@example.test',
        username: 'alice',
        role: UserRole.CUSTOMER,
        status: UserStatus.ACTIVE,
        emailVerifiedAt: null,
      } as User;

      const dto = service.toResponseDto(user);

      expect(dto.user.token).toBeUndefined();
      expect(dto.user.email).toBe('a@example.test');
    });

    it('includes the token when provided (login/register)', () => {
      const user = {
        id: 'u1',
        email: 'a@example.test',
        username: 'alice',
        role: UserRole.CUSTOMER,
        status: UserStatus.PENDING,
        emailVerifiedAt: null,
      } as User;

      const dto = service.toResponseDto(user, 'jwt-token');

      expect(dto.user.token).toBe('jwt-token');
    });
  });
});
