import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Res,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiHeader,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import type { Response } from 'express';
import type { AuthenticatedUser } from '../../common/auth/authenticated-user.interface';
import { JwtAuthGuard } from '../../common/auth/jwt-auth.guard';
import { RolesGuard } from '../../common/auth/roles.guard';
import { IDEMPOTENCY_KEY_HEADER } from '../../common/constants/idempotency.constants';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { IdempotencyKey } from '../../common/decorators/idempotency-key.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { UserRole } from '../../common/enums/user-role.enum';
import { ChatService } from './chat.service';
import { ChatMessageResponseDto } from './dto/chat-message-response.dto';
import { ChatMessagesResponseDto } from './dto/chat-messages-response.dto';
import { ConversationResponseDto } from './dto/conversation-response.dto';
import { ListMessagesQueryDto } from './dto/list-messages-query.dto';
import { SendMessageDto } from './dto/send-message.dto';

/** CHAT-01..04 (PR15) — support chat của chính customer, hoặc đọc/gửi bởi ADMIN (api-contract.md mục "Support chat"). */
@ApiTags('chat')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('chat/conversations')
export class ChatController {
  constructor(private readonly chatService: ChatService) {}

  /** CHAT-01 — get-or-create conversation OPEN của chính customer; gọi lặp trả cùng conversation. */
  @Post()
  @Roles(UserRole.CUSTOMER)
  @ApiOperation({
    summary: 'Open or return the current customer’s OPEN conversation',
  })
  @ApiResponse({ status: HttpStatus.CREATED, type: ConversationResponseDto })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'An OPEN conversation already exists — returned as-is',
    type: ConversationResponseDto,
  })
  async openConversation(
    @CurrentUser() currentUser: AuthenticatedUser,
    @Res({ passthrough: true }) res: Response,
  ): Promise<ConversationResponseDto> {
    const { conversation, statusCode } =
      await this.chatService.getOrCreateOpenConversation(currentUser.id);
    res.status(statusCode);
    return conversation;
  }

  /** CHAT-02 — chỉ conversation OPEN của chính customer. */
  @Get('me')
  @Roles(UserRole.CUSTOMER)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Get the current customer’s OPEN conversation' })
  @ApiResponse({ status: HttpStatus.OK, type: ConversationResponseDto })
  @ApiResponse({
    status: HttpStatus.NOT_FOUND,
    description: 'No OPEN conversation yet',
  })
  async getMyConversation(
    @CurrentUser() currentUser: AuthenticatedUser,
  ): Promise<ConversationResponseDto> {
    return this.chatService.getMyOpenConversation(currentUser.id);
  }

  /** CHAT-03 — cursor, customer chỉ đọc conversation của mình, ADMIN đọc bất kỳ conversation nào. */
  @Get(':id/messages')
  @Roles(UserRole.CUSTOMER, UserRole.ADMIN)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'List messages in a conversation (cursor pagination)',
  })
  @ApiResponse({ status: HttpStatus.OK, type: ChatMessagesResponseDto })
  @ApiResponse({
    status: HttpStatus.NOT_FOUND,
    description: 'Conversation not found, or not owned by the current customer',
  })
  async listMessages(
    @CurrentUser() currentUser: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) conversationId: string,
    @Query() query: ListMessagesQueryDto,
  ): Promise<ChatMessagesResponseDto> {
    return this.chatService.listMessages(conversationId, currentUser, query);
  }

  /** CHAT-04 — customer chủ conversation hoặc ADMIN; Idempotency-Key bắt buộc, CLOSED thì 409. */
  @Post(':id/messages')
  @Roles(UserRole.CUSTOMER, UserRole.ADMIN)
  @ApiOperation({ summary: 'Send a message in a conversation' })
  @ApiHeader({
    name: IDEMPOTENCY_KEY_HEADER,
    description:
      'Client-generated UUID; replaying the same key+body returns the same message',
    required: true,
  })
  @ApiResponse({ status: HttpStatus.CREATED, type: ChatMessageResponseDto })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Same Idempotency-Key + body replayed: same message returned',
    type: ChatMessageResponseDto,
  })
  @ApiResponse({
    status: HttpStatus.NOT_FOUND,
    description: 'Conversation not found, or not owned by the current customer',
  })
  @ApiResponse({
    status: HttpStatus.CONFLICT,
    description: 'Conversation is CLOSED, or same key with a different body',
  })
  async sendMessage(
    @CurrentUser() currentUser: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) conversationId: string,
    @Body() dto: SendMessageDto,
    @IdempotencyKey(new ParseUUIDPipe()) idempotencyKey: string,
    @Res({ passthrough: true }) res: Response,
  ): Promise<ChatMessageResponseDto> {
    const { message, statusCode } = await this.chatService.sendMessage(
      conversationId,
      currentUser,
      dto,
      idempotencyKey,
    );
    res.status(statusCode);
    return message;
  }
}
