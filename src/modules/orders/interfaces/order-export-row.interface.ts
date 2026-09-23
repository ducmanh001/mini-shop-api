/** Một dòng trong file xuất Excel của `GET /admin/orders/export` — khớp `key` của `ORDER_EXPORT_COLUMNS`. */
export interface OrderExportRow {
  id: string;
  status: string;
  totalVnd: string;
  recipientName: string;
  phone: string;
  createdAt: string;
  completedAt: string;
}
