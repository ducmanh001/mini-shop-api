/** Kết quả ack cho event `conversation.join` (CHAT-07) — lỗi không join/publish, chỉ trả code cho client tự xử lý. */
export type ChatJoinAckErrorCode =
  'UNAUTHORIZED' | 'NOT_FOUND' | 'CONVERSATION_CLOSED';

export type ChatJoinAck =
  { ok: true } | { ok: false; code: ChatJoinAckErrorCode };
