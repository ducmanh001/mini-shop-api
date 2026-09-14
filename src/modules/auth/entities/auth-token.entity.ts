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
import { enumCheck } from '../../../common/utils/enum-check.util';
import { sha256HexCheck } from '../../../common/utils/sha256-hex-check.util';
import { User } from '../../users/entities/user.entity';
import { AuthTokenType } from '../enums/auth-token-type.enum';

/**
 * Token kích hoạt/reset dùng một lần. Chỉ lưu SHA-256 hash, không lưu raw token.
 * Xem docs/planning/database.md mục 4 — "auth_tokens".
 */
@Entity({ name: 'auth_tokens' })
@Unique('uq_auth_tokens_token_hash', ['tokenHash'])
@Index('idx_auth_tokens_user_type_created', ['userId', 'type', 'createdAt'])
@Check('ck_auth_tokens_expires_after_created', `expires_at > created_at`)
@Check('ck_auth_tokens_type', enumCheck('type', Object.values(AuthTokenType)))
@Check('ck_auth_tokens_token_hash_format', sha256HexCheck('token_hash'))
export class AuthToken extends UuidBaseEntity {
  @Column({ name: 'user_id', type: 'uuid' })
  userId: string;

  @ManyToOne(() => User, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'user_id' })
  user: User;

  @Column({ type: 'varchar', length: 24 })
  type: AuthTokenType;

  @Column({ name: 'token_hash', type: 'char', length: 64 })
  tokenHash: string;

  @Column({ name: 'expires_at', type: 'timestamptz' })
  expiresAt: Date;

  @Column({ name: 'used_at', type: 'timestamptz', nullable: true })
  usedAt: Date | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}
