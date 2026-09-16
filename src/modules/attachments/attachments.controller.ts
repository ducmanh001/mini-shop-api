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
import { ATTACHMENT_ROUTE_PATH } from './constants/attachments.constants';

/** FILE-01 (PR09) — ảnh sản phẩm công khai, chỉ khi còn là ảnh hiện tại của product visible. */
@ApiTags('attachments')
@Controller(ATTACHMENT_ROUTE_PATH)
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
    return this.attachmentsService.getVisibleAttachmentFile(id);
  }
}
