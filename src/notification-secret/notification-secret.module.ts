import { Global, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NOTIFICATION_SECRET_KEY_PROVIDER } from './notification-secret.constants';

/**
 * Tách riêng khỏi `NotificationsModule` (mục đích ban đầu ở PR05) vì PR06 cần encrypt raw
 * activation token ngay trong transaction `AuthService.register()` — `auth` và `notifications`
 * đã phụ thuộc lẫn nhau một chiều (`notifications → auth`), nên không thể import ngược lại
 * (CODING_STANDARD.md mục 10: "2 module cần dữ liệu của nhau → tách module thứ 3"). `@Global()`
 * giống `redis/` để mọi module dùng `@Inject(NOTIFICATION_SECRET_KEY_PROVIDER)` không cần import.
 */
@Global()
@Module({
  providers: [
    {
      provide: NOTIFICATION_SECRET_KEY_PROVIDER,
      inject: [ConfigService],
      useFactory: (config: ConfigService): Buffer =>
        Buffer.from(
          config.getOrThrow<string>('NOTIFICATION_SECRET_KEY'),
          'base64',
        ),
    },
  ],
  exports: [NOTIFICATION_SECRET_KEY_PROVIDER],
})
export class NotificationSecretModule {}
