import { BullModule } from '@nestjs/bull';
import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import * as nodemailer from 'nodemailer';
import { AuthModule } from '../auth/auth.module';
import { OrdersModule } from '../orders/orders.module';
import {
  MAIL_QUEUE_NAME,
  MAIL_TRANSPORTER_PROVIDER,
} from './constants/notifications.constants';
import { EmailNotification } from './entities/email-notification.entity';
import { MailTransport } from './interfaces/mail-transport.interface';
import { MailProcessor } from './processors/mail.processor';
import { MailContentBuilderService } from './services/mail-content-builder.service';
import { MailerService } from './services/mailer.service';
import { MailtrapApiMailTransport } from './services/mailtrap-api-mail-transport';
import { MonthlyReportService } from './services/monthly-report.service';
import { NotificationDispatcherService } from './services/notification-dispatcher.service';
import { NotificationsService } from './services/notifications.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([EmailNotification]),
    AuthModule,
    OrdersModule,
    // @nestjs/bull (Bull), không phải @nestjs/bullmq — chọn theo yêu cầu mentor, xem
    // docs/planning/api-contract.md mục "Nguồn kỹ thuật chính thức".
    BullModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        redis: {
          host: config.getOrThrow<string>('REDIS_HOST'),
          port: config.getOrThrow<number>('REDIS_PORT'),
          password: config.get<string>('REDIS_PASSWORD'),
        },
      }),
    }),
    BullModule.registerQueue({ name: MAIL_QUEUE_NAME }),
  ],
  providers: [
    {
      provide: MAIL_TRANSPORTER_PROVIDER,
      inject: [ConfigService],
      // Nhiều PaaS (Railway...) chặn outbound SMTP hoàn toàn — xác nhận thật lúc deploy PR19, mọi
      // port 587/2525 đều bị drop dù credential đúng. Có MAIL_API_TOKEN thì dùng Mailtrap Sending
      // API (HTTP, cổng 443) thay vì SMTP; không có thì giữ nguyên SMTP cho local/CI (Mailpit).
      useFactory: (config: ConfigService): MailTransport => {
        // .trim() phòng khoảng trắng/newline dính khi copy token qua nhiều bước UI.
        const apiToken = config.get<string>('MAIL_API_TOKEN')?.trim();
        if (apiToken) {
          return new MailtrapApiMailTransport(apiToken);
        }
        const user = config.get<string>('MAIL_USER');
        const password = config.get<string>('MAIL_PASSWORD');
        return nodemailer.createTransport({
          host: config.getOrThrow<string>('MAIL_HOST'),
          port: config.getOrThrow<number>('MAIL_PORT'),
          secure: config.getOrThrow<boolean>('MAIL_SECURE'),
          // Mailpit (local/CI) không cần auth — chỉ set khi SMTP thật có MAIL_USER/MAIL_PASSWORD
          // (validation ở env.validation.ts đã bắt buộc cả hai cùng có hoặc cùng không).
          ...(user && password ? { auth: { user, pass: password } } : {}),
        });
      },
    },
    NotificationsService,
    NotificationDispatcherService,
    MonthlyReportService,
    MailerService,
    MailContentBuilderService,
    MailProcessor,
  ],
  exports: [TypeOrmModule, NotificationsService],
})
export class NotificationsModule {}
