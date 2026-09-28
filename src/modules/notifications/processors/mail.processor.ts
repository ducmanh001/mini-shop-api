import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import type { Job } from 'bullmq';
import {
  MAIL_QUEUE_NAME,
  MAX_EMAIL_NOTIFICATION_ATTEMPTS,
} from '../constants/notifications.constants';
import { EmailNotificationStatus } from '../enums/email-notification-status.enum';
import { MailJobData } from '../interfaces/mail-job.interface';
import { MailContentBuilderService } from '../services/mail-content-builder.service';
import { MailerService } from '../services/mailer.service';
import { NotificationsService } from '../services/notifications.service';

/**
 * Mỗi job BullMQ chỉ thử đúng 1 lần (không đặt attempts/backoff — xem
 * `NotificationDispatcherService.enqueueOrFail()`); retry thật nằm ở tick 5s của dispatcher, dựa
 * trên DB `attempts` (không phải bộ đếm nội bộ của queue) — nguồn sự thật duy nhất quyết định còn
 * ngân sách gửi hay đã hết, vì job có thể mất khi Redis restart.
 */
@Processor(MAIL_QUEUE_NAME)
export class MailProcessor extends WorkerHost {
  private readonly logger = new Logger(MailProcessor.name);

  constructor(
    private readonly notificationsService: NotificationsService,
    private readonly mailContentBuilder: MailContentBuilderService,
    private readonly mailerService: MailerService,
  ) {
    super();
  }

  async process(job: Job<MailJobData>): Promise<void> {
    const { notificationId } = job.data;
    const notification =
      await this.notificationsService.findByIdForSending(notificationId);
    if (
      !notification ||
      notification.status !== EmailNotificationStatus.PENDING
    ) {
      return;
    }

    const reserved =
      await this.notificationsService.reserveAttempt(notificationId);
    if (!reserved) {
      await this.failIfExhausted(notificationId);
      return;
    }

    try {
      const content = this.mailContentBuilder.build(notification);
      await this.mailerService.sendMail(notification.recipientEmail, content);
    } catch (error) {
      await this.handleSendFailure(notificationId, error);
      return;
    }

    // Mail đã gửi thành công tại đây — không được để lỗi từ bước này rơi vào
    // handleSendFailure()/rethrow, vì queue sẽ retry và gọi lại sendMail(), gửi trùng mail.
    try {
      await this.notificationsService.markSent(notificationId);
      this.logger.log(
        `Sent ${notification.eventType} email for notification ${notificationId}`,
      );
    } catch (error) {
      this.logger.error(
        `Mail sent for notification ${notificationId} but markSent() failed — DB state is stale, will NOT resend`,
        error instanceof Error ? error.stack : String(error),
      );
    }
  }

  private async failIfExhausted(notificationId: string): Promise<void> {
    const fresh = await this.notificationsService.findById(notificationId);
    if (
      fresh &&
      fresh.status === EmailNotificationStatus.PENDING &&
      fresh.attempts >= MAX_EMAIL_NOTIFICATION_ATTEMPTS
    ) {
      await this.notificationsService.markFailed(
        notificationId,
        'Retry budget exhausted before send attempt',
      );
    }
  }

  private async handleSendFailure(
    notificationId: string,
    error: unknown,
  ): Promise<void> {
    const message =
      error instanceof Error ? error.message : 'Unknown mail send error';
    const fresh = await this.notificationsService.findById(notificationId);
    const exhausted =
      !fresh || fresh.attempts >= MAX_EMAIL_NOTIFICATION_ATTEMPTS;

    if (exhausted) {
      this.logger.error(
        `Mail send failed permanently for notification ${notificationId}: ${message}`,
      );
      await this.notificationsService.markFailed(notificationId, message);
      return;
    }

    this.logger.warn(
      `Mail send failed for notification ${notificationId}, will retry: ${message}`,
    );
    throw error instanceof Error ? error : new Error(message);
  }
}
