import { Check, Column, CreateDateColumn, Entity, Unique } from 'typeorm';
import { UuidBaseEntity } from '../../../common/entities/uuid-base.entity';
import { enumCheck } from '../../../common/utils/enum-check.util';
import {
  ALLOWED_ATTACHMENT_MIME_TYPES,
  MAX_ATTACHMENT_SIZE_BYTES,
} from '../constants/attachments.constants';
import type { AttachmentMimeType } from '../interfaces/attachment-mime-type.type';

/**
 * Metadata file — nội dung file thật nằm ở storage, không phải DB. Chỉ admin upload ảnh gắn với
 * sản phẩm (mục 4 của database.md — "attachments").
 */
@Entity({ name: 'attachments' })
@Unique('uq_attachments_storage_key', ['storageKey'])
@Check(
  'ck_attachments_mime_type',
  enumCheck('mime_type', ALLOWED_ATTACHMENT_MIME_TYPES),
)
@Check(
  'ck_attachments_size_bytes',
  `size_bytes > 0 AND size_bytes <= ${MAX_ATTACHMENT_SIZE_BYTES}`,
)
export class Attachment extends UuidBaseEntity {
  @Column({ name: 'storage_key', type: 'varchar', length: 255 })
  storageKey: string;

  @Column({ name: 'mime_type', type: 'varchar', length: 100 })
  mimeType: AttachmentMimeType;

  @Column({ name: 'size_bytes', type: 'int' })
  sizeBytes: number;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}
