/** Kết quả của `getPreviousMonthBangkokRange()` — dùng bởi `MonthlyReportService`. */
export interface PreviousMonthBangkokRange {
  /** Mốc đầu tháng vừa kết thúc (UTC instant) — cận dưới đóng của khoảng `[from, to)`. */
  from: Date;
  /** Mốc đầu tháng hiện tại theo giờ Bangkok (UTC instant) — cận trên mở của khoảng `[from, to)`. */
  to: Date;
  /** `YYYY-MM-01` của tháng vừa kết thúc — giá trị lưu vào cột `report_period`. */
  reportPeriod: string;
}
