import { PreviousMonthBangkokRange } from '../interfaces/previous-month-bangkok-range.interface';

/**
 * Asia/Bangkok không có DST nên lệch UTC cố định +7h — không cần thư viện timezone, chỉ cộng/trừ
 * offset là đủ chính xác (khác với múi giờ có DST như US/EU thì cách này sai).
 */
const BANGKOK_UTC_OFFSET_MS = 7 * 60 * 60 * 1000;

function bangkokMonthStartUtc(year: number, monthIndex: number): Date {
  return new Date(
    Date.UTC(year, monthIndex, 1, 0, 0, 0) - BANGKOK_UTC_OFFSET_MS,
  );
}

/**
 * Khoảng nửa mở `[from, to)` của tháng dương lịch vừa kết thúc theo giờ Asia/Bangkok, tính từ
 * `referenceDate` (thời điểm cron chạy, 00:10 ngày đầu tháng). Dùng `[from, to)` để không đếm trùng
 * ở ranh giới (api-contract.md mục "Statistics và monthly revenue").
 */
export function getPreviousMonthBangkokRange(
  referenceDate: Date,
): PreviousMonthBangkokRange {
  const bangkokNow = new Date(referenceDate.getTime() + BANGKOK_UTC_OFFSET_MS);
  const currentYear = bangkokNow.getUTCFullYear();
  const currentMonthIndex = bangkokNow.getUTCMonth();

  const previousMonthIndex =
    currentMonthIndex === 0 ? 11 : currentMonthIndex - 1;
  const previousYear = currentMonthIndex === 0 ? currentYear - 1 : currentYear;

  return {
    from: bangkokMonthStartUtc(previousYear, previousMonthIndex),
    to: bangkokMonthStartUtc(currentYear, currentMonthIndex),
    reportPeriod: `${previousYear}-${String(previousMonthIndex + 1).padStart(2, '0')}-01`,
  };
}
