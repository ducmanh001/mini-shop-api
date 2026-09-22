import type { AuthenticatedUser } from '../../../common/auth/authenticated-user.interface';
import { UserRole } from '../../../common/enums/user-role.enum';
import { ChatConversation } from '../entities/chat-conversation.entity';

/**
 * Rule dùng chung REST (`ChatAccessService`, `ChatService.sendMessage`'s locked-row check) và WS
 * join (`ChatGateway`) — tránh lặp business logic giữa 2 transport (CODING_STANDARD.md mục 24).
 * ADMIN đọc/gửi được mọi conversation; CUSTOMER chỉ conversation của chính mình (database.md —
 * `chat_messages.sender_id` "customer owner hoặc ADMIN").
 */
export function canAccessConversation(
  conversation: Pick<ChatConversation, 'customerId'>,
  user: AuthenticatedUser,
): boolean {
  return user.role === UserRole.ADMIN || conversation.customerId === user.id;
}
