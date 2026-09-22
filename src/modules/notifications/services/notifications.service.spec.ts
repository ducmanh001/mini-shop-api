import { Repository } from 'typeorm';
import { EmailNotification } from '../entities/email-notification.entity';
import { EmailNotificationStatus } from '../enums/email-notification-status.enum';
import { NotificationsService } from './notifications.service';

describe('NotificationsService', () => {
  let service: NotificationsService;
  let queryBuilder: {
    update: jest.Mock;
    set: jest.Mock;
    where: jest.Mock;
    andWhere: jest.Mock;
    execute: jest.Mock;
  };
  let notificationsRepository: {
    find: jest.Mock;
    findOne: jest.Mock;
    update: jest.Mock;
    createQueryBuilder: jest.Mock;
  };

  beforeEach(() => {
    queryBuilder = {
      update: jest.fn().mockReturnThis(),
      set: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      execute: jest.fn(),
    };
    notificationsRepository = {
      find: jest.fn(),
      findOne: jest.fn(),
      update: jest.fn(),
      createQueryBuilder: jest.fn().mockReturnValue(queryBuilder),
    };
    service = new NotificationsService(
      notificationsRepository as unknown as Repository<EmailNotification>,
    );
  });

  it('finds a PENDING batch ordered by updatedAt/id ascending', async () => {
    notificationsRepository.find.mockResolvedValue([]);

    await service.findPendingBatch(50);

    expect(notificationsRepository.find).toHaveBeenCalledWith({
      select: { id: true, attempts: true, eventType: true },
      where: { status: EmailNotificationStatus.PENDING },
      order: { updatedAt: 'ASC', id: 'ASC' },
      take: 50,
    });
  });

  it('loads the order relation when fetching for sending', async () => {
    notificationsRepository.findOne.mockResolvedValue(null);

    await service.findByIdForSending('notif-1');

    expect(notificationsRepository.findOne).toHaveBeenCalledWith({
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
      where: { id: 'notif-1' },
      relations: { order: true },
    });
  });

  describe('reserveAttempt', () => {
    it('returns true when the atomic UPDATE affects a row', async () => {
      queryBuilder.execute.mockResolvedValue({ affected: 1 });

      await expect(service.reserveAttempt('notif-1')).resolves.toBe(true);
      const [setArg] = queryBuilder.set.mock.calls[0] as [
        { attempts: unknown },
      ];
      expect(typeof setArg.attempts).toBe('function');
      expect(queryBuilder.andWhere).toHaveBeenCalledWith('attempts < :max', {
        max: 3,
      });
    });

    it('returns false when no row matches (exhausted or not PENDING)', async () => {
      queryBuilder.execute.mockResolvedValue({ affected: 0 });

      await expect(service.reserveAttempt('notif-1')).resolves.toBe(false);
    });
  });

  it('marks a notification sent and wipes the secret ciphertext', async () => {
    await service.markSent('notif-1');

    const [, data] = notificationsRepository.update.mock.calls[0] as [
      unknown,
      {
        status: EmailNotificationStatus;
        sentAt: unknown;
        secretCiphertext: unknown;
      },
    ];
    expect(data.status).toBe(EmailNotificationStatus.SENT);
    expect(data.sentAt).toBeInstanceOf(Date);
    expect(data.secretCiphertext).toBeNull();
  });

  it('marks a notification failed and truncates a long error message', async () => {
    const longError = 'x'.repeat(1500);

    await service.markFailed('notif-1', longError);

    expect(notificationsRepository.update).toHaveBeenCalledWith(
      { id: 'notif-1', status: EmailNotificationStatus.PENDING },
      {
        status: EmailNotificationStatus.FAILED,
        lastError: 'x'.repeat(1000),
      },
    );
  });
});
