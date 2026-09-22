import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, Max, Min } from 'class-validator';
import { i18nValidationMessage } from 'nestjs-i18n';
import {
  DEFAULT_CHAT_MESSAGE_LIMIT,
  MAX_CHAT_MESSAGE_LIMIT,
  MIN_CHAT_MESSAGE_LIMIT,
} from '../constants/chat.constants';

/** `GET /chat/conversations/:id/messages` (CHAT-03) — cursor cơ hội, không phải offset (api-contract.md). */
export class ListMessagesQueryDto {
  @ApiPropertyOptional({
    description: 'Opaque cursor from a previous page’s nextCursor',
  })
  @IsOptional()
  @IsString({ message: i18nValidationMessage('validation.IS_STRING') })
  cursor?: string;

  @ApiPropertyOptional({ default: DEFAULT_CHAT_MESSAGE_LIMIT })
  @Type(() => Number)
  @IsInt({ message: i18nValidationMessage('validation.IS_INT') })
  @Min(MIN_CHAT_MESSAGE_LIMIT, {
    message: i18nValidationMessage('validation.MIN_LIMIT'),
  })
  @Max(MAX_CHAT_MESSAGE_LIMIT, {
    message: i18nValidationMessage('validation.MAX_LIMIT'),
  })
  limit: number = DEFAULT_CHAT_MESSAGE_LIMIT;
}
