import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from '../auth/auth.module';
import { UsersModule } from '../users/users.module';
import { AdminChatController } from './admin-chat.controller';
import { ChatAccessService } from './chat-access.service';
import { ChatController } from './chat.controller';
import { ChatGateway } from './chat.gateway';
import { ChatService } from './chat.service';
import { ChatConversation } from './entities/chat-conversation.entity';
import { ChatMessage } from './entities/chat-message.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([ChatConversation, ChatMessage]),
    UsersModule,
    // Chỉ để lấy JwtModule/JwtStrategy export riêng cho ChatGateway verify JWT thô ở WebSocket
    // handshake (CODING_STANDARD.md mục 10/24) — không dùng gì khác của auth.
    AuthModule,
  ],
  controllers: [ChatController, AdminChatController],
  providers: [ChatService, ChatAccessService, ChatGateway],
  exports: [TypeOrmModule],
})
export class ChatModule {}
