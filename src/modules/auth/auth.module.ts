import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { TypeOrmModule } from '@nestjs/typeorm';
import { UsersModule } from '../users/users.module';
import { EmailNotification } from '../notifications/entities/email-notification.entity';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { AuthToken } from './entities/auth-token.entity';
import { JwtStrategy } from './strategies/jwt.strategy';

@Module({
  imports: [
    TypeOrmModule.forFeature([AuthToken, EmailNotification]),
    UsersModule,
    PassportModule.register({ defaultStrategy: 'jwt' }),
    JwtModule.registerAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.getOrThrow<string>('JWT_SECRET'),
        signOptions: {
          expiresIn: config.getOrThrow<number>('JWT_EXPIRES_IN'),
        },
      }),
    }),
  ],
  controllers: [AuthController],
  providers: [AuthService, JwtStrategy],
  // `JwtModule`/`JwtStrategy` export riêng cho `chat` (PR15): WebSocket handshake cần verify JWT
  // thô ngoài luồng HTTP/Passport (`ExtractJwt.fromAuthHeaderAsBearerToken()` chỉ đọc Express
  // Request), nên gateway gọi thẳng `JwtService.verifyAsync()` rồi `JwtStrategy.validate()` để tái
  // dùng đúng bộ check blacklist/active/tokenVersion, không viết lại ở module khác
  // (CODING_STANDARD.md mục 10).
  exports: [TypeOrmModule, JwtModule, JwtStrategy],
})
export class AuthModule {}
