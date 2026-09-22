import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional, IsUUID } from 'class-validator';
import { i18nValidationMessage } from 'nestjs-i18n';
import { ChatConversationStatus } from '../enums/chat-conversation-status.enum';

/**
 * `PATCH /admin/chat/conversations/:id` (CHAT-06) — assign/close/open, ít nhất 1 field (service tự
 * kiểm, giống `UsersService.updateProfile`). Không hỗ trợ unassign (set null) — ngoài phạm vi yêu
 * cầu hiện tại (chỉ "assign/close/open").
 */
export class UpdateChatConversationDto {
  @ApiPropertyOptional({
    description: 'Admin user ID to assign this conversation to',
  })
  @IsOptional()
  @IsUUID(undefined, { message: i18nValidationMessage('validation.IS_UUID') })
  assignedAdminId?: string;

  @ApiPropertyOptional({ enum: ChatConversationStatus })
  @IsOptional()
  @IsEnum(ChatConversationStatus, {
    message: i18nValidationMessage('validation.IS_ENUM'),
  })
  status?: ChatConversationStatus;
}
