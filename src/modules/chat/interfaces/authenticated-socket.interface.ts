import type { DefaultEventsMap, Socket } from 'socket.io';
import type { AuthenticatedUser } from '../../../common/auth/authenticated-user.interface';

/**
 * `authPromise` được gán đồng bộ ngay dòng đầu `ChatGateway.handleConnection()` (trước bất kỳ
 * `await` nào) để mọi `@SubscribeMessage` handler của cùng socket luôn có promise để `await`, kể cả
 * khi client gửi message ngay sau khi connect — `@nestjs/websockets` KHÔNG đợi `handleConnection`
 * xong trước khi bind message handler cho socket đó.
 */
export interface ChatSocketData {
  user?: AuthenticatedUser;
  authPromise?: Promise<AuthenticatedUser>;
}

export type AuthenticatedSocket = Socket<
  DefaultEventsMap,
  DefaultEventsMap,
  DefaultEventsMap,
  ChatSocketData
>;
