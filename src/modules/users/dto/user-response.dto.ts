import { ApiProperty } from '@nestjs/swagger';
import { UserRole } from '../../../common/enums/user-role.enum';
import { User } from '../entities/user.entity';
import { UserStatus } from '../enums/user-status.enum';

export class UserResponseFields {
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

  @ApiProperty({ type: String, nullable: true })
  emailVerifiedAt: string | null;

  @ApiProperty({ required: false })
  token?: string;

  static fromEntity(user: User, token?: string): UserResponseFields {
    const fields = new UserResponseFields();
    fields.id = user.id;
    fields.username = user.username;
    fields.email = user.email;
    fields.role = user.role;
    fields.status = user.status;
    fields.emailVerifiedAt = user.emailVerifiedAt
      ? user.emailVerifiedAt.toISOString()
      : null;
    if (token) {
      fields.token = token;
    }
    return fields;
  }
}

/** Dùng cho đăng ký, login (kèm `token`) và GET/PATCH me ở PR07 (không kèm `token`). */
export class UserResponseDto {
  @ApiProperty({ type: UserResponseFields })
  user: UserResponseFields;

  static fromEntity(user: User, token?: string): UserResponseDto {
    const dto = new UserResponseDto();
    dto.user = UserResponseFields.fromEntity(user, token);
    return dto;
  }
}
