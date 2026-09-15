import { ApiProperty } from '@nestjs/swagger';
import { UserRole } from '../../../common/enums/user-role.enum';
import { User } from '../entities/user.entity';
import { UserStatus } from '../enums/user-status.enum';

/** Shape dùng cho từng dòng của `GET /admin/users` — không có password/token/emailVerifiedAt. */
export class AdminUserSummaryFields {
  @ApiProperty()
  id: string;

  @ApiProperty()
  username: string;

  @ApiProperty()
  email: string;

  @ApiProperty({ enum: UserRole })
  role: UserRole;

  @ApiProperty({ enum: UserStatus })
  status: UserStatus;

  @ApiProperty()
  createdAt: string;

  static fromEntity(user: User): AdminUserSummaryFields {
    const fields = new AdminUserSummaryFields();
    fields.id = user.id;
    fields.username = user.username;
    fields.email = user.email;
    fields.role = user.role;
    fields.status = user.status;
    fields.createdAt = user.createdAt.toISOString();
    return fields;
  }
}

/** `GET /admin/users` — api-contract.md `UsersResponse`. */
export class AdminUsersResponseDto {
  @ApiProperty({ type: [AdminUserSummaryFields] })
  users: AdminUserSummaryFields[];

  @ApiProperty()
  usersCount: number;

  static fromEntities(
    users: User[],
    usersCount: number,
  ): AdminUsersResponseDto {
    const dto = new AdminUsersResponseDto();
    dto.users = users.map((user) => AdminUserSummaryFields.fromEntity(user));
    dto.usersCount = usersCount;
    return dto;
  }
}

/**
 * `GET /admin/users/:id` và `PATCH /admin/users/:id/status` — api-contract.md `AdminUserResponse`:
 * summary + `emailVerifiedAt`/`orderCount`. `orderCount` tính bằng count query riêng, không load
 * toàn bộ orders (api-requirements.csv ADMIN-USER-02).
 */
export class AdminUserDetailFields {
  @ApiProperty()
  id: string;

  @ApiProperty()
  username: string;

  @ApiProperty()
  email: string;

  @ApiProperty({ enum: UserRole })
  role: UserRole;

  @ApiProperty({ enum: UserStatus })
  status: UserStatus;

  @ApiProperty()
  createdAt: string;

  @ApiProperty({ type: String, nullable: true })
  emailVerifiedAt: string | null;

  @ApiProperty()
  orderCount: number;

  static fromEntity(user: User, orderCount: number): AdminUserDetailFields {
    const fields = new AdminUserDetailFields();
    fields.id = user.id;
    fields.username = user.username;
    fields.email = user.email;
    fields.role = user.role;
    fields.status = user.status;
    fields.createdAt = user.createdAt.toISOString();
    fields.emailVerifiedAt = user.emailVerifiedAt
      ? user.emailVerifiedAt.toISOString()
      : null;
    fields.orderCount = orderCount;
    return fields;
  }
}

export class AdminUserResponseDto {
  @ApiProperty({ type: AdminUserDetailFields })
  user: AdminUserDetailFields;

  static fromEntity(user: User, orderCount: number): AdminUserResponseDto {
    const dto = new AdminUserResponseDto();
    dto.user = AdminUserDetailFields.fromEntity(user, orderCount);
    return dto;
  }
}
