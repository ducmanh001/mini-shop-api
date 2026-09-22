/**
 * Header bắt buộc cho mọi endpoint dùng Idempotency-Key (`POST /orders` — database.md mục 6,
 * `POST /chat/conversations/:id/messages` — database.md mục 4 "chat_messages"). Express/Nest nhận
 * header dạng lowercase. Dùng chung nhiều module (orders, chat) nên đặt ở common/ thay vì để một
 * module sở hữu rồi module kia phải import chéo (CODING_STANDARD.md mục 10).
 */
export const IDEMPOTENCY_KEY_HEADER = 'idempotency-key';
