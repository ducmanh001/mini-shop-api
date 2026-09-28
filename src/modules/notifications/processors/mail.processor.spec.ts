import { Job } from 'bullmq';
import { EmailNotification } from '../entities/email-notification.entity';
import { EmailNotificationEventType } from '../enums/email-notification-event-type.enum';
import { EmailNotificationStatus } from '../enums/email-notification-status.enum';
import { MailJobData } from '../interfaces/mail-job.interface';
import { MailContentBuilderService } from '../services/mail-content-builder.service';
import { MailerService } from '../services/mailer.service';
import { NotificationsService } from '../services/notifications.service';
import { MailProcessor } from './mail.processor';

function buildNotification(
  overrides: Partial<EmailNotification>,
): EmailNotification {
  return {
    id: 'notif-1',
    eventType: EmailNotificationEventType.ORDER_PLACED,
    status: EmailNotificationStatus.PENDING,
    attempts: 0,
    recipientEmail: 'customer@example.test',
    ...overrides,
  } as EmailNotification;
}

function buildJob(notificationId = 'notif-1'): Job<MailJobData> {
  return { data: { notificationId } } as Job<MailJobData>;
}

describe('MailProcessor', () => {
  let notificationsService: {
    findByIdForSending: jest.Mock;
    findById: jest.Mock;
    reserveAttempt: jest.Mock;
    markSent: jest.Mock;
    markFailed: jest.Mock;
  };
  let mailContentBuilder: { build: jest.Mock };
  let mailerService: { sendMail: jest.Mock };
  let processor: MailProcessor;

  beforeEach(() => {
    notificationsService = {
      findByIdForSending: jest.fn(),
      findById: jest.fn(),
      reserveAttempt: jest.fn(),
      markSent: jest.fn().mockResolvedValue(undefined),
      markFailed: jest.fn().mockResolvedValue(undefined),
    };
    mailContentBuilder = {
      build: jest
        .fn()
        .mockReturnValue({ subject: 'Subject', html: '<p>Hi</p>' }),
    };
    mailerService = { sendMail: jest.fn().mockResolvedValue(undefined) };
    processor = new MailProcessor(
      notificationsService as unknown as NotificationsService,
      mailContentBuilder as unknown as MailContentBuilderService,
      mailerService as unknown as MailerService,
    );
  });

  it('does nothing when the notification no longer exists', async () => {
    notificationsService.findByIdForSending.mockResolvedValue(null);

    await processor.process(buildJob());

    expect(notificationsService.reserveAttempt).not.toHaveBeenCalled();
  });

  it('does nothing when the notification is no longer PENDING (idempotent consumer)', async () => {
    notificationsService.findByIdForSending.mockResolvedValue(
      buildNotification({ status: EmailNotificationStatus.SENT }),
    );

    await processor.process(buildJob());

    expect(notificationsService.reserveAttempt).not.toHaveBeenCalled();
  });

  it('sends mail and marks SENT on success', async () => {
    notificationsService.findByIdForSending.mockResolvedValue(
      buildNotification({}),
    );
    notificationsService.reserveAttempt.mockResolvedValue(true);

    await processor.process(buildJob());

    expect(mailerService.sendMail).toHaveBeenCalledWith(
      'customer@example.test',
      { subject: 'Subject', html: '<p>Hi</p>' },
    );
    expect(notificationsService.markSent).toHaveBeenCalledWith('notif-1');
  });

  it('marks FAILED when reserve fails and the retry budget is exhausted', async () => {
    notificationsService.findByIdForSending.mockResolvedValue(
      buildNotification({}),
    );
    notificationsService.reserveAttempt.mockResolvedValue(false);
    notificationsService.findById.mockResolvedValue(
      buildNotification({ attempts: 3 }),
    );

    await processor.process(buildJob());

    expect(notificationsService.markFailed).toHaveBeenCalledWith(
      'notif-1',
      'Retry budget exhausted before send attempt',
    );
    expect(mailerService.sendMail).not.toHaveBeenCalled();
  });

  it('does nothing when reserve fails but the budget is not actually exhausted', async () => {
    notificationsService.findByIdForSending.mockResolvedValue(
      buildNotification({}),
    );
    notificationsService.reserveAttempt.mockResolvedValue(false);
    notificationsService.findById.mockResolvedValue(
      buildNotification({ status: EmailNotificationStatus.SENT }),
    );

    await processor.process(buildJob());

    expect(notificationsService.markFailed).not.toHaveBeenCalled();
  });

  it('rethrows so the job fails when send fails and budget remains', async () => {
    notificationsService.findByIdForSending.mockResolvedValue(
      buildNotification({}),
    );
    notificationsService.reserveAttempt.mockResolvedValue(true);
    mailerService.sendMail.mockRejectedValue(new Error('SMTP timeout'));
    notificationsService.findById.mockResolvedValue(
      buildNotification({ attempts: 1 }),
    );

    await expect(processor.process(buildJob())).rejects.toThrow('SMTP timeout');
    expect(notificationsService.markFailed).not.toHaveBeenCalled();
  });

  it('does not resend or rethrow when sendMail succeeds but markSent fails', async () => {
    notificationsService.findByIdForSending.mockResolvedValue(
      buildNotification({}),
    );
    notificationsService.reserveAttempt.mockResolvedValue(true);
    notificationsService.markSent.mockRejectedValue(new Error('DB timeout'));

    await expect(processor.process(buildJob())).resolves.toBeUndefined();

    expect(mailerService.sendMail).toHaveBeenCalledTimes(1);
    expect(notificationsService.markFailed).not.toHaveBeenCalled();
  });

  it('marks FAILED without rethrowing on the final failed attempt', async () => {
    notificationsService.findByIdForSending.mockResolvedValue(
      buildNotification({}),
    );
    notificationsService.reserveAttempt.mockResolvedValue(true);
    mailerService.sendMail.mockRejectedValue(new Error('SMTP timeout'));
    notificationsService.findById.mockResolvedValue(
      buildNotification({ attempts: 3 }),
    );

    await expect(processor.process(buildJob())).resolves.toBeUndefined();
    expect(notificationsService.markFailed).toHaveBeenCalledWith(
      'notif-1',
      'SMTP timeout',
    );
  });
});
