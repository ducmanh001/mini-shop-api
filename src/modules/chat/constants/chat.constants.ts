export const MAX_CHAT_MESSAGE_BODY_LENGTH = 2000;

/** `GET /chat/conversations/:id/messages` (CHAT-03) — cursor limit, api-contract.md mục "Support chat". */
export const MIN_CHAT_MESSAGE_LIMIT = 1;
export const DEFAULT_CHAT_MESSAGE_LIMIT = 20;
export const MAX_CHAT_MESSAGE_LIMIT = 50;

/** WebSocket namespace cho CHAT-07 — api-contract.md mục "Support chat". */
export const CHAT_WS_NAMESPACE = '/chat';

/**
 * Tên constraint DB dùng để bắt lỗi `23505` cụ thể (CODING_STANDARD.md mục 7/22) — phải khớp đúng
 * tên `@Index()`/`@Unique()` khai ở entity, gom thành hằng số vì dùng lặp lại ở nhiều nhánh catch.
 */
export const CHAT_CONVERSATIONS_CUSTOMER_OPEN_CONSTRAINT =
  'idx_chat_conversations_customer_open';
export const CHAT_MESSAGES_SENDER_IDEMPOTENCY_KEY_CONSTRAINT =
  'uq_chat_messages_sender_idempotency_key';
