import {
  Controller,
  Get,
  Header,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  StreamableFile,
} from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { AttachmentsService } from './attachments.service';

/** FILE-01 (PR09) — ảnh sản phẩm công khai, chỉ khi còn là ảnh hiện tại của product visible. */
@ApiTags('attachments')
@Controller('attachments')
export class AttachmentsController {
  constructor(private readonly attachmentsService: AttachmentsService) {}

  @Get(':id')
  @Header('Cache-Control', 'no-store')
  @ApiOperation({ summary: 'Stream a product image (public)' })
  @ApiResponse({ status: HttpStatus.BAD_REQUEST, description: 'Invalid id' })
  @ApiResponse({
    status: HttpStatus.NOT_FOUND,
    description: 'Not the current image of a currently visible product',
  })
  async getAttachment(
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<StreamableFile> {
    const { stream, mimeType } =
      await this.attachmentsService.getVisibleAttachmentStream(id);
    return new StreamableFile(stream, { type: mimeType });
  }
}
