import { ConflictException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { I18nService } from 'nestjs-i18n';
import { EntityManager, Repository } from 'typeorm';
import { UserRole } from '../../common/enums/user-role.enum';
import {
  getViolatedConstraint,
  isUniqueViolation,
} from '../../common/utils/postgres-unique-violation.util';
import { UserResponseDto } from './dto/user-response.dto';
import { User } from './entities/user.entity';
import { UserStatus } from './enums/user-status.enum';
import { CreateUserData } from './interfaces/create-user-data.interface';

@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(User)
    private readonly usersRepository: Repository<User>,
    private readonly i18n: I18nService,
  ) {}

  /** Luôn tạo CUSTOMER/PENDING — đăng ký không nhận role/status từ client (database.md mục 4). */
  async create(data: CreateUserData, manager?: EntityManager): Promise<User> {
    const repository = manager
      ? manager.getRepository(User)
      : this.usersRepository;
    const user = repository.create({
      ...data,
      role: UserRole.CUSTOMER,
      status: UserStatus.PENDING,
    });
    try {
      await repository.save(user);
    } catch (error) {
      throw this.toConflictOrRethrow(error);
    }
    return user;
  }

  async findByEmail(
    email: string,
    manager?: EntityManager,
  ): Promise<User | null> {
    const repository = manager
      ? manager.getRepository(User)
      : this.usersRepository;
    return repository.findOne({
      select: {
        id: true,
        email: true,
        username: true,
        passwordHash: true,
        role: true,
        status: true,
        emailVerifiedAt: true,
        tokenVersion: true,
      },
      where: { email },
    });
  }

  async findById(id: string, manager?: EntityManager): Promise<User | null> {
    const repository = manager
      ? manager.getRepository(User)
      : this.usersRepository;
    return repository.findOne({
      select: { id: true, role: true, status: true, tokenVersion: true },
      where: { id },
    });
  }

  /** Atomic UPDATE có điều kiện — chỉ chuyển PENDING → ACTIVE, không đụng account đã ACTIVE/INACTIVE. */
  async markEmailVerified(
    id: string,
    manager: EntityManager,
  ): Promise<boolean> {
    const result = await manager
      .createQueryBuilder()
      .update(User)
      .set({ status: UserStatus.ACTIVE, emailVerifiedAt: () => 'now()' })
      .where('id = :id', { id })
      .andWhere('status = :status', { status: UserStatus.PENDING })
      .execute();
    return (result.affected ?? 0) > 0;
  }

  toResponseDto(user: User, token?: string): UserResponseDto {
    return UserResponseDto.fromEntity(user, token);
  }

  private toConflictOrRethrow(error: unknown): unknown {
    if (!isUniqueViolation(error)) {
      return error;
    }
    const constraint = getViolatedConstraint(error);
    if (constraint === 'uq_users_email') {
      return new ConflictException(
        this.i18n.t('errors.emailAlreadyRegistered'),
      );
    }
    if (constraint === 'uq_users_username') {
      return new ConflictException(this.i18n.t('errors.usernameAlreadyTaken'));
    }
    return new ConflictException(
      this.i18n.t('errors.usernameOrEmailAlreadyRegistered'),
    );
  }
}
