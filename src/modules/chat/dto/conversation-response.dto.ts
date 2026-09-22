import { ApiProperty } from '@nestjs/swagger';
import { ChatConversation } from '../entities/chat-conversation.entity';
import { ChatConversationStatus } from '../enums/chat-conversation-status.enum';
import { ChatConversationParticipant } from '../interfaces/chat-conversation-participant.interface';

export class ChatConversationParticipantFields {
  @ApiProperty()
  id: string;

  @ApiProperty()
  username: string;

  static fromEntity(
    user: ChatConversationParticipant,
  ): ChatConversationParticipantFields {
    const fields = new ChatConversationParticipantFields();
    fields.id = user.id;
    fields.username = user.username;
    return fields;
  }
}

class ConversationFields {
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
  createdAt: Date;
}

/** `ConversationResponse` — dùng chung CHAT-01/02/06 (api-contract.md mục "Support chat"). */
export class ConversationResponseDto {
  @ApiProperty({ type: ConversationFields })
  conversation: ConversationFields;

  static fromEntity(conversation: ChatConversation): ConversationResponseDto {
    const dto = new ConversationResponseDto();
    dto.conversation = {
      id: conversation.id,
      customer: ChatConversationParticipantFields.fromEntity(
        conversation.customer,
      ),
      assignedAdmin: conversation.assignedAdmin
        ? ChatConversationParticipantFields.fromEntity(
            conversation.assignedAdmin,
          )
        : null,
      status: conversation.status,
      lastMessageAt: conversation.lastMessageAt,
      createdAt: conversation.createdAt,
    };
    return dto;
  }
}
