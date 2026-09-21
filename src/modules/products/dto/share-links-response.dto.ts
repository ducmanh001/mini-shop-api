import { ApiProperty } from '@nestjs/swagger';

/** `ShareLinksResponse` — api-requirements.csv dòng 45. */
export class ShareLinksResponseDto {
  @ApiProperty()
  canonicalUrl: string;

  @ApiProperty()
  facebookUrl: string;

  @ApiProperty()
  xUrl: string;
}
