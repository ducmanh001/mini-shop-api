import {
  Injectable,
  Logger,
  NotFoundException,
  StreamableFile,
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
import { detectImageMimeType } from './utils/attachment-signature.util';
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
    private readonly config: ConfigService,
    private readonly i18n: I18nService,
  ) {
    this.uploadDir = path.resolve(
      process.cwd(),
      this.config.getOrThrow<string>('UPLOAD_DIR'),
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
   * "attachments"): lỗi ở đây chỉ log, không throw, để không làm fail request đã commit DB thành
   * công. `AttachmentsCleanupService` quét định kỳ để dọn nốt file mà lần gọi này thất bại.
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

  /** Đọc `storageKey` của attachment cũ trước khi bị unlink DB — để caller dọn file sau commit. */
  async findStorageKeyById(
    id: string,
    manager: EntityManager,
  ): Promise<string | null> {
    const attachment = await manager.getRepository(Attachment).findOne({
      select: { storageKey: true },
      where: { id },
    });
    return attachment?.storageKey ?? null;
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
   * dòng 432). Dựng `StreamableFile` ngay trong service — controller chỉ gọi lại (mục 3
   * CODING_STANDARD.md áp dụng cho mọi kiểu response, không riêng JSON).
   */
  async getVisibleAttachmentFile(id: string): Promise<StreamableFile> {
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
    const stream = fs.createReadStream(
      this.resolvePath(product.image.storageKey),
    );
    return new StreamableFile(stream, { type: product.image.mimeType });
  }

  /**
   * Liệt kê tên file trên đĩa đã cũ hơn `minAgeMs` — dùng cho `AttachmentsCleanupService`. Chỉ trả
   * tên file, không tự kiểm tra DB (đó là việc của caller, giữ đúng ranh giới: service này chỉ
   * biết filesystem, không biết attachment nào còn "in use").
   */
  async listStorageKeysOlderThan(minAgeMs: number): Promise<string[]> {
    const entries = await fs.promises.readdir(this.uploadDir, {
      withFileTypes: true,
    });
    const now = Date.now();
    const storageKeys: string[] = [];
    for (const entry of entries) {
      if (!entry.isFile()) {
        continue;
      }
      const stats = await fs.promises.stat(this.resolvePath(entry.name));
      if (now - stats.mtimeMs >= minAgeMs) {
        storageKeys.push(entry.name);
      }
    }
    return storageKeys;
  }

  private resolvePath(storageKey: string): string {
    return path.join(this.uploadDir, storageKey);
  }
}
