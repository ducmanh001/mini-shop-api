import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { I18nService } from 'nestjs-i18n';
import { DataSource, EntityManager } from 'typeorm';
import type { AuthenticatedUser } from '../../common/auth/authenticated-user.interface';
import { ChatConversation } from './entities/chat-conversation.entity';
import { ChatConversationStatus } from './enums/chat-conversation-status.enum';
import { canAccessConversation } from './utils/chat-authorization.util';

/**
 * Rule "ai đọc/join được conversation nào" tách khỏi `ChatService` để `ChatGateway` gọi được mà
 * không tạo phụ thuộc vòng `ChatGateway ↔ ChatService` (gateway chỉ join, không gửi message qua
 * WS — xem CODING_STANDARD.md mục 24). Cùng logic phục vụ cả CHAT-03 (REST) lẫn CHAT-07 (WS join)
 * nên REST/WS không thể phân kỳ quyền truy cập.
 */
@Injectable()
export class ChatAccessService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly i18n: I18nService,
  ) {}

  /**
   * CUSTOMER không sở hữu trả 404 (không lộ tồn tại), giống `OrdersService.getDetailForCustomer`.
   * ADMIN luôn đọc được (role-based, không giới hạn theo `assignedAdminId`).
   */
  async assertCanReadConversation(
    conversationId: string,
    user: AuthenticatedUser,
    manager?: EntityManager,
  ): Promise<ChatConversation> {
    const repository = manager
      ? manager.getRepository(ChatConversation)
      : this.dataSource.getRepository(ChatConversation);
    const conversation = await repository.findOne({
      select: {
        id: true,
        customerId: true,
        assignedAdminId: true,
        status: true,
        lastMessageAt: true,
        createdAt: true,
      },
      where: { id: conversationId },
    });
    if (!conversation || !canAccessConversation(conversation, user)) {
      throw new NotFoundException(this.i18n.t('errors.conversationNotFound'));
    }
    return conversation;
  }

  /** WS join (CHAT-07) — thêm điều kiện OPEN so với đọc lịch sử REST: CLOSED thì không còn gì để broadcast. */
  async assertCanJoinConversation(
    conversationId: string,
    user: AuthenticatedUser,
  ): Promise<ChatConversation> {
    const conversation = await this.assertCanReadConversation(
      conversationId,
      user,
    );
    if (conversation.status !== ChatConversationStatus.OPEN) {
      throw new ConflictException(this.i18n.t('errors.chatConversationClosed'));
    }
    return conversation;
  }
}
