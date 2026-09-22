import { MessageCursor } from '../interfaces/message-cursor.interface';

const CURSOR_ENCODING = 'base64url';

/** Ném ở `decodeMessageCursor` — util không phụ thuộc Nest/i18n, service gọi bắt lỗi và dịch sang `BadRequestException`. */
export class MalformedChatCursorError extends Error {
  constructor() {
    super('Malformed chat message cursor');
    this.name = 'MalformedChatCursorError';
  }
}

/**
 * Cursor cơ hội (opaque) cho `GET /chat/conversations/:id/messages` (CHAT-03) — chỉ base64url hoá
 * JSON, không tự diễn giải nội dung. `createdAtRaw` giữ nguyên chuỗi text Postgres trả về (xem
 * `MessageCursor`), không parse thành `Date` ở đây — việc parse sớm sẽ làm mất chính xác trước khi
 * cursor kịp dùng để so sánh lại trong SQL.
 */
export function encodeMessageCursor(cursor: MessageCursor): string {
  return Buffer.from(JSON.stringify(cursor)).toString(CURSOR_ENCODING);
}

export function decodeMessageCursor(token: string): MessageCursor {
  const parsed: unknown = JSON.parse(
    Buffer.from(token, CURSOR_ENCODING).toString('utf8'),
  );
  if (
    typeof parsed !== 'object' ||
    parsed === null ||
    typeof (parsed as Record<string, unknown>).createdAtRaw !== 'string' ||
    typeof (parsed as Record<string, unknown>).id !== 'string'
  ) {
    throw new MalformedChatCursorError();
  }
  return parsed as MessageCursor;
}
