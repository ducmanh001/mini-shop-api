import { ApiProperty } from '@nestjs/swagger';
import { IsNormalizedEmail } from '../../users/decorators/is-normalized-email.decorator';

export class ForgotPasswordDto {
  @ApiProperty()
  @IsNormalizedEmail()
  email: string;
}
