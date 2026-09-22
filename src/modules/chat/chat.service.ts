import {
  BadRequestException,
  ConflictException,
  HttpStatus,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { createHash } from 'crypto';
import { I18nService } from 'nestjs-i18n';
import { DataSource, EntityManager } from 'typeorm';
import type { AuthenticatedUser } from '../../common/auth/authenticated-user.interface';
import { UserRole } from '../../common/enums/user-role.enum';
import { canonicalizeForHash } from '../../common/utils/idempotency.util';
import {
  getViolatedConstraint,
  isUniqueViolation,
} from '../../common/utils/postgres-unique-violation.util';
import { UserStatus } from '../users/enums/user-status.enum';
import { UsersService } from '../users/users.service';
import { ChatAccessService } from './chat-access.service';
import { ChatGateway } from './chat.gateway';
import {
  CHAT_CONVERSATIONS_CUSTOMER_OPEN_CONSTRAINT,
  CHAT_MESSAGES_SENDER_IDEMPOTENCY_KEY_CONSTRAINT,
  DEFAULT_CHAT_MESSAGE_LIMIT,
} from './constants/chat.constants';
import { AdminListConversationsQueryDto } from './dto/admin-list-conversations-query.dto';
import { ChatMessageResponseDto } from './dto/chat-message-response.dto';
import { ChatMessagesResponseDto } from './dto/chat-messages-response.dto';
import { ConversationResponseDto } from './dto/conversation-response.dto';
import { ChatConversationsResponseDto } from './dto/conversations-response.dto';
import { ListMessagesQueryDto } from './dto/list-messages-query.dto';
import { SendMessageDto } from './dto/send-message.dto';
import { UpdateChatConversationDto } from './dto/update-conversation.dto';
import { ChatConversation } from './entities/chat-conversation.entity';
import { ChatMessage } from './entities/chat-message.entity';
import { ChatConversationStatus } from './enums/chat-conversation-status.enum';
import { ChatConversationSummarySource } from './interfaces/chat-conversation-summary-source.interface';
import { canAccessConversation } from './utils/chat-authorization.util';
import {
  decodeMessageCursor,
  encodeMessageCursor,
} from './utils/message-cursor.util';

@Injectable()
export class ChatService {
  private readonly logger = new Logger(ChatService.name);

  constructor(
    private readonly dataSource: DataSource,
    private readonly i18n: I18nService,
    private readonly usersService: UsersService,
    private readonly chatAccessService: ChatAccessService,
    private readonly chatGateway: ChatGateway,
  ) {}

  /**
   * CHAT-01 — get-or-create. Check-rồi-insert vẫn có thể đua (2 request cùng lúc không thấy OPEN
   * đang tồn tại), nên bắt `23505` trên partial unique index thay vì chỉ dựa vào SELECT trước đó
   * (CODING_STANDARD.md mục 22/7) — đây là phần thật sự đảm bảo "gọi lặp trả conversation đang mở".
   */
  async getOrCreateOpenConversation(customerId: string): Promise<{
    conversation: ConversationResponseDto;
    statusCode: HttpStatus;
  }> {
    const repository = this.dataSource.getRepository(ChatConversation);
    const existing = await repository.findOne({
      select: { id: true },
      where: { customerId, status: ChatConversationStatus.OPEN },
    });
    if (existing) {
      return {
        conversation: await this.loadConversationResponse(existing.id),
        statusCode: HttpStatus.OK,
      };
    }

    try {
      const created = await repository.save(
        repository.create({ customerId, status: ChatConversationStatus.OPEN }),
      );
      this.logger.log(
        `Customer ${customerId} opened conversation ${created.id}`,
      );
      return {
        conversation: await this.loadConversationResponse(created.id),
        statusCode: HttpStatus.CREATED,
      };
    } catch (error) {
      if (
        !isUniqueViolation(error) ||
        getViolatedConstraint(error) !==
          CHAT_CONVERSATIONS_CUSTOMER_OPEN_CONSTRAINT
      ) {
        throw error;
      }
      const winner = await repository.findOne({
        select: { id: true },
        where: { customerId, status: ChatConversationStatus.OPEN },
      });
      if (!winner) {
        throw error;
      }
      return {
        conversation: await this.loadConversationResponse(winner.id),
        statusCode: HttpStatus.OK,
      };
    }
  }

  /** CHAT-02 — chỉ conversation OPEN hiện tại của chính customer, 404 nếu chưa mở lần nào. */
  async getMyOpenConversation(
    customerId: string,
  ): Promise<ConversationResponseDto> {
    const conversation = await this.dataSource
      .getRepository(ChatConversation)
      .findOne({
        select: { id: true },
        where: { customerId, status: ChatConversationStatus.OPEN },
      });
    if (!conversation) {
      throw new NotFoundException(this.i18n.t('errors.conversationNotFound'));
    }
    return this.loadConversationResponse(conversation.id);
  }

  /**
   * CHAT-03 — cursor `(createdAt DESC, id DESC)`, đánh dấu đã đọc tin của phía còn lại như hiệu ứng
   * phụ (1 UPDATE gộp, không phải mark từng dòng) để `unreadCount` ở CHAT-05 có ý nghĩa.
   */
  async listMessages(
    conversationId: string,
    user: AuthenticatedUser,
    query: ListMessagesQueryDto,
  ): Promise<ChatMessagesResponseDto> {
    await this.chatAccessService.assertCanReadConversation(
      conversationId,
      user,
    );

    const limit = query.limit ?? DEFAULT_CHAT_MESSAGE_LIMIT;
    const queryBuilder = this.dataSource
      .getRepository(ChatMessage)
      .createQueryBuilder('message')
      .addSelect('message.created_at::text', 'message_created_at_raw')
      .where('message.conversationId = :conversationId', { conversationId })
      .orderBy('message.createdAt', 'DESC')
      .addOrderBy('message.id', 'DESC')
      .take(limit + 1);

    if (query.cursor) {
      let cursor;
      try {
        cursor = decodeMessageCursor(query.cursor);
      } catch {
        throw new BadRequestException(this.i18n.t('errors.invalidChatCursor'));
      }
      queryBuilder.andWhere(
        '(message.created_at, message.id) < (:cursorCreatedAt::timestamptz, :cursorId)',
        { cursorCreatedAt: cursor.createdAtRaw, cursorId: cursor.id },
      );
    }

    const { entities, raw } = await queryBuilder.getRawAndEntities<{
      message_created_at_raw: string;
    }>();
    const hasMore = entities.length > limit;
    const page = hasMore ? entities.slice(0, limit) : entities;
    const rawPage = hasMore ? raw.slice(0, limit) : raw;

    await this.markOthersMessagesRead(conversationId, user.id);

    const nextCursor = hasMore
      ? encodeMessageCursor({
          createdAtRaw: rawPage[rawPage.length - 1].message_created_at_raw,
          id: page[page.length - 1].id,
        })
      : null;

    return ChatMessagesResponseDto.fromEntities(page, nextCursor);
  }

  /**
   * CHAT-04 — khoá conversation trước (mirrors `OrdersService.checkout`'s lock-then-`findReplay`
   * order), replay-check trước điều kiện OPEN (idempotency trả lại đúng kết quả cũ dù state hiện
   * tại đã đổi, giống checkout không quan tâm giỏ đã rỗng khi replay). Hash gồm `conversationId` để
   * cùng key khác conversation không bị coi là replay sai (unique constraint chỉ scope theo sender).
   */
  async sendMessage(
    conversationId: string,
    currentUser: AuthenticatedUser,
    dto: SendMessageDto,
    idempotencyKey: string,
  ): Promise<{ message: ChatMessageResponseDto; statusCode: HttpStatus }> {
    const trimmedBody = dto.body.trim();
    const requestHash = this.hashRequest(
      canonicalizeForHash({ conversationId, body: trimmedBody }),
    );

    const result = await this.dataSource.transaction(async (manager) => {
      const conversation = await manager
        .getRepository(ChatConversation)
        .findOne({
          select: { id: true, customerId: true, status: true },
          where: { id: conversationId },
          lock: { mode: 'pessimistic_write' },
        });
      if (!conversation || !canAccessConversation(conversation, currentUser)) {
        throw new NotFoundException(this.i18n.t('errors.conversationNotFound'));
      }

      const replay = await this.findMessageReplay(
        currentUser.id,
        idempotencyKey,
        requestHash,
        manager,
      );
      if (replay) {
        return { message: replay, statusCode: HttpStatus.OK };
      }

      if (conversation.status !== ChatConversationStatus.OPEN) {
        throw new ConflictException(
          this.i18n.t('errors.chatConversationClosed'),
        );
      }

      const messageRepository = manager.getRepository(ChatMessage);
      let message: ChatMessage;
      try {
        message = await messageRepository.save(
          messageRepository.create({
            conversationId,
            senderId: currentUser.id,
            idempotencyKey,
            requestHash,
            body: trimmedBody,
          }),
        );
      } catch (error) {
        if (
          !isUniqueViolation(error) ||
          getViolatedConstraint(error) !==
            CHAT_MESSAGES_SENDER_IDEMPOTENCY_KEY_CONSTRAINT
        ) {
          throw error;
        }
        const concurrentReplay = await this.findMessageReplay(
          currentUser.id,
          idempotencyKey,
          requestHash,
          manager,
        );
        if (!concurrentReplay) {
          throw error;
        }
        return { message: concurrentReplay, statusCode: HttpStatus.OK };
      }

      await manager
        .getRepository(ChatConversation)
        .update(conversationId, { lastMessageAt: message.createdAt });

      this.logger.log(
        `User ${currentUser.id} sent message ${message.id} in conversation ${conversationId}`,
      );
      return {
        message: ChatMessageResponseDto.fromEntity(message),
        statusCode: HttpStatus.CREATED,
      };
    });

    if (result.statusCode === HttpStatus.CREATED) {
      try {
        await this.chatGateway.broadcastMessageCreated(
          conversationId,
          result.message,
        );
      } catch (error) {
        this.logger.error(
          `Failed to broadcast chat.message.created for conversation ${conversationId}`,
          error as Error,
        );
      }
    }

    return result;
  }

  /** CHAT-05 — offset, sort `lastMessageAt DESC, id DESC`, `unreadCount` bằng 1 aggregate query riêng (không N+1). */
  async listForAdmin(
    query: AdminListConversationsQueryDto,
  ): Promise<ChatConversationsResponseDto> {
    const queryBuilder = this.dataSource
      .getRepository(ChatConversation)
      .createQueryBuilder('conversation')
      .leftJoin('conversation.customer', 'customer')
      .leftJoin('conversation.assignedAdmin', 'assignedAdmin')
      .select([
        'conversation.id',
        'conversation.status',
        'conversation.lastMessageAt',
        'conversation.createdAt',
        'customer.id',
        'customer.username',
        'assignedAdmin.id',
        'assignedAdmin.username',
      ])
      .orderBy('conversation.lastMessageAt', 'DESC')
      .addOrderBy('conversation.id', 'DESC')
      .take(query.limit)
      .skip(query.offset);

    if (query.status) {
      queryBuilder.andWhere('conversation.status = :status', {
        status: query.status,
      });
    }
    if (query.assignedAdminId) {
      queryBuilder.andWhere('conversation.assignedAdminId = :assignedAdminId', {
        assignedAdminId: query.assignedAdminId,
      });
    }

    const [conversations, conversationsCount] =
      await queryBuilder.getManyAndCount();
    const unreadCountByConversationId = await this.countUnreadByConversation(
      conversations.map((conversation) => conversation.id),
    );

    const rows: ChatConversationSummarySource[] = conversations.map(
      (conversation) => ({
        id: conversation.id,
        customer: {
          id: conversation.customer.id,
          username: conversation.customer.username,
        },
        assignedAdmin: conversation.assignedAdmin
          ? {
              id: conversation.assignedAdmin.id,
              username: conversation.assignedAdmin.username,
            }
          : null,
        status: conversation.status,
        lastMessageAt: conversation.lastMessageAt,
        unreadCount: unreadCountByConversationId.get(conversation.id) ?? 0,
        createdAt: conversation.createdAt,
      }),
    );

    return ChatConversationsResponseDto.fromSources(rows, conversationsCount);
  }

  /**
   * CHAT-06 — khoá row trước khi áp update (mọi update dựa trên row đã lock). Reopen (CLOSED→OPEN)
   * có thể vi phạm partial unique index của MỘT conversation OPEN khác của cùng customer — khoá row
   * đang sửa không bảo vệ được trường hợp đó (đó là row khác), nên bắt `23505` trên chính UPDATE
   * thay vì pre-check (mục 22/7 CODING_STANDARD.md, cùng lý luận với `getOrCreateOpenConversation`).
   */
  async updateConversation(
    conversationId: string,
    dto: UpdateChatConversationDto,
  ): Promise<ConversationResponseDto> {
    if (dto.assignedAdminId === undefined && dto.status === undefined) {
      throw new BadRequestException(
        this.i18n.t('errors.atLeastOneFieldRequired'),
      );
    }

    if (dto.assignedAdminId !== undefined) {
      await this.assertActiveAdmin(dto.assignedAdminId);
    }

    return this.dataSource.transaction(async (manager) => {
      const conversation = await manager
        .getRepository(ChatConversation)
        .findOne({
          select: { id: true, status: true },
          where: { id: conversationId },
          lock: { mode: 'pessimistic_write' },
        });
      if (!conversation) {
        throw new NotFoundException(this.i18n.t('errors.conversationNotFound'));
      }
      if (
        dto.status !== undefined &&
        !this.isValidConversationTransition(conversation.status, dto.status)
      ) {
        throw new ConflictException(
          this.i18n.t('errors.invalidChatConversationTransition'),
        );
      }

      try {
        await manager.getRepository(ChatConversation).update(conversationId, {
          ...(dto.assignedAdminId !== undefined && {
            assignedAdminId: dto.assignedAdminId,
          }),
          ...(dto.status !== undefined && { status: dto.status }),
        });
      } catch (error) {
        if (
          !isUniqueViolation(error) ||
          getViolatedConstraint(error) !==
            CHAT_CONVERSATIONS_CUSTOMER_OPEN_CONSTRAINT
        ) {
          throw error;
        }
        throw new ConflictException(
          this.i18n.t('errors.invalidChatConversationTransition'),
        );
      }

      return this.loadConversationResponse(conversationId, manager);
    });
  }

  private isValidConversationTransition(
    from: ChatConversationStatus,
    to: ChatConversationStatus,
  ): boolean {
    return from !== to;
  }

  private async assertActiveAdmin(adminId: string): Promise<void> {
    const admin = await this.usersService.findById(adminId);
    if (!admin) {
      throw new NotFoundException(this.i18n.t('errors.userNotFound'));
    }
    if (admin.role !== UserRole.ADMIN || admin.status !== UserStatus.ACTIVE) {
      throw new BadRequestException(
        this.i18n.t('errors.chatAssigneeMustBeActiveAdmin'),
      );
    }
  }

  private async countUnreadByConversation(
    conversationIds: string[],
  ): Promise<Map<string, number>> {
    if (conversationIds.length === 0) {
      return new Map();
    }
    const rows = await this.dataSource
      .getRepository(ChatMessage)
      .createQueryBuilder('message')
      .innerJoin(
        ChatConversation,
        'conversation',
        'conversation.id = message.conversationId',
      )
      .select('message.conversationId', 'conversationId')
      .addSelect('COUNT(*)', 'count')
      .where('message.conversationId IN (:...conversationIds)', {
        conversationIds,
      })
      .andWhere('message.senderId = conversation.customerId')
      .andWhere('message.readAt IS NULL')
      .groupBy('message.conversationId')
      .getRawMany<{ conversationId: string; count: string }>();
    return new Map(rows.map((row) => [row.conversationId, Number(row.count)]));
  }

  private async markOthersMessagesRead(
    conversationId: string,
    requesterId: string,
  ): Promise<void> {
    await this.dataSource
      .getRepository(ChatMessage)
      .createQueryBuilder()
      .update(ChatMessage)
      .set({ readAt: () => 'now()' })
      .where('conversationId = :conversationId', { conversationId })
      .andWhere('senderId != :requesterId', { requesterId })
      .andWhere('readAt IS NULL')
      .execute();
  }

  /** Cùng key/cùng nội dung (gồm conversationId trong hash) → trả message cũ (200). Cùng key/khác nội dung → 409. */
  private async findMessageReplay(
    senderId: string,
    idempotencyKey: string,
    requestHash: string,
    manager: EntityManager,
  ): Promise<ChatMessageResponseDto | null> {
    const existing = await manager.getRepository(ChatMessage).findOne({
      select: {
        id: true,
        conversationId: true,
        senderId: true,
        requestHash: true,
        body: true,
        readAt: true,
        createdAt: true,
      },
      where: { senderId, idempotencyKey },
    });
    if (!existing) {
      return null;
    }
    if (existing.requestHash !== requestHash) {
      throw new ConflictException(
        this.i18n.t('errors.chatIdempotencyKeyConflict'),
      );
    }
    return ChatMessageResponseDto.fromEntity(existing);
  }

  /** Dùng cho response sau mọi thao tác tạo/sửa conversation — luôn đọc lại có `customer`/`assignedAdmin`. */
  private async loadConversationResponse(
    conversationId: string,
    manager?: EntityManager,
  ): Promise<ConversationResponseDto> {
    const repository = manager
      ? manager.getRepository(ChatConversation)
      : this.dataSource.getRepository(ChatConversation);
    const conversation = await repository.findOne({
      select: {
        id: true,
        status: true,
        lastMessageAt: true,
        createdAt: true,
        customer: { id: true, username: true },
        assignedAdmin: { id: true, username: true },
      },
      relations: { customer: true, assignedAdmin: true },
      where: { id: conversationId },
    });
    if (!conversation) {
      throw new NotFoundException(this.i18n.t('errors.conversationNotFound'));
    }
    return ConversationResponseDto.fromEntity(conversation);
  }

  private hashRequest(canonical: string): string {
    return createHash('sha256').update(canonical).digest('hex');
  }
}
