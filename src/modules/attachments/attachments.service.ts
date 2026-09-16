import {
  Injectable,
  Logger,
  NotFoundException,
  UnsupportedMediaTypeException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { randomUUID } from 'crypto';
import * as fs from 'fs';
import { I18nService } from 'nestjs-i18n';
import * as path from 'path';
import { EntityManager, Repository } from 'typeorm';
import { Product } from '../products/entities/product.entity';
import { detectImageMimeType } from './attachment-signature.util';
import {
  ALLOWED_ATTACHMENT_MIME_TYPES,
  ATTACHMENT_MIME_TYPE_EXTENSIONS,
} from './constants/attachments.constants';
import { Attachment } from './entities/attachment.entity';
import { AttachmentMimeType } from './interfaces/attachment-mime-type.type';

@Injectable()
export class AttachmentsService {
  private readonly logger = new Logger(AttachmentsService.name);
  private readonly uploadDir: string;

  constructor(
    /** Entity-level only cho `getVisibleAttachmentStream` — không import `ProductsModule`
     * (attachments là module lá, xem CODING_STANDARD.md mục 10, cùng pattern reviews→orders). */
    @InjectRepository(Product)
    private readonly productsRepository: Repository<Product>,
    config: ConfigService,
    private readonly i18n: I18nService,
  ) {
    this.uploadDir = path.resolve(
      process.cwd(),
      config.getOrThrow<string>('UPLOAD_DIR'),
    );
    fs.mkdirSync(this.uploadDir, { recursive: true });
  }

  /**
   * MIME client khai báo và chữ ký byte thật của file phải khớp nhau và nằm trong allow-list
   * (CODING_STANDARD.md mục 8 — chống stored-content-type spoofing, vd upload `.html` giả `.png`).
   */
  validateImageFile(file: Express.Multer.File): void {
    const declaredMimeType = file.mimetype as AttachmentMimeType;
    if (!ALLOWED_ATTACHMENT_MIME_TYPES.includes(declaredMimeType)) {
      throw new UnsupportedMediaTypeException(
        this.i18n.t('errors.invalidImageFile'),
      );
    }
    const detectedMimeType = detectImageMimeType(file.buffer);
    if (detectedMimeType === null || detectedMimeType !== declaredMimeType) {
      throw new UnsupportedMediaTypeException(
        this.i18n.t('errors.invalidImageFile'),
      );
    }
  }

  /**
   * Ghi file mới TRƯỚC khi mở transaction DB (CODING_STANDARD.md mục 6) — trả `storageKey` để
   * caller dùng khi insert `Attachment` row, và để dọn file mồ côi nếu transaction sau đó lỗi.
   */
  async writeImageFile(
    buffer: Buffer,
    mimeType: AttachmentMimeType,
  ): Promise<string> {
    const storageKey = `${randomUUID()}${ATTACHMENT_MIME_TYPE_EXTENSIONS[mimeType]}`;
    await fs.promises.writeFile(this.resolvePath(storageKey), buffer);
    return storageKey;
  }

  /**
   * Best-effort — filesystem không rollback được cùng DB transaction (mục 6, database.md
   * "attachments"). Không có cron sweep ở PR09 (ngoài phạm vi, api-contract.md dòng 472); lỗi ở
   * đây chỉ log, không throw, để không làm fail request đã commit DB thành công.
   */
  async deleteFileByStorageKey(storageKey: string): Promise<void> {
    try {
      await fs.promises.unlink(this.resolvePath(storageKey));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        return;
      }
      this.logger.warn(
        `Failed to delete attachment file ${storageKey}: ${(error as Error).message}`,
      );
    }
  }

  async createAttachmentRecord(
    data: Pick<Attachment, 'storageKey' | 'mimeType' | 'sizeBytes'>,
    manager: EntityManager,
  ): Promise<Attachment> {
    const repository = manager.getRepository(Attachment);
    const attachment = repository.create(data);
    await repository.save(attachment);
    return attachment;
  }

  async deleteAttachmentRecord(
    id: string,
    manager: EntityManager,
  ): Promise<void> {
    await manager.getRepository(Attachment).delete(id);
  }

  /**
   * FILE-01 — chỉ phục vụ ảnh đang là ảnh hiện tại của một product visible (`isActive` và category
   * `isActive`), không phục vụ file mồ côi/ảnh đã bị thay chỉ vì đoán đúng UUID (api-contract.md
   * dòng 432).
   */
  async getVisibleAttachmentStream(
    id: string,
  ): Promise<{ stream: fs.ReadStream; mimeType: AttachmentMimeType }> {
    const product = await this.productsRepository
      .createQueryBuilder('product')
      .innerJoin('product.category', 'category')
      .innerJoin('product.image', 'image')
      .select(['product.id', 'image.storageKey', 'image.mimeType'])
      .where('product.imageId = :id', { id })
      .andWhere('product.isActive = true')
      .andWhere('category.isActive = true')
      .getOne();

    if (!product?.image) {
      throw new NotFoundException(this.i18n.t('errors.attachmentNotFound'));
    }
    return {
      stream: fs.createReadStream(this.resolvePath(product.image.storageKey)),
      mimeType: product.image.mimeType,
    };
  }

  private resolvePath(storageKey: string): string {
    return path.join(this.uploadDir, storageKey);
  }
}
