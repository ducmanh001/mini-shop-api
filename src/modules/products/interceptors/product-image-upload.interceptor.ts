import {
  NestInterceptor,
  Type,
  UnsupportedMediaTypeException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import {
  ALLOWED_ATTACHMENT_MIME_TYPES,
  MAX_ATTACHMENT_SIZE_BYTES,
} from '../../attachments/constants/attachments.constants';
import { AttachmentMimeType } from '../../attachments/interfaces/attachment-mime-type.type';

/**
 * `fileFilter` chặn nhanh theo `file.mimetype` khai báo (CODING_STANDARD.md mục 5, 8) — kiểm chữ
 * ký byte thật khớp MIME khai báo là việc của `AttachmentsService.validateImageFile()` sau khi
 * Multer đã buffer xong file, không thể làm ở đây.
 */
export function createProductImageUploadInterceptor(): Type<NestInterceptor> {
  return FileInterceptor('file', {
    storage: memoryStorage(),
    limits: { fileSize: MAX_ATTACHMENT_SIZE_BYTES },
    fileFilter: (_req, file, callback) => {
      if (
        !ALLOWED_ATTACHMENT_MIME_TYPES.includes(
          file.mimetype as AttachmentMimeType,
        )
      ) {
        callback(
          new UnsupportedMediaTypeException(
            `Image must be one of: ${ALLOWED_ATTACHMENT_MIME_TYPES.join(', ')}`,
          ),
          false,
        );
        return;
      }
      callback(null, true);
    },
  });
}
