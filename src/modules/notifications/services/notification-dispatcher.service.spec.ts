import { ConfigService } from '@nestjs/config';
import { Queue } from 'bullmq';
import { MAX_EMAIL_NOTIFICATION_ATTEMPTS } from '../constants/notifications.constants';
import { EmailNotification } from '../entities/email-notification.entity';
import { EmailNotificationEventType } from '../enums/email-notification-event-type.enum';
import { MailJobData } from '../interfaces/mail-job.interface';
import { NotificationDispatcherService } from './notification-dispatcher.service';
import { NotificationsService } from './notifications.service';

function buildNotification(
  overrides: Partial<EmailNotification>,
): EmailNotification {
  return {
    id: 'notif-1',
    eventType: EmailNotificationEventType.ORDER_PLACED,
    attempts: 0,
    ...overrides,
  } as EmailNotification;
}

describe('NotificationDispatcherService', () => {
  let mailQueue: { getJob: jest.Mock; add: jest.Mock };
  let notificationsService: {
    findPendingBatch: jest.Mock;
    markFailed: jest.Mock;
  };
  let config: { get: jest.Mock };
  let service: NotificationDispatcherService;

  beforeEach(() => {
    mailQueue = {
      getJob: jest.fn(),
      add: jest.fn().mockResolvedValue(undefined),
    };
    notificationsService = {
      findPendingBatch: jest.fn().mockResolvedValue([]),
      markFailed: jest.fn().mockResolvedValue(undefined),
    };
    config = { get: jest.fn().mockReturnValue('development') };
    service = new NotificationDispatcherService(
      mailQueue as unknown as Queue<MailJobData>,
      notificationsService as unknown as NotificationsService,
      config as unknown as ConfigService,
    );
  });

  it('enqueues a job with a deterministic jobId when none exists yet', async () => {
    const notification = buildNotification({ id: 'notif-1' });
    notificationsService.findPendingBatch.mockResolvedValue([notification]);
    mailQueue.getJob.mockResolvedValue(undefined);

    await service.dispatchPendingNotifications();

    expect(mailQueue.add).toHaveBeenCalledWith(
      'send-mail',
      { notificationId: 'notif-1' },
      {
        jobId: 'notif-1',
        removeOnComplete: true,
        removeOnFail: true,
      },
    );
  });

  it('skips a notification whose job is still in flight', async () => {
    const notification = buildNotification({ id: 'notif-1' });
    notificationsService.findPendingBatch.mockResolvedValue([notification]);
    mailQueue.getJob.mockResolvedValue({
      getState: jest.fn().mockResolvedValue('active'),
      remove: jest.fn(),
    });

    await service.dispatchPendingNotifications();

    expect(mailQueue.add).not.toHaveBeenCalled();
  });

  it('marks FAILED an orphaned notification that exhausted its retry budget', async () => {
    const notification = buildNotification({
      id: 'notif-1',
      attempts: MAX_EMAIL_NOTIFICATION_ATTEMPTS,
    });
    notificationsService.findPendingBatch.mockResolvedValue([notification]);
    const remove = jest.fn().mockResolvedValue(undefined);
    mailQueue.getJob.mockResolvedValue({
      getState: jest.fn().mockResolvedValue('failed'),
      remove,
    });

    await service.dispatchPendingNotifications();

    expect(remove).toHaveBeenCalled();
    expect(notificationsService.markFailed).toHaveBeenCalledWith(
      'notif-1',
      'Retry budget exhausted with no active job',
    );
    expect(mailQueue.add).not.toHaveBeenCalled();
  });

  it('re-enqueues an orphaned notification that still has retry budget', async () => {
    const notification = buildNotification({ id: 'notif-1', attempts: 1 });
    notificationsService.findPendingBatch.mockResolvedValue([notification]);
    const remove = jest.fn().mockResolvedValue(undefined);
    mailQueue.getJob.mockResolvedValue({
      getState: jest.fn().mockResolvedValue('completed'),
      remove,
    });

    await service.dispatchPendingNotifications();

    expect(remove).toHaveBeenCalled();
    expect(mailQueue.add).toHaveBeenCalledWith(
      'send-mail',
      { notificationId: 'notif-1' },
      expect.objectContaining({ jobId: 'notif-1' }),
    );
  });

  it('keeps the notification PENDING and logs when Redis is unavailable', async () => {
    const notification = buildNotification({ id: 'notif-1' });
    notificationsService.findPendingBatch.mockResolvedValue([notification]);
    mailQueue.getJob.mockRejectedValue(new Error('ECONNREFUSED'));

    await expect(
      service.dispatchPendingNotifications(),
    ).resolves.toBeUndefined();

    expect(notificationsService.markFailed).not.toHaveBeenCalled();
  });

  it('does not run two dispatch ticks concurrently', async () => {
    let resolveFirstBatch!: (value: EmailNotification[]) => void;
    notificationsService.findPendingBatch
      .mockImplementationOnce(
        () =>
          new Promise<EmailNotification[]>((resolve) => {
            resolveFirstBatch = resolve;
          }),
      )
      .mockResolvedValueOnce([]);

    const firstTick = service.dispatchPendingNotifications();
    const secondTick = service.dispatchPendingNotifications();
    resolveFirstBatch([]);
    await Promise.all([firstTick, secondTick]);

    expect(notificationsService.findPendingBatch).toHaveBeenCalledTimes(1);
  });

  describe('handleCron', () => {
    it('does not dispatch when NODE_ENV is test', async () => {
      config.get.mockReturnValue('test');

      await service.handleCron();

      expect(notificationsService.findPendingBatch).not.toHaveBeenCalled();
    });

    it('dispatches when NODE_ENV is not test', async () => {
      config.get.mockReturnValue('production');
      notificationsService.findPendingBatch.mockResolvedValue([]);

      await service.handleCron();

      expect(notificationsService.findPendingBatch).toHaveBeenCalledTimes(1);
    });
  });
});
