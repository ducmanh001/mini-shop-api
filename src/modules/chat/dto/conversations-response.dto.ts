import { ApiProperty } from '@nestjs/swagger';
import { ChatConversationParticipantFields } from './conversation-response.dto';
import { ChatConversationStatus } from '../enums/chat-conversation-status.enum';
import { ChatConversationSummarySource } from '../interfaces/chat-conversation-summary-source.interface';

class ChatConversationSummaryFields {
  @ApiProperty()
  id: string;

  @ApiProperty({ type: ChatConversationParticipantFields })
  customer: ChatConversationParticipantFields;

  @ApiProperty({ type: ChatConversationParticipantFields, nullable: true })
  assignedAdmin: ChatConversationParticipantFields | null;

  @ApiProperty({ enum: ChatConversationStatus })
  status: ChatConversationStatus;

  @ApiProperty({ nullable: true })
  lastMessageAt: Date | null;

  @ApiProperty()
  unreadCount: number;

  @ApiProperty()
  createdAt: Date;

  static fromSource(
    source: ChatConversationSummarySource,
  ): ChatConversationSummaryFields {
    const fields = new ChatConversationSummaryFields();
    fields.id = source.id;
    fields.customer = ChatConversationParticipantFields.fromEntity(
      source.customer,
    );
    fields.assignedAdmin = source.assignedAdmin
      ? ChatConversationParticipantFields.fromEntity(source.assignedAdmin)
      : null;
    fields.status = source.status;
    fields.lastMessageAt = source.lastMessageAt;
    fields.unreadCount = source.unreadCount;
    fields.createdAt = source.createdAt;
    return fields;
  }
}

/** `GET /admin/chat/conversations` (CHAT-05) — sort `lastMessageAt DESC, id DESC`, `unreadCount` không N+1. */
export class ChatConversationsResponseDto {
  @ApiProperty({ type: [ChatConversationSummaryFields] })
  conversations: ChatConversationSummaryFields[];

  @ApiProperty()
  conversationsCount: number;

  static fromSources(
    rows: ChatConversationSummarySource[],
    conversationsCount: number,
  ): ChatConversationsResponseDto {
    const dto = new ChatConversationsResponseDto();
    dto.conversations = rows.map((row) =>
      ChatConversationSummaryFields.fromSource(row),
    );
    dto.conversationsCount = conversationsCount;
    return dto;
  }
}
