import type { JobStatus } from 'bull';
import { EmailNotificationEventType } from '../enums/email-notification-event-type.enum';

export const MAX_EMAIL_NOTIFICATION_ATTEMPTS = 3;

/** Tránh lưu lỗi SMTP dài vô hạn vào cột `text`. */
export const LAST_ERROR_MAX_LENGTH = 1000;

export const NOTIFICATION_DISPATCH_BATCH_SIZE = 50;

export const MAIL_QUEUE_NAME = 'mail';
export const SEND_MAIL_JOB_NAME = 'send-mail';
export const MAIL_JOB_BACKOFF_DELAY_MS = 2000;
export const MAIL_TRANSPORTER_PROVIDER = 'MAIL_TRANSPORTER_PROVIDER';

/**
 * `'stuck'` (một state khác thêm bởi `Job.getState()`, không thuộc `JobStatus`) cố ý KHÔNG nằm
 * trong set này: nó nghĩa là worker giữ lock đã chết, tức đúng là "orphan" dispatcher cần xử lý.
 */
export const IN_FLIGHT_JOB_STATES: ReadonlySet<JobStatus | 'stuck'> = new Set([
  'active',
  'waiting',
  'delayed',
]);

export const AUTH_TOKEN_LINK_PATH: Partial<
  Record<EmailNotificationEventType, string>
> = {
  [EmailNotificationEventType.EMAIL_VERIFICATION]: 'verify-email',
  [EmailNotificationEventType.PASSWORD_RESET]: 'reset-password',
};

export const ORDER_MAIL_KEY: Partial<
  Record<EmailNotificationEventType, string>
> = {
  [EmailNotificationEventType.ORDER_PLACED]: 'orderPlaced',
  [EmailNotificationEventType.ORDER_CONFIRMED]: 'orderConfirmed',
  [EmailNotificationEventType.ORDER_REJECTED]: 'orderRejected',
};
