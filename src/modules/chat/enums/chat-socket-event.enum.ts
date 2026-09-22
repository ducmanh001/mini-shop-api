/**
 * Tên event WebSocket namespace `/chat` (CHAT-07) — dùng cả ở client emit (`ConversationJoin`) và
 * server broadcast (`MessageCreated`), xem docs/planning/api-contract.md mục "Support chat".
 */
export enum ChatSocketEvent {
  ConversationJoin = 'conversation.join',
  MessageCreated = 'chat.message.created',
}
