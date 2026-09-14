import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { createHash, randomBytes, randomUUID } from 'crypto';
import { I18nContext, I18nService } from 'nestjs-i18n';
import { DataSource, EntityManager } from 'typeorm';
import { encryptNotificationSecret } from '../../common/utils/notification-secret-cipher.util';
import { NOTIFICATION_SECRET_KEY_PROVIDER } from '../../notification-secret/notification-secret.constants';
import { EmailNotification } from '../notifications/entities/email-notification.entity';
import { EmailNotificationEventType } from '../notifications/enums/email-notification-event-type.enum';
import { RedisService } from '../../redis/redis.service';
import { SALT_ROUNDS } from '../users/constants/users.constants';
import { UserResponseDto } from '../users/dto/user-response.dto';
import { User } from '../users/entities/user.entity';
import { UserStatus } from '../users/enums/user-status.enum';
import { UsersService } from '../users/users.service';
import {
  AUTH_TOKEN_BYTES,
  DUMMY_PASSWORD_HASH,
  EMAIL_VERIFICATION_TOKEN_TTL_SECONDS,
  PASSWORD_RESET_TOKEN_TTL_SECONDS,
} from './constants/auth.constants';
import { AuthToken } from './entities/auth-token.entity';
import { AuthTokenType } from './enums/auth-token-type.enum';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { LoginDto } from './dto/login.dto';
import { MessageResponseDto } from './dto/message-response.dto';
import { RegisterDto } from './dto/register.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { VerifyEmailDto } from './dto/verify-email.dto';
import { CreateAuthTokenResult } from './interfaces/create-auth-token-result.interface';
import { AuthTokenMailPayload } from './interfaces/auth-token-mail-payload.interface';
import { JwtPayload } from './interfaces/jwt-payload.interface';
import type { AuthenticatedUser } from '../../common/auth/authenticated-user.interface';

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly dataSource: DataSource,
    private readonly usersService: UsersService,
    private readonly jwtService: JwtService,
    private readonly redisService: RedisService,
    private readonly config: ConfigService,
    private readonly i18n: I18nService,
    @Inject(NOTIFICATION_SECRET_KEY_PROVIDER)
    private readonly notificationSecretKey: Buffer,
  ) {}

  async register(dto: RegisterDto): Promise<UserResponseDto> {
    const passwordHash = await bcrypt.hash(dto.password, SALT_ROUNDS);
    const user = await this.dataSource.transaction(async (manager) => {
      const createdUser = await this.usersService.create(
        { email: dto.email, username: dto.username, passwordHash },
        manager,
      );
      const { authToken, rawToken } = await this.createAuthToken(
        createdUser.id,
        AuthTokenType.EMAIL_VERIFICATION,
        EMAIL_VERIFICATION_TOKEN_TTL_SECONDS,
        manager,
      );
      await this.createAuthTokenNotification(
        createdUser,
        rawToken,
        authToken.id,
        EmailNotificationEventType.EMAIL_VERIFICATION,
        manager,
      );
      return createdUser;
    });
    this.logger.log(`Registered user ${user.id}, pending email verification`);
    return this.usersService.toResponseDto(user);
  }

  async verifyEmail(dto: VerifyEmailDto): Promise<void> {
    await this.dataSource.transaction(async (manager) => {
      const authToken = await this.consumeAuthToken(
        dto.token,
        AuthTokenType.EMAIL_VERIFICATION,
        manager,
      );
      const activated = await this.usersService.markEmailVerified(
        authToken.userId,
        manager,
      );
      if (!activated) {
        this.logger.warn(
          `User ${authToken.userId} verified email but is no longer PENDING (deactivated?)`,
        );
        throw new ConflictException(this.i18n.t('errors.accountDeactivated'));
      }
      this.logger.log(`User ${authToken.userId} verified their email`);
    });
  }

  /**
   * Luôn trả về cùng 1 message dù email tồn tại hay không (chống account enumeration,
   * api-contract.md `ForgotPasswordRequest`) — chỉ user ACTIVE mới thực sự nhận token mới.
   */
  async forgotPassword(dto: ForgotPasswordDto): Promise<MessageResponseDto> {
    const user = await this.usersService.findByEmail(dto.email);
    if (user && user.status === UserStatus.ACTIVE) {
      await this.dataSource.transaction(async (manager) => {
        await this.revokeUnusedAuthTokens(
          user.id,
          AuthTokenType.PASSWORD_RESET,
          manager,
        );
        const { authToken, rawToken } = await this.createAuthToken(
          user.id,
          AuthTokenType.PASSWORD_RESET,
          PASSWORD_RESET_TOKEN_TTL_SECONDS,
          manager,
        );
        await this.createAuthTokenNotification(
          user,
          rawToken,
          authToken.id,
          EmailNotificationEventType.PASSWORD_RESET,
          manager,
        );
      });
      this.logger.log(`Password reset requested for user ${user.id}`);
    } else {
      this.logger.warn(
        'Password reset requested for an unknown or inactive email',
      );
    }
    return MessageResponseDto.create(
      this.i18n.t('common.passwordResetRequested'),
    );
  }

  async resetPassword(dto: ResetPasswordDto): Promise<void> {
    const passwordHash = await bcrypt.hash(dto.newPassword, SALT_ROUNDS);
    await this.dataSource.transaction(async (manager) => {
      const authToken = await this.consumeAuthToken(
        dto.token,
        AuthTokenType.PASSWORD_RESET,
        manager,
      );
      await this.usersService.updatePassword(
        authToken.userId,
        passwordHash,
        manager,
      );
      this.logger.log(
        `User ${authToken.userId} reset their password, all previous access tokens revoked`,
      );
    });
  }

  async login(dto: LoginDto): Promise<UserResponseDto> {
    const user = await this.usersService.findByEmail(dto.email);
    const passwordMatches = await bcrypt.compare(
      dto.password,
      user?.passwordHash ?? DUMMY_PASSWORD_HASH,
    );
    if (!user || !passwordMatches) {
      this.logger.warn(
        user
          ? `Login failed for user ${user.id}: wrong password`
          : 'Login failed: unknown email',
      );
      throw new UnauthorizedException(this.i18n.t('errors.invalidCredentials'));
    }
    if (user.status === UserStatus.PENDING) {
      this.logger.warn(`Login rejected for user ${user.id}: not verified`);
      throw new UnauthorizedException(this.i18n.t('errors.accountNotVerified'));
    }
    if (user.status === UserStatus.INACTIVE) {
      this.logger.warn(`Login rejected for user ${user.id}: deactivated`);
      throw new UnauthorizedException(this.i18n.t('errors.accountDeactivated'));
    }

    const token = this.issueAccessToken(user);
    this.logger.log(`User ${user.id} logged in`);
    return this.usersService.toResponseDto(user, token);
  }

  async logout(currentUser: AuthenticatedUser): Promise<void> {
    await this.redisService.blacklistToken(
      currentUser.tokenId,
      this.config.getOrThrow<number>('JWT_EXPIRES_IN'),
    );
    this.logger.log(`User ${currentUser.id} logged out, token revoked`);
  }

  private issueAccessToken(user: User): string {
    const payload: JwtPayload = {
      sub: user.id,
      jti: randomUUID(),
      tokenVersion: user.tokenVersion,
    };
    return this.jwtService.sign(payload);
  }

  private async createAuthToken(
    userId: string,
    type: AuthTokenType,
    ttlSeconds: number,
    manager: EntityManager,
  ): Promise<CreateAuthTokenResult> {
    const rawToken = randomBytes(AUTH_TOKEN_BYTES).toString('hex');
    const authTokenRepository = manager.getRepository(AuthToken);
    const authToken = authTokenRepository.create({
      userId,
      type,
      tokenHash: this.hashToken(rawToken),
      expiresAt: new Date(Date.now() + ttlSeconds * 1000),
    });
    await authTokenRepository.save(authToken);
    return { authToken, rawToken };
  }

  /**
   * Tìm token theo hash+type rồi atomic UPDATE đánh dấu đã dùng, chỉ khi còn hạn và chưa dùng
   * (mục 22 CODING_STANDARD.md) — dùng chung cho `verifyEmail`/`resetPassword`, khác nhau đúng 1
   * chỗ: `AuthTokenType` và hành động tiếp theo trên user.
   */
  private async consumeAuthToken(
    rawToken: string,
    type: AuthTokenType,
    manager: EntityManager,
  ): Promise<AuthToken> {
    const tokenHash = this.hashToken(rawToken);
    const authTokenRepository = manager.getRepository(AuthToken);
    const authToken = await authTokenRepository.findOne({
      select: { id: true, userId: true },
      where: { tokenHash, type },
    });
    if (!authToken) {
      this.logger.warn(`${type} attempted with an unknown token`);
      throw new BadRequestException(
        this.i18n.t('errors.invalidOrExpiredToken'),
      );
    }

    const consumeResult = await authTokenRepository
      .createQueryBuilder()
      .update(AuthToken)
      .set({ usedAt: () => 'now()' })
      .where('id = :id', { id: authToken.id })
      .andWhere('used_at IS NULL')
      .andWhere('expires_at > now()')
      .execute();
    if ((consumeResult.affected ?? 0) === 0) {
      this.logger.warn(`${type} token ${authToken.id} already used or expired`);
      throw new BadRequestException(
        this.i18n.t('errors.invalidOrExpiredToken'),
      );
    }
    return authToken;
  }

  /** Revoke mọi token cùng loại chưa dùng của user — dùng khi forgot-password phát token mới. */
  private async revokeUnusedAuthTokens(
    userId: string,
    type: AuthTokenType,
    manager: EntityManager,
  ): Promise<void> {
    await manager
      .getRepository(AuthToken)
      .createQueryBuilder()
      .update(AuthToken)
      .set({ usedAt: () => 'now()' })
      .where('user_id = :userId', { userId })
      .andWhere('type = :type', { type })
      .andWhere('used_at IS NULL')
      .execute();
  }

  private async createAuthTokenNotification(
    user: User,
    rawToken: string,
    authTokenId: string,
    eventType: EmailNotificationEventType,
    manager: EntityManager,
  ): Promise<void> {
    const payload: AuthTokenMailPayload = {
      username: user.username,
      templateVersion: 1,
    };
    const notificationRepository = manager.getRepository(EmailNotification);
    const notification = notificationRepository.create({
      authTokenId,
      eventType,
      recipientEmail: user.email,
      locale: this.resolveLocale(),
      payload: payload as unknown as Record<string, unknown>,
      secretCiphertext: encryptNotificationSecret(
        rawToken,
        this.notificationSecretKey,
      ),
    });
    await notificationRepository.save(notification);
  }

  private hashToken(rawToken: string): string {
    return createHash('sha256').update(rawToken).digest('hex');
  }

  private resolveLocale(): 'vi' | 'en' {
    return I18nContext.current()?.lang === 'vi' ? 'vi' : 'en';
  }
}
