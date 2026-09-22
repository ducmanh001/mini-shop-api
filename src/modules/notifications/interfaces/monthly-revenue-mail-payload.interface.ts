/** Set bởi `MonthlyReportService` khi tạo intent — không có `order`/`authToken` relation để đọc từ đó. */
export interface MonthlyRevenueMailPayload {
  templateVersion: 1;
  totalRevenueVnd: string;
}
