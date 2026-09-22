import { ApiProperty } from '@nestjs/swagger';
import { ChatMessage } from '../entities/chat-message.entity';

export class ChatMessageFields {
  @ApiProperty()
  id: string;

  @ApiProperty()
  conversationId: string;

  @ApiProperty()
  senderId: string;

  @ApiProperty()
  body: string;

  @ApiProperty({ nullable: true })
  readAt: Date | null;

  @ApiProperty()
  createdAt: Date;

  static fromEntity(
    message: Pick<
      ChatMessage,
      'id' | 'conversationId' | 'senderId' | 'body' | 'readAt' | 'createdAt'
    >,
  ): ChatMessageFields {
    const fields = new ChatMessageFields();
    fields.id = message.id;
    fields.conversationId = message.conversationId;
    fields.senderId = message.senderId;
    fields.body = message.body;
    fields.readAt = message.readAt;
    fields.createdAt = message.createdAt;
    return fields;
  }
}

/** `GET /chat/conversations/:id/messages` (CHAT-03) — cursor, `nextCursor` null nghĩa là hết trang. */
export class ChatMessagesResponseDto {
  @ApiProperty({ type: [ChatMessageFields] })
  messages: ChatMessageFields[];

  @ApiProperty({ nullable: true })
  nextCursor: string | null;

  static fromEntities(
    messages: ChatMessage[],
    nextCursor: string | null,
  ): ChatMessagesResponseDto {
    const dto = new ChatMessagesResponseDto();
    dto.messages = messages.map((message) =>
      ChatMessageFields.fromEntity(message),
    );
    dto.nextCursor = nextCursor;
    return dto;
  }
}
