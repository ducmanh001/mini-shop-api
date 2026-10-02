/** Độ dài tối đa của request ID nhận từ upstream — đủ cho UUID (36) và trace ID của các proxy. */
export const MAX_REQUEST_ID_LENGTH = 64;

/**
 * Chỉ nhận chữ, số và `_ . : -` (UUID, ULID, hex, trace ID của proxy). Request ID đi thẳng vào log
 * và được trả lại trong header nên không được chứa khoảng trắng, dấu ngoặc hay `=` — nếu không
 * client tự giả được các trường khác trong dòng log (`[route=..., ip=...]`).
 */
export const REQUEST_ID_PATTERN = new RegExp(
  `^[\\w.:-]{1,${MAX_REQUEST_ID_LENGTH}}$`,
);
