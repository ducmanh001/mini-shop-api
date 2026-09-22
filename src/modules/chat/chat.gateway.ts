import { ConflictException, Injectable, Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  OnGatewayDisconnect,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { Server } from 'socket.io';
import type { AuthenticatedUser } from '../../common/auth/authenticated-user.interface';
import { JwtPayload } from '../auth/interfaces/jwt-payload.interface';
import { JwtStrategy } from '../auth/strategies/jwt.strategy';
import { ChatAccessService } from './chat-access.service';
import { CHAT_WS_NAMESPACE } from './constants/chat.constants';
import { ChatMessageResponseDto } from './dto/chat-message-response.dto';
import { JoinConversationDto } from './dto/join-conversation.dto';
import { ChatSocketEvent } from './enums/chat-socket-event.enum';
import type { AuthenticatedSocket } from './interfaces/authenticated-socket.interface';
import type { ChatJoinAck } from './interfaces/chat-join-ack.interface';
import { conversationRoom } from './utils/chat-room.util';

/**
 * CHAT-07 — nhận realtime only, KHÔNG có event gửi message (gửi luôn qua REST CHAT-04, xem
 * api-contract.md mục "Support chat": "Luồng gửi là validate → insert/commit DB → publish"). Nhờ
 * vậy gateway không cần gọi `ChatService` — chỉ `ChatAccessService` (đọc, không ghi) — nên không có
 * phụ thuộc vòng `ChatService ↔ ChatGateway` (`ChatService` gọi `ChatGateway.broadcastMessageCreated`
 * sau khi transaction gửi message commit).
 */
@WebSocketGateway({ namespace: CHAT_WS_NAMESPACE, cors: { origin: '*' } })
@Injectable()
export class ChatGateway implements OnGatewayConnection, OnGatewayDisconnect {
  private readonly logger = new Logger(ChatGateway.name);

  @WebSocketServer()
  private readonly server: Server;

  constructor(
    private readonly jwtService: JwtService,
    private readonly jwtStrategy: JwtStrategy,
    private readonly chatAccessService: ChatAccessService,
  ) {}

  /**
   * KHÔNG `async` — dòng đồng bộ đầu tiên phải gán `authPromise` trước khi trả về, vì
   * `@nestjs/websockets` KHÔNG đợi `handleConnection` xong trước khi bind `@SubscribeMessage` cho
   * cùng socket (đã trace `web-sockets-controller.js`'s `getConnectionHandler()`). Nếu client gửi
   * `conversation.join` ngay sau khi connect, handler đó vẫn phải có `authPromise` để `await`, dù
   * việc verify JWT (2 hop bất đồng bộ: verify chữ ký rồi check blacklist/active/tokenVersion) chưa
   * xong.
   */
  handleConnection(client: AuthenticatedSocket): void {
    const authPromise = this.authenticateSocket(client)
      .then((user) => {
        client.data.user = user;
        return user;
      })
      .catch((error: unknown) => {
        this.logger.warn(
          `Rejected WebSocket handshake for socket ${client.id}: ${(error as Error).message}`,
        );
        client.disconnect(true);
        throw error;
      });
    client.data.authPromise = authPromise;
    // Một Promise có thể có nhiều .catch() độc lập: nhánh này chỉ để chặn "unhandled rejection"
    // khi không handler nào (vd handleJoin) từng await authPromise (token sai ngay từ handshake,
    // client không emit gì thêm) — authPromise gốc vẫn reject bình thường cho handleJoin await sau.
    authPromise.catch(() => undefined);
  }

  handleDisconnect(client: AuthenticatedSocket): void {
    this.logger.debug(`Socket disconnected: ${client.id}`);
  }

  @SubscribeMessage(ChatSocketEvent.ConversationJoin)
  async handleJoin(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() dto: JoinConversationDto,
  ): Promise<ChatJoinAck> {
    const authPromise = client.data.authPromise;
    if (!authPromise) {
      return { ok: false, code: 'UNAUTHORIZED' };
    }
    let user: AuthenticatedUser;
    try {
      user = await authPromise;
    } catch {
      return { ok: false, code: 'UNAUTHORIZED' };
    }

    try {
      await this.chatAccessService.assertCanJoinConversation(
        dto.conversationId,
        user,
      );
    } catch (error) {
      if (error instanceof ConflictException) {
        return { ok: false, code: 'CONVERSATION_CLOSED' };
      }
      return { ok: false, code: 'NOT_FOUND' };
    }

    await client.join(conversationRoom(dto.conversationId));
    return { ok: true };
  }

  /**
   * Gọi bởi `ChatService.sendMessage()` sau khi transaction đã commit — không tự query/xử lý
   * nghiệp vụ. Trả `void` (không `async`) vì `Server.emit()` của Socket.IO chạy đồng bộ; khai
   * `Promise<void>` chỉ để `ChatService`'s `try/await/catch` dùng chung 1 kiểu bất kể sau này có
   * cần thao tác bất đồng bộ hay không.
   */
  broadcastMessageCreated(
    conversationId: string,
    message: ChatMessageResponseDto,
  ): Promise<void> {
    this.server
      .to(conversationRoom(conversationId))
      .emit(ChatSocketEvent.MessageCreated, message);
    return Promise.resolve();
  }

  private async authenticateSocket(
    client: AuthenticatedSocket,
  ): Promise<AuthenticatedUser> {
    const token = this.extractToken(client);
    const payload = await this.jwtService.verifyAsync<JwtPayload>(token);
    return this.jwtStrategy.validate(payload);
  }

  private extractToken(client: AuthenticatedSocket): string {
    const authToken = client.handshake.auth?.token as string | undefined;
    if (authToken) {
      return authToken;
    }
    const header = client.handshake.headers.authorization;
    if (header?.startsWith('Bearer ')) {
      return header.slice('Bearer '.length);
    }
    throw new Error('Missing token');
  }
}
