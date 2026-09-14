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
import { MailProcessor } from './processors/mail.processor';
import { MailContentBuilderService } from './services/mail-content-builder.service';
import { MailerService } from './services/mailer.service';
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
        },
      }),
    }),
    BullModule.registerQueue({ name: MAIL_QUEUE_NAME }),
  ],
  providers: [
    {
      provide: MAIL_TRANSPORTER_PROVIDER,
      inject: [ConfigService],
      useFactory: (config: ConfigService) =>
        nodemailer.createTransport({
          host: config.getOrThrow<string>('MAIL_HOST'),
          port: config.getOrThrow<number>('MAIL_PORT'),
          secure: false,
        }),
    },
    NotificationsService,
    NotificationDispatcherService,
    MailerService,
    MailContentBuilderService,
    MailProcessor,
  ],
  exports: [TypeOrmModule, NotificationsService],
})
export class NotificationsModule {}
