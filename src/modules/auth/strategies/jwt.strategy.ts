import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { I18nService } from 'nestjs-i18n';
import { ExtractJwt, Strategy } from 'passport-jwt';
import type { AuthenticatedUser } from '../../../common/auth/authenticated-user.interface';
import { RedisService } from '../../../redis/redis.service';
import { UserStatus } from '../../users/enums/user-status.enum';
import { UsersService } from '../../users/users.service';
import { JwtPayload } from '../interfaces/jwt-payload.interface';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    private readonly config: ConfigService,
    private readonly usersService: UsersService,
    private readonly redisService: RedisService,
    private readonly i18n: I18nService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: config.getOrThrow<string>('JWT_SECRET'),
    });
  }

  /** Role/status luôn đọc lại từ DB — JWT chỉ mang `sub`/`jti`/`tokenVersion` (database.md mục 4). */
  async validate(payload: JwtPayload): Promise<AuthenticatedUser> {
    if (await this.redisService.isTokenBlacklisted(payload.jti)) {
      throw new UnauthorizedException(this.i18n.t('errors.tokenRevoked'));
    }

    const user = await this.usersService.findById(payload.sub);
    if (!user || user.status !== UserStatus.ACTIVE) {
      throw new UnauthorizedException(this.i18n.t('errors.tokenRevoked'));
    }

    if (user.tokenVersion !== payload.tokenVersion) {
      throw new UnauthorizedException(this.i18n.t('errors.tokenRevoked'));
    }

    return {
      id: user.id,
      role: user.role,
      status: UserStatus.ACTIVE,
      tokenId: payload.jti,
      tokenVersion: user.tokenVersion,
    };
  }
}
