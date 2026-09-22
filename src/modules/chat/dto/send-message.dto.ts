import { ApiProperty } from '@nestjs/swagger';
import { IsNonBlankString } from '../../../common/decorators/is-non-blank-string.decorator';
import { MAX_CHAT_MESSAGE_BODY_LENGTH } from '../constants/chat.constants';

/** `POST /chat/conversations/:id/messages` (CHAT-04) — trim thực hiện ở service trước khi hash/lưu. */
export class SendMessageDto {
  @ApiProperty({ maxLength: MAX_CHAT_MESSAGE_BODY_LENGTH })
  @IsNonBlankString(MAX_CHAT_MESSAGE_BODY_LENGTH, {
    minLength: 'validation.MIN_LENGTH_BODY',
    maxLength: 'validation.MAX_LENGTH_BODY',
  })
  body: string;
}
