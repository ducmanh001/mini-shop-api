import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../../common/auth/jwt-auth.guard';
import { RolesGuard } from '../../common/auth/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { UserRole } from '../../common/enums/user-role.enum';
import { AdminListConversationsQueryDto } from './dto/admin-list-conversations-query.dto';
import { ConversationResponseDto } from './dto/conversation-response.dto';
import { ChatConversationsResponseDto } from './dto/conversations-response.dto';
import { UpdateChatConversationDto } from './dto/update-conversation.dto';
import { ChatService } from './chat.service';

/** CHAT-05/06 (PR15) — support inbox của ADMIN (api-contract.md mục "Support chat"). */
@ApiTags('admin-chat')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
@Controller('admin/chat/conversations')
export class AdminChatController {
  constructor(private readonly chatService: ChatService) {}

  /** CHAT-05 — sort `lastMessageAt DESC, id DESC`, `unreadCount` không N+1. */
  @Get()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'List support conversations' })
  @ApiResponse({ status: HttpStatus.OK, type: ChatConversationsResponseDto })
  async list(
    @Query() query: AdminListConversationsQueryDto,
  ): Promise<ChatConversationsResponseDto> {
    return this.chatService.listForAdmin(query);
  }

  /** CHAT-06 — assign (phải là ADMIN đang ACTIVE) và/hoặc đổi status (OPEN↔CLOSED), row khoá trước khi update. */
  @Patch(':id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Assign an admin and/or change a conversation’s status',
  })
  @ApiResponse({ status: HttpStatus.OK, type: ConversationResponseDto })
  @ApiResponse({
    status: HttpStatus.NOT_FOUND,
    description: 'Conversation not found, or assignedAdminId does not exist',
  })
  @ApiResponse({
    status: HttpStatus.CONFLICT,
    description:
      'Invalid status transition, or reopening would create a second OPEN conversation for the customer',
  })
  async update(
    @Param('id', ParseUUIDPipe) conversationId: string,
    @Body() dto: UpdateChatConversationDto,
  ): Promise<ConversationResponseDto> {
    return this.chatService.updateConversation(conversationId, dto);
  }
}
