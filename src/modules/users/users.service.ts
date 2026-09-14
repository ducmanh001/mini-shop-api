import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import * as bcrypt from 'bcrypt';
import { I18nService } from 'nestjs-i18n';
import { EntityManager, Repository } from 'typeorm';
import { UserRole } from '../../common/enums/user-role.enum';
import {
  getViolatedConstraint,
  isUniqueViolation,
} from '../../common/utils/postgres-unique-violation.util';
import { SALT_ROUNDS } from './constants/users.constants';
import { ChangePasswordDto } from './dto/change-password.dto';
import { UserResponseDto } from './dto/user-response.dto';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { User } from './entities/user.entity';
import { UserStatus } from './enums/user-status.enum';
import { CreateUserData } from './interfaces/create-user-data.interface';

@Injectable()
export class UsersService {
  private readonly logger = new Logger(UsersService.name);

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

  /** Đủ cột cho `UserResponse` (GET/PATCH me) — khác `findById` (chỉ phục vụ `JwtStrategy`). */
  async findProfileById(
    id: string,
    manager?: EntityManager,
  ): Promise<User | null> {
    const repository = manager
      ? manager.getRepository(User)
      : this.usersRepository;
    return repository.findOne({
      select: {
        id: true,
        username: true,
        email: true,
        role: true,
        status: true,
        emailVerifiedAt: true,
      },
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

  /**
   * Hash mới + tăng `token_version` trong cùng 1 câu UPDATE (tăng bằng biểu thức SQL, không đọc
   * rồi cộng ở app) — revoke mọi access token cũ đang tồn tại (`JwtStrategy` so `tokenVersion`
   * mỗi request). Dùng chung cho `AuthService.resetPassword` (truyền `manager` của transaction
   * đang mở) và `changePassword` (không cần transaction, chỉ 1 bảng).
   */
  async updatePassword(
    userId: string,
    passwordHash: string,
    manager?: EntityManager,
  ): Promise<void> {
    const repository = manager
      ? manager.getRepository(User)
      : this.usersRepository;
    await repository
      .createQueryBuilder()
      .update(User)
      .set({ passwordHash, tokenVersion: () => 'token_version + 1' })
      .where('id = :id', { id: userId })
      .execute();
  }

  async getCurrentUser(userId: string): Promise<UserResponseDto> {
    const user = await this.findProfileById(userId);
    if (!user) {
      throw new NotFoundException(this.i18n.t('errors.userNotFound'));
    }
    return this.toResponseDto(user);
  }

  /** `UpdateProfileRequest` chỉ có `username` (đổi email cần verify riêng, ngoài phạm vi PR07). */
  async updateProfile(
    userId: string,
    dto: UpdateProfileDto,
  ): Promise<UserResponseDto> {
    if (dto.username === undefined) {
      throw new BadRequestException(
        this.i18n.t('errors.atLeastOneFieldRequired'),
      );
    }
    try {
      await this.usersRepository.update(userId, { username: dto.username });
    } catch (error) {
      throw this.toConflictOrRethrow(error);
    }
    const user = await this.findProfileById(userId);
    if (!user) {
      throw new NotFoundException(this.i18n.t('errors.userNotFound'));
    }
    return this.toResponseDto(user);
  }

  async changePassword(userId: string, dto: ChangePasswordDto): Promise<void> {
    const user = await this.usersRepository.findOne({
      select: { id: true, passwordHash: true },
      where: { id: userId },
    });
    if (!user) {
      throw new NotFoundException(this.i18n.t('errors.userNotFound'));
    }
    const currentPasswordMatches = await bcrypt.compare(
      dto.currentPassword,
      user.passwordHash,
    );
    if (!currentPasswordMatches) {
      this.logger.warn(
        `Change password rejected for user ${userId}: wrong current password`,
      );
      throw new UnauthorizedException(
        this.i18n.t('errors.currentPasswordIncorrect'),
      );
    }
    const passwordHash = await bcrypt.hash(dto.newPassword, SALT_ROUNDS);
    await this.updatePassword(userId, passwordHash);
    this.logger.log(
      `User ${userId} changed their password, all previous access tokens revoked`,
    );
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
