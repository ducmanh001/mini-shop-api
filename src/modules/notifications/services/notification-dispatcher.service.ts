import { InjectQueue } from '@nestjs/bull';
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron } from '@nestjs/schedule';
import type { Job, Queue } from 'bull';
import {
  IN_FLIGHT_JOB_STATES,
  MAIL_QUEUE_NAME,
  MAX_EMAIL_NOTIFICATION_ATTEMPTS,
  MAIL_JOB_BACKOFF_DELAY_MS,
  NOTIFICATION_DISPATCH_BATCH_SIZE,
  SEND_MAIL_JOB_NAME,
} from '../constants/notifications.constants';
import { EmailNotification } from '../entities/email-notification.entity';
import { MailJobData } from '../interfaces/mail-job.interface';
import { NotificationsService } from './notifications.service';

@Injectable()
export class NotificationDispatcherService {
  private readonly logger = new Logger(NotificationDispatcherService.name);
  private isRunning = false;

  constructor(
    @InjectQueue(MAIL_QUEUE_NAME)
    private readonly mailQueue: Queue<MailJobData>,
    private readonly notificationsService: NotificationsService,
    private readonly config: ConfigService,
  ) {}

  // TODO(demo-bypass): "*/5 * * * * *" (mỗi 5s) thay CronExpression.EVERY_MINUTE để demo không phải
  // đợi tới 1 phút — PHẢI trả lại EVERY_MINUTE sau demo, tick dày thế này không hợp lý cho production.
  @Cron('*/5 * * * * *')
  async handleCron(): Promise<void> {
    // Tự tắt tick thật trong test env — e2e không liên quan queue vẫn boot AppModule nên vẫn có
    // cron thật chạy nền mỗi phút; test tự gọi dispatchPendingNotifications() để kiểm soát thời gian.
    if (this.config.get<string>('NODE_ENV') === 'test') {
      return;
    }
    await this.dispatchPendingNotifications();
  }

  async dispatchPendingNotifications(): Promise<void> {
    if (this.isRunning) {
      this.logger.warn('Previous dispatch tick is still running, skipping');
      return;
    }
    this.isRunning = true;
    try {
      const notifications = await this.notificationsService.findPendingBatch(
        NOTIFICATION_DISPATCH_BATCH_SIZE,
      );
      for (const notification of notifications) {
        await this.dispatchOne(notification);
      }
    } finally {
      this.isRunning = false;
    }
  }

  private async dispatchOne(notification: EmailNotification): Promise<void> {
    try {
      const existingJob = await this.mailQueue.getJob(notification.id);
      if (existingJob) {
        await this.handleExistingJob(notification, existingJob);
        return;
      }
      await this.enqueueOrFail(notification);
    } catch (error) {
      this.logger.error(
        `Failed to dispatch notification ${notification.id} (event ${notification.eventType})`,
        error instanceof Error ? error.stack : String(error),
      );
    }
  }

  private async handleExistingJob(
    notification: EmailNotification,
    job: Job<MailJobData>,
  ): Promise<void> {
    const state = await job.getState();
    if (IN_FLIGHT_JOB_STATES.has(state)) {
      return;
    }
    // Job đã terminal (completed/failed) nhưng outbox row vẫn PENDING: orphan do worker chết
    // giữa chừng. `removeOnComplete`/`removeOnFail` đều xóa job ngay khi terminal nên nhánh này
    // hiếm khi thấy job còn tồn tại — chỉ là phòng hờ khoảng hẹp trước khi Bull kịp xóa; `getJob()`
    // trả `null` (job đã bị Bull tự xóa) rơi thẳng vào `enqueueOrFail()` bên dưới, cùng kết quả.
    await job.remove();
    await this.enqueueOrFail(notification);
  }

  private async enqueueOrFail(notification: EmailNotification): Promise<void> {
    if (notification.attempts >= MAX_EMAIL_NOTIFICATION_ATTEMPTS) {
      await this.notificationsService.markFailed(
        notification.id,
        'Retry budget exhausted with no active job',
      );
      return;
    }
    await this.mailQueue.add(
      SEND_MAIL_JOB_NAME,
      { notificationId: notification.id },
      {
        jobId: notification.id,
        attempts: MAX_EMAIL_NOTIFICATION_ATTEMPTS,
        backoff: { type: 'exponential', delay: MAIL_JOB_BACKOFF_DELAY_MS },
        removeOnComplete: true,
        removeOnFail: true,
      },
    );
  }
}
