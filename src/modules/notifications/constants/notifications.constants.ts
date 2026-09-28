import type { JobState } from 'bullmq';
import { EmailNotificationEventType } from '../enums/email-notification-event-type.enum';

export const MAX_EMAIL_NOTIFICATION_ATTEMPTS = 3;

/** Tránh lưu lỗi SMTP dài vô hạn vào cột `text`. */
export const LAST_ERROR_MAX_LENGTH = 1000;

export const NOTIFICATION_DISPATCH_BATCH_SIZE = 50;

export const MAIL_QUEUE_NAME = 'mail';
export const SEND_MAIL_JOB_NAME = 'send-mail';
export const MAIL_TRANSPORTER_PROVIDER = 'MAIL_TRANSPORTER_PROVIDER';

/**
 * Mailtrap Email Testing (Sandbox) API — dùng khi có `MAIL_API_TOKEN` (xem `MailtrapApiMailTransport`).
 * Phải nối thêm `/{inbox_id}` (`MAILTRAP_INBOX_ID`). Khác với Mailtrap Sending API
 * (`send.api.mailtrap.io`, yêu cầu verified sending domain) — tài khoản sandbox/free gọi nhầm
 * endpoint Sending sẽ bị 401 dù token đủ quyền (bug thật gặp ở PR19, xem
 * docs/testing/pr19-manual-test-guide.md).
 */
export const MAILTRAP_SANDBOX_SEND_API_BASE_URL =
  'https://sandbox.api.mailtrap.io/api/send';

/**
 * `fetch()` gọi Mailtrap không có timeout mặc định — 1 request treo bất thường (mạng chập chờn)
 * sẽ giữ job ở trạng thái "active" vô thời hạn, chặn đứng cả hàng đợi vì `MailProcessor` xử lý
 * tuần tự (concurrency 1). Bug thật gặp lúc deploy PR19: 1 job treo khiến mọi notification tạo
 * sau đó không bao giờ được xử lý dù dispatcher vẫn tick đều.
 */
export const MAILTRAP_API_TIMEOUT_MS = 15_000;

/**
 * `'completed'`/`'failed'` (terminal) và `'unknown'` (job đã bị dọn/không xác định được state) cố
 * ý KHÔNG nằm trong set này — coi là "orphan" để dispatcher tạo job mới, thiên về hướng tự phục
 * hồi thay vì bỏ mặc treo (bug thật gặp ở PR19: job kẹt "delayed" không được tự đẩy lại "wait").
 */
export const IN_FLIGHT_JOB_STATES: ReadonlySet<JobState | 'unknown'> = new Set([
  'active',
  'waiting',
  'delayed',
  'waiting-children',
  'prioritized',
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

export const MONTHLY_REVENUE_MAIL_KEY = 'monthlyRevenue';

/**
 * 6 field (giây phút giờ ngày-tháng tháng thứ-trong-tuần) — cùng định dạng `CronExpression` của
 * `@nestjs/schedule` dùng (vd `EVERY_DAY_AT_MIDNIGHT = '0 0 0 * * *'`), không có preset dựng sẵn cho
 * "00:10 ngày đầu mỗi tháng" nên khai riêng. api-contract.md mục "Statistics và monthly revenue".
 */
export const MONTHLY_REPORT_CRON_EXPRESSION = '0 10 0 1 * *';
