import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  LAST_ERROR_MAX_LENGTH,
  MAX_EMAIL_NOTIFICATION_ATTEMPTS,
} from '../constants/notifications.constants';
import { EmailNotification } from '../entities/email-notification.entity';
import { EmailNotificationStatus } from '../enums/email-notification-status.enum';

@Injectable()
export class NotificationsService {
  constructor(
    @InjectRepository(EmailNotification)
    private readonly notificationsRepository: Repository<EmailNotification>,
  ) {}

  /** Dispatcher chỉ cần 3 field này — không nạp `payload`/`secretCiphertext` cho query chạy mỗi phút. */
  async findPendingBatch(limit: number): Promise<EmailNotification[]> {
    return this.notificationsRepository.find({
      select: { id: true, attempts: true, eventType: true },
      where: { status: EmailNotificationStatus.PENDING },
      order: { updatedAt: 'ASC', id: 'ASC' },
      take: limit,
    });
  }

  async findById(id: string): Promise<EmailNotification | null> {
    return this.notificationsRepository.findOne({ where: { id } });
  }

  /** Nạp kèm `order` relation, khác `findById` — cần snapshot order để dựng nội dung mail. */
  async findByIdForSending(id: string): Promise<EmailNotification | null> {
    return this.notificationsRepository.findOne({
      select: {
        id: true,
        status: true,
        eventType: true,
        recipientEmail: true,
        locale: true,
        payload: true,
        secretCiphertext: true,
        reportPeriod: true,
        order: {
          id: true,
          recipientName: true,
          totalVnd: true,
          rejectionReason: true,
        },
      },
      where: { id },
      relations: { order: true },
    });
  }

  /** Atomic UPDATE thay vì read-then-write — nguồn sự thật duy nhất cho ngân sách retry còn lại. */
  async reserveAttempt(id: string): Promise<boolean> {
    const result = await this.notificationsRepository
      .createQueryBuilder()
      .update(EmailNotification)
      .set({ attempts: () => 'attempts + 1' })
      .where('id = :id', { id })
      .andWhere('status = :status', { status: EmailNotificationStatus.PENDING })
      .andWhere('attempts < :max', { max: MAX_EMAIL_NOTIFICATION_ATTEMPTS })
      .execute();
    return (result.affected ?? 0) > 0;
  }

  async markSent(id: string): Promise<void> {
    await this.notificationsRepository.update(
      { id, status: EmailNotificationStatus.PENDING },
      {
        status: EmailNotificationStatus.SENT,
        sentAt: new Date(),
        secretCiphertext: null,
      },
    );
  }

  async markFailed(id: string, error: string): Promise<void> {
    await this.notificationsRepository.update(
      { id, status: EmailNotificationStatus.PENDING },
      {
        status: EmailNotificationStatus.FAILED,
        lastError: error.slice(0, LAST_ERROR_MAX_LENGTH),
      },
    );
  }
}
