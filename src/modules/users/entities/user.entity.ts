import { Exclude } from 'class-transformer';
import {
  Check,
  Column,
  CreateDateColumn,
  Entity,
  Index,
  Unique,
  UpdateDateColumn,
} from 'typeorm';
import { UuidBaseEntity } from '../../../common/entities/uuid-base.entity';
import { UserRole } from '../../../common/enums/user-role.enum';
import { enumCheck } from '../../../common/utils/enum-check.util';
import { UserStatus } from '../enums/user-status.enum';

/**
 * Danh tính và quyền. Registration luôn tạo CUSTOMER/PENDING; verify email chuyển PENDING → ACTIVE.
 * Admin chỉ đổi ACTIVE ↔ INACTIVE, không đổi role và không tự deactivate (rule ở service, không ở DB).
 * Xem docs/planning/database.md mục 4 — "users".
 */
@Entity({ name: 'users' })
@Unique('uq_users_email', ['email'])
@Unique('uq_users_username', ['username'])
@Index('idx_users_status_created_id', ['status', 'createdAt', 'id'])
// `status` là filter tùy chọn ở GET /admin/users — ORDER BY chạy cả khi không lọc status nên cần
// index riêng (CODING_STANDARD.md mục 18.1), cùng cặp filtered/unfiltered như orders/products/categories.
@Index('idx_users_created_id', ['createdAt', 'id'])
@Check('ck_users_email_normalized', `email = lower(btrim(email))`)
@Check('ck_users_username_normalized', `username = lower(btrim(username))`)
@Check('ck_users_token_version_nonnegative', `token_version >= 0`)
@Check('ck_users_role', enumCheck('role', Object.values(UserRole)))
@Check('ck_users_status', enumCheck('status', Object.values(UserStatus)))
export class User extends UuidBaseEntity {
  @Column({ type: 'varchar', length: 254 })
  email: string;

  @Column({ type: 'varchar', length: 30 })
  username: string;

  /**
   * Phòng thủ theo chiều sâu: response luôn phải qua UserResponseDto.fromEntity() (mục 9), không
   * bao giờ trả entity thô — nhưng nếu lỡ quên, `@Exclude()` + `ClassSerializerInterceptor` (đã
   * bật global ở configure-app.ts) vẫn chặn được bcrypt hash lọt ra ngoài.
   */
  @Exclude()
  @Column({ name: 'password_hash', type: 'varchar', length: 255 })
  passwordHash: string;

  @Column({ type: 'varchar', length: 16, default: UserRole.CUSTOMER })
  role: UserRole;

  @Column({ type: 'varchar', length: 24, default: UserStatus.PENDING })
  status: UserStatus;

  @Column({ name: 'email_verified_at', type: 'timestamptz', nullable: true })
  emailVerifiedAt: Date | null;

  @Column({ name: 'token_version', type: 'int', default: 0 })
  tokenVersion: number;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
