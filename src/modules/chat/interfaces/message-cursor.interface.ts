/**
 * `createdAtRaw` là text cast trực tiếp từ Postgres (KHÔNG phải `Date` JS) — `pg` dựng lại `Date` từ
 * timestamptz chỉ giữ độ chính xác millisecond trong khi cột lưu microsecond (`DEFAULT now()`), nên
 * nếu đi qua `Date` thì cursor có thể kém chính xác hơn giá trị thật và làm rớt message khi phân
 * trang (xem `utils/message-cursor.util.ts`).
 */
export interface MessageCursor {
  createdAtRaw: string;
  id: string;
}
