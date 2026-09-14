import {
  BadRequestException,
  ConflictException,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { I18nService } from 'nestjs-i18n';
import { EntityManager, QueryFailedError, Repository } from 'typeorm';
import { UserRole } from '../../common/enums/user-role.enum';
import { User } from './entities/user.entity';
import { UserStatus } from './enums/user-status.enum';
import { UsersService } from './users.service';

jest.mock('bcrypt', () => ({
  hash: jest.fn(),
  compare: jest.fn(),
}));

const bcrypt = jest.requireMock<{ hash: jest.Mock; compare: jest.Mock }>(
  'bcrypt',
);

function buildUniqueViolation(constraint: string): QueryFailedError {
  const error = new QueryFailedError('INSERT', [], new Error('duplicate'));
  (error as unknown as { driverError: unknown }).driverError = {
    code: '23505',
    constraint,
  };
  return error;
}

interface UpdatePasswordSetArg {
  passwordHash: string;
  tokenVersion: () => string;
}

/** Dùng chung cho mọi test cần mock `createQueryBuilder().update().set().where().execute()`. */
function mockUpdateQueryBuilder(repository: { createQueryBuilder: jest.Mock }) {
  const set = jest.fn<unknown, [UpdatePasswordSetArg]>().mockReturnThis();
  const builder = {
    update: jest.fn().mockReturnThis(),
    set,
    where: jest.fn().mockReturnThis(),
    execute: jest.fn().mockResolvedValue({ affected: 1 }),
  };
  repository.createQueryBuilder.mockReturnValue(builder);
  return builder;
}

describe('UsersService', () => {
  let usersRepository: jest.Mocked<
    Pick<Repository<User>, 'create' | 'save' | 'findOne' | 'update'>
  > & { createQueryBuilder: jest.Mock };
  let i18n: { t: jest.Mock };
  let service: UsersService;

  beforeEach(() => {
    usersRepository = {
      create: jest.fn((data) => data as User),
      save: jest.fn(),
      findOne: jest.fn(),
      update: jest.fn(),
      createQueryBuilder: jest.fn(),
    };
    i18n = { t: jest.fn((key: string) => key) };
    bcrypt.hash.mockResolvedValue('hashed-new-password');
    bcrypt.compare.mockResolvedValue(false);
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

  describe('findProfileById', () => {
    it('selects the columns needed for UserResponse (GET/PATCH me)', async () => {
      const user = { id: 'u1', username: 'alice' } as User;
      usersRepository.findOne.mockResolvedValue(user);

      await expect(service.findProfileById('u1')).resolves.toBe(user);
      expect(usersRepository.findOne).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 'u1' } }),
      );
    });

    it('returns null when no user matches the id', async () => {
      usersRepository.findOne.mockResolvedValue(null);

      await expect(service.findProfileById('missing')).resolves.toBeNull();
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

  describe('updatePassword', () => {
    it('sets the new hash and atomically increments tokenVersion', async () => {
      const builder = mockUpdateQueryBuilder(usersRepository);

      await service.updatePassword('user-1', 'new-hash');

      expect(builder.where).toHaveBeenCalledWith('id = :id', { id: 'user-1' });
      const setArg = builder.set.mock.calls[0][0];
      expect(setArg.passwordHash).toBe('new-hash');
      expect(setArg.tokenVersion()).toBe('token_version + 1');
    });

    it('uses the given manager instead of the default repository inside a transaction', async () => {
      const managerRepository = { createQueryBuilder: jest.fn() };
      mockUpdateQueryBuilder(managerRepository);
      const manager = { getRepository: jest.fn(() => managerRepository) };

      await service.updatePassword(
        'user-1',
        'new-hash',
        manager as unknown as EntityManager,
      );

      expect(manager.getRepository).toHaveBeenCalledWith(User);
      expect(usersRepository.createQueryBuilder).not.toHaveBeenCalled();
    });
  });

  describe('getCurrentUser', () => {
    it('returns the response envelope for an existing user', async () => {
      usersRepository.findOne.mockResolvedValue({
        id: 'u1',
        username: 'alice',
        email: 'a@example.test',
        role: UserRole.CUSTOMER,
        status: UserStatus.ACTIVE,
        emailVerifiedAt: null,
      } as User);

      const dto = await service.getCurrentUser('u1');

      expect(dto.user.username).toBe('alice');
    });

    it('throws NotFoundException when the user no longer exists', async () => {
      usersRepository.findOne.mockResolvedValue(null);

      await expect(service.getCurrentUser('missing')).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });

  describe('updateProfile', () => {
    it('throws BadRequestException when the body has no field to update', async () => {
      await expect(service.updateProfile('u1', {})).rejects.toBeInstanceOf(
        BadRequestException,
      );
      expect(usersRepository.update).not.toHaveBeenCalled();
    });

    it('updates the username and returns the refreshed profile', async () => {
      usersRepository.findOne.mockResolvedValue({
        id: 'u1',
        username: 'new_name',
        email: 'a@example.test',
        role: UserRole.CUSTOMER,
        status: UserStatus.ACTIVE,
        emailVerifiedAt: null,
      } as User);

      const dto = await service.updateProfile('u1', { username: 'new_name' });

      expect(usersRepository.update).toHaveBeenCalledWith('u1', {
        username: 'new_name',
      });
      expect(dto.user.username).toBe('new_name');
    });

    it('maps a duplicate username into ConflictException', async () => {
      usersRepository.update.mockRejectedValue(
        buildUniqueViolation('uq_users_username'),
      );

      await expect(
        service.updateProfile('u1', { username: 'taken' }),
      ).rejects.toBeInstanceOf(ConflictException);
    });
  });

  describe('changePassword', () => {
    it('throws NotFoundException when the user no longer exists', async () => {
      usersRepository.findOne.mockResolvedValue(null);

      await expect(
        service.changePassword('missing', {
          currentPassword: 'OldDemoPass123!',
          newPassword: 'NewDemoPass456!',
          confirmPassword: 'NewDemoPass456!',
        }),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('throws UnauthorizedException when currentPassword does not match', async () => {
      usersRepository.findOne.mockResolvedValue({
        id: 'u1',
        passwordHash: 'stored-hash',
      } as User);
      bcrypt.compare.mockResolvedValue(false);

      await expect(
        service.changePassword('u1', {
          currentPassword: 'WrongPass123!',
          newPassword: 'NewDemoPass456!',
          confirmPassword: 'NewDemoPass456!',
        }),
      ).rejects.toBeInstanceOf(UnauthorizedException);
    });

    it('hashes and saves the new password when currentPassword matches', async () => {
      usersRepository.findOne.mockResolvedValue({
        id: 'u1',
        passwordHash: 'stored-hash',
      } as User);
      bcrypt.compare.mockResolvedValue(true);
      const builder = mockUpdateQueryBuilder(usersRepository);

      await service.changePassword('u1', {
        currentPassword: 'OldDemoPass123!',
        newPassword: 'NewDemoPass456!',
        confirmPassword: 'NewDemoPass456!',
      });

      expect(bcrypt.hash).toHaveBeenCalledWith('NewDemoPass456!', 10);
      const setArg = builder.set.mock.calls[0][0];
      expect(setArg.passwordHash).toBe('hashed-new-password');
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
