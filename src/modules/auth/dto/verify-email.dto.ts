import { ApiProperty } from '@nestjs/swagger';
import { IsAuthToken } from '../decorators/is-auth-token.decorator';

export class VerifyEmailDto {
  @ApiProperty()
  @IsAuthToken()
  token: string;
}
