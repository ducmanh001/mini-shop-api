import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { ValidateIf } from 'class-validator';
import { normalizeIdentifier } from '../../../common/utils/normalize-identifier.util';
import { IsUsername } from '../decorators/is-username.decorator';

/**
 * MVP chỉ cho sửa `username` — đổi email cần một vòng verify riêng, ngoài phạm vi PR07
 * (api-contract.md, `UpdateProfileRequest`). `@ValidateIf` (không phải `@IsOptional`) để `null`
 * vẫn bị validate và từ chối — `@IsOptional` coi `null` giống hệt "không gửi field".
 */
export class UpdateProfileDto {
  @ApiPropertyOptional()
  @ValidateIf((dto: UpdateProfileDto) => dto.username !== undefined)
  @Transform(({ value }: { value: unknown }) => normalizeIdentifier(value))
  @IsUsername()
  username?: string;
}
