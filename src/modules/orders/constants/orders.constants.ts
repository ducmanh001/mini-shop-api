import { OrderStatus } from '../enums/order-status.enum';

export const MIN_ORDER_TOTAL_VND = 1;
export const MAX_ORDER_TOTAL_VND = 1_980_000_000_000;

/** `CheckoutRequest.recipientName` — api-contract.md dòng 48. */
export const MAX_RECIPIENT_NAME_LENGTH = 100;

/** `CheckoutRequest.phone` — 8..20 ký tự tổng, chỉ chữ số và dấu `+` ở đầu nếu có. */
export const MIN_PHONE_LENGTH = 8;
export const MAX_PHONE_LENGTH = 20;
export const PHONE_FORMAT_PATTERN = /^\+?\d+$/;

/** `CheckoutRequest.address` — api-contract.md dòng 48. */
export const MAX_ADDRESS_LENGTH = 500;

/** `CheckoutRequest.customerNote` — tùy chọn, api-contract.md dòng 48. */
export const MAX_CUSTOMER_NOTE_LENGTH = 500;

/** `orders.rejection_reason` / `order_status_history.reason` — database.md mục 4. */
export const MAX_ORDER_REJECTION_REASON_LENGTH = 500;

/** Target status admin được phép gửi trong `OrderStatusRequest` — api-contract.md dòng 49. */
export const ADMIN_ORDER_TRANSITION_TARGETS = [
  OrderStatus.CONFIRMED,
  OrderStatus.REJECTED,
  OrderStatus.COMPLETED,
] as const;

/**
 * Cạnh chuyển trạng thái hợp lệ do ADMIN thực hiện — database.md mục 7 (state diagram) +
 * api-contract.md dòng 442-452. Không gồm PENDING → CANCELLED vì đó là hành động của CUSTOMER sở
 * hữu đơn (`OrdersService.cancel`), không đi qua `updateStatusByAdmin`.
 */
export const ADMIN_ORDER_TRANSITIONS: Readonly<
  Partial<Record<OrderStatus, readonly OrderStatus[]>>
> = {
  [OrderStatus.PENDING]: [OrderStatus.CONFIRMED, OrderStatus.REJECTED],
  [OrderStatus.CONFIRMED]: [OrderStatus.COMPLETED],
};

/**
 * `GET /admin/orders/export` — chặn build workbook không giới hạn cho lượng đơn rất lớn (tránh
 * nghẽn bộ nhớ); vượt ngưỡng thì chỉ xuất `MAX_ORDER_EXPORT_ROWS` dòng mới nhất, không lỗi.
 */
export const MAX_ORDER_EXPORT_ROWS = 5000;

export const ORDER_EXPORT_SHEET_NAME = 'Orders';
export const ORDER_EXPORT_FILENAME = 'orders-export.xlsx';
export const XLSX_CONTENT_TYPE =
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

/** Cột + thứ tự cố định của file xuất — tách khỏi util build workbook để dễ đối chiếu khi đổi. */
export const ORDER_EXPORT_COLUMNS: ReadonlyArray<{
  header: string;
  key: string;
  width: number;
}> = [
  { header: 'Order ID', key: 'id', width: 38 },
  { header: 'Status', key: 'status', width: 14 },
  { header: 'Total (VND)', key: 'totalVnd', width: 16 },
  { header: 'Recipient', key: 'recipientName', width: 24 },
  { header: 'Phone', key: 'phone', width: 16 },
  { header: 'Created At', key: 'createdAt', width: 22 },
  { header: 'Completed At', key: 'completedAt', width: 22 },
];
