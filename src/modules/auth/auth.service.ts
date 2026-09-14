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
  DUMMY_PASSWORD_HASH,
  EMAIL_VERIFICATION_TOKEN_BYTES,
  EMAIL_VERIFICATION_TOKEN_TTL_SECONDS,
} from './constants/auth.constants';
import { AuthToken } from './entities/auth-token.entity';
import { AuthTokenType } from './enums/auth-token-type.enum';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
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
      await this.createEmailVerificationNotification(
        createdUser,
        rawToken,
        authToken.id,
        manager,
      );
      return createdUser;
    });
    this.logger.log(`Registered user ${user.id}, pending email verification`);
    return this.usersService.toResponseDto(user);
  }

  async verifyEmail(dto: VerifyEmailDto): Promise<void> {
    const tokenHash = this.hashToken(dto.token);
    await this.dataSource.transaction(async (manager) => {
      const authTokenRepository = manager.getRepository(AuthToken);
      const authToken = await authTokenRepository.findOne({
        select: { id: true, userId: true },
        where: { tokenHash, type: AuthTokenType.EMAIL_VERIFICATION },
      });
      if (!authToken) {
        this.logger.warn('Email verification attempted with an unknown token');
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
        this.logger.warn(
          `Email verification token ${authToken.id} already used or expired`,
        );
        throw new BadRequestException(
          this.i18n.t('errors.invalidOrExpiredToken'),
        );
      }

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
    const rawToken = randomBytes(EMAIL_VERIFICATION_TOKEN_BYTES).toString(
      'hex',
    );
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

  private async createEmailVerificationNotification(
    user: User,
    rawToken: string,
    authTokenId: string,
    manager: EntityManager,
  ): Promise<void> {
    const payload: AuthTokenMailPayload = {
      username: user.username,
      templateVersion: 1,
    };
    const notificationRepository = manager.getRepository(EmailNotification);
    const notification = notificationRepository.create({
      authTokenId,
      eventType: EmailNotificationEventType.EMAIL_VERIFICATION,
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
