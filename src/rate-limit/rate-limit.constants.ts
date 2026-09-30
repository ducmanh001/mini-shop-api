import type { ThrottlerStorageRecord } from './throttler-storage-record.type';

/** Bộ đếm theo IP client — chặn một máy thử hàng loạt tài khoản. */
export const IP_THROTTLER_NAME = 'ip';
/** Bộ đếm theo email trong body — chặn đoán mật khẩu một tài khoản từ nhiều IP. */
export const ACCOUNT_THROTTLER_NAME = 'account';

export const MILLISECONDS_PER_SECOND = 1000;

/**
 * Thư viện chỉ ghi `Retry-After-<tên throttler>` cho throttler có tên; client và proxy chỉ hiểu
 * header `Retry-After` chuẩn (RFC 9110) nên guard tự ghi thêm.
 */
export const RETRY_AFTER_HEADER = 'Retry-After';

/** Kết quả "chưa tính hit nào, không chặn" khi rate-limit store lỗi (xem `FailOpenThrottlerStorage`). */
export const RATE_LIMIT_ALLOW_RECORD: ThrottlerStorageRecord = {
  totalHits: 0,
  timeToExpire: 0,
  isBlocked: false,
  timeToBlockExpire: 0,
};
