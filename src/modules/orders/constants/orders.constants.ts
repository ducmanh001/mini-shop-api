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

/** Header bắt buộc cho `POST /orders` — database.md mục 6. Express/Nest nhận header dạng lowercase. */
export const IDEMPOTENCY_KEY_HEADER = 'idempotency-key';
