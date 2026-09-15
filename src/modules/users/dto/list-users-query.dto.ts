import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';
import { i18nValidationMessage } from 'nestjs-i18n';
import { PaginationQueryDto } from '../../../common/dto/pagination-query.dto';
import { UserRole } from '../../../common/enums/user-role.enum';
import { USER_SEARCH_KEYWORD_MAX_LENGTH } from '../constants/users.constants';
import { UserStatus } from '../enums/user-status.enum';

/** `GET /admin/users` — api-contract.md: "nhận q tìm username/email, role, status, limit, offset". */
export class ListUsersQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ description: 'Search keyword for username/email' })
  @IsOptional()
  @Transform(({ value }: { value: unknown }) => {
    if (typeof value !== 'string') {
      return value;
    }
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : undefined;
  })
  @IsString({ message: i18nValidationMessage('validation.IS_STRING') })
  @MaxLength(USER_SEARCH_KEYWORD_MAX_LENGTH, {
    message: i18nValidationMessage('validation.MAX_LENGTH_SEARCH_KEYWORD'),
  })
  q?: string;

  @ApiPropertyOptional({ enum: UserRole })
  @IsOptional()
  @IsEnum(UserRole, { message: i18nValidationMessage('validation.IS_ENUM') })
  role?: UserRole;

  @ApiPropertyOptional({ enum: UserStatus })
  @IsOptional()
  @IsEnum(UserStatus, { message: i18nValidationMessage('validation.IS_ENUM') })
  status?: UserStatus;
}
