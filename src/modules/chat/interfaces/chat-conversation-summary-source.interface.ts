import { ChatConversationStatus } from '../enums/chat-conversation-status.enum';
import { ChatConversationParticipant } from './chat-conversation-participant.interface';

/** Một dòng trong `GET /admin/chat/conversations` (CHAT-05) — `unreadCount` tính riêng, gộp bằng 1 aggregate query, không N+1. */
export interface ChatConversationSummarySource {
  id: string;
  customer: ChatConversationParticipant;
  assignedAdmin: ChatConversationParticipant | null;
  status: ChatConversationStatus;
  lastMessageAt: Date | null;
  unreadCount: number;
  createdAt: Date;
}
