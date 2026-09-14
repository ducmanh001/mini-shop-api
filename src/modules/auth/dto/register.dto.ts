import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { normalizeIdentifier } from '../../../common/utils/normalize-identifier.util';
import { IsNormalizedEmail } from '../../users/decorators/is-normalized-email.decorator';
import { IsPassword } from '../../users/decorators/is-password.decorator';
import { IsUsername } from '../../users/decorators/is-username.decorator';

export class RegisterDto {
  @ApiProperty()
  @IsNormalizedEmail()
  email: string;

  @ApiProperty()
  @Transform(({ value }: { value: unknown }) => normalizeIdentifier(value))
  @IsUsername()
  username: string;

  @ApiProperty()
  @IsPassword()
  password: string;
}
