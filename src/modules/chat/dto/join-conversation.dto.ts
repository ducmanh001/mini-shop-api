import { IsUUID } from 'class-validator';
import { i18nValidationMessage } from 'nestjs-i18n';

/** Payload event `conversation.join` (CHAT-07) — global `ValidationPipe` áp dụng cả cho `@MessageBody()`. */
export class JoinConversationDto {
  @IsUUID(undefined, { message: i18nValidationMessage('validation.IS_UUID') })
  conversationId: string;
}
