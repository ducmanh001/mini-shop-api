import { ApiProperty } from '@nestjs/swagger';
import { ChatMessageFields } from './chat-messages-response.dto';
import { ChatMessage } from '../entities/chat-message.entity';

/** `ChatMessageResponse` — trả về từ `POST /chat/conversations/:id/messages` (CHAT-04), tạo mới hoặc replay. */
export class ChatMessageResponseDto {
  @ApiProperty({ type: ChatMessageFields })
  message: ChatMessageFields;

  static fromEntity(
    message: Pick<
      ChatMessage,
      'id' | 'conversationId' | 'senderId' | 'body' | 'readAt' | 'createdAt'
    >,
  ): ChatMessageResponseDto {
    const dto = new ChatMessageResponseDto();
    dto.message = ChatMessageFields.fromEntity(message);
    return dto;
  }
}
