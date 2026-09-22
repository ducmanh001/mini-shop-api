import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional, IsUUID } from 'class-validator';
import { i18nValidationMessage } from 'nestjs-i18n';
import { PaginationQueryDto } from '../../../common/dto/pagination-query.dto';
import { ChatConversationStatus } from '../enums/chat-conversation-status.enum';

/** `GET /admin/chat/conversations` (CHAT-05) — offset (không phải cursor, chỉ CHAT-03 dùng cursor). */
export class AdminListConversationsQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ enum: ChatConversationStatus })
  @IsOptional()
  @IsEnum(ChatConversationStatus, {
    message: i18nValidationMessage('validation.IS_ENUM'),
  })
  status?: ChatConversationStatus;

  @ApiPropertyOptional({ description: 'Filter by assigned admin' })
  @IsOptional()
  @IsUUID(undefined, { message: i18nValidationMessage('validation.IS_UUID') })
  assignedAdminId?: string;
}
