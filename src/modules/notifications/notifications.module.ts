import { BullModule } from '@nestjs/bullmq';
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
    // @nestjs/bullmq (không phải @nestjs/bull) — đổi từ Bull cổ điển sang vì bug thật gặp lúc
    // deploy PR19: job fail rơi vào state "delayed" (chờ backoff) không được Bull cổ điển tự đẩy
    // lại "wait" một cách đáng tin cậy trên Redis của Railway, kẹt hàng chục phút thay vì vài giây.
    // Lệch khỏi "chọn @nestjs/bull theo yêu cầu mentor" ở docs/planning/api-contract.md — cần trao
    // đổi lại với mentor, xem lý do kỹ thuật đầy đủ ở PR notes/commit message.
    BullModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        connection: {
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
      // port 587/2525 đều bị drop dù credential đúng. Có MAIL_API_TOKEN thì dùng Mailtrap Email
      // Testing (Sandbox) API (HTTP, cổng 443) thay vì SMTP; không có thì giữ nguyên SMTP cho
      // local/CI (Mailpit).
      useFactory: (config: ConfigService): MailTransport => {
        // .trim() phòng khoảng trắng/newline dính khi copy token/inbox id qua nhiều bước UI.
        const apiToken = config.get<string>('MAIL_API_TOKEN')?.trim();
        if (apiToken) {
          const inboxId = config.getOrThrow<string>('MAILTRAP_INBOX_ID').trim();
          return new MailtrapApiMailTransport(apiToken, inboxId);
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
