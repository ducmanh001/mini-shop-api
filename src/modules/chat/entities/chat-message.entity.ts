import {
  Check,
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  Unique,
} from 'typeorm';
import { UuidBaseEntity } from '../../../common/entities/uuid-base.entity';
import { sha256HexCheck } from '../../../common/utils/sha256-hex-check.util';
import { User } from '../../users/entities/user.entity';
import { MAX_CHAT_MESSAGE_BODY_LENGTH } from '../constants/chat.constants';
import { ChatConversation } from './chat-conversation.entity';

/**
 * Lịch sử chat bền — nguồn sự thật cho reconnect, WebSocket không thay DB (mục 4 database.md —
 * "chat_messages"). Insert message và update last_message_at của conversation cùng transaction.
 */
@Entity({ name: 'chat_messages' })
@Unique('uq_chat_messages_sender_idempotency_key', [
  'senderId',
  'idempotencyKey',
])
@Index('idx_chat_messages_conversation_created_id', [
  'conversationId',
  'createdAt',
  'id',
])
@Check(
  'ck_chat_messages_body_length',
  `char_length(body) BETWEEN 1 AND ${MAX_CHAT_MESSAGE_BODY_LENGTH}`,
)
@Check('ck_chat_messages_request_hash_format', sha256HexCheck('request_hash'))
export class ChatMessage extends UuidBaseEntity {
  @Column({ name: 'conversation_id', type: 'uuid' })
  conversationId: string;

  @ManyToOne(() => ChatConversation, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'conversation_id' })
  conversation: ChatConversation;

  @Column({ name: 'sender_id', type: 'uuid' })
  senderId: string;

  @ManyToOne(() => User, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'sender_id' })
  sender: User;

  @Column({ name: 'idempotency_key', type: 'uuid' })
  idempotencyKey: string;

  @Column({ name: 'request_hash', type: 'char', length: 64 })
  requestHash: string;

  @Column({ type: 'varchar', length: MAX_CHAT_MESSAGE_BODY_LENGTH })
  body: string;

  @Column({ name: 'read_at', type: 'timestamptz', nullable: true })
  readAt: Date | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}
