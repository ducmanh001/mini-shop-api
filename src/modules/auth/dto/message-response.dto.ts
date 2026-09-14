import { ApiProperty } from '@nestjs/swagger';

/** Envelope chung cho response chỉ có 1 câu thông báo — hiện dùng cho `forgot-password` (202). */
export class MessageResponseDto {
  @ApiProperty()
  message: string;

  static create(message: string): MessageResponseDto {
    const dto = new MessageResponseDto();
    dto.message = message;
    return dto;
  }
}
