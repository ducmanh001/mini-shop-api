import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { AttachmentsService } from './attachments.service';
import {
  ORPHAN_FILE_MIN_AGE_MS,
  ORPHAN_FILE_SWEEP_BATCH_SIZE,
} from './constants/attachments.constants';
import { Attachment } from './entities/attachment.entity';

/**
 * Quét `storage/uploads` định kỳ, xóa file không còn `Attachment` row nào tham chiếu — bù cho
 * các lần `AttachmentsService.deleteFileByStorageKey()`/dọn file mới khi transaction lỗi tự thất
 * bại (mục 6 CODING_STANDARD.md, database.md "attachments"). Chỉ coi file cũ hơn
 * `ORPHAN_FILE_MIN_AGE_MS` là ứng viên — file mới ghi có thể chưa kịp commit dòng `Attachment`
 * tương ứng (race với `ProductsService.replaceProductImage`), không phải mồ côi thật.
 */
@Injectable()
export class AttachmentsCleanupService {
  private readonly logger = new Logger(AttachmentsCleanupService.name);
  private isRunning = false;

  constructor(
    @InjectRepository(Attachment)
    private readonly attachmentsRepository: Repository<Attachment>,
    private readonly attachmentsService: AttachmentsService,
    private readonly config: ConfigService,
  ) {}

  @Cron(CronExpression.EVERY_HOUR)
  async handleCron(): Promise<void> {
    // Tự tắt tick thật trong test env, cùng lý do với NotificationDispatcherService.handleCron —
    // e2e boot AppModule thật nên cron thật vẫn chạy nền; test tự gọi sweepOrphanFiles() để kiểm
    // soát thời gian, không đợi lịch EVERY_HOUR.
    if (this.config.get<string>('NODE_ENV') === 'test') {
      return;
    }
    await this.sweepOrphanFiles();
  }

  async sweepOrphanFiles(): Promise<void> {
    if (this.isRunning) {
      this.logger.warn('Previous orphan file sweep is still running, skipping');
      return;
    }
    this.isRunning = true;
    try {
      const candidates = (
        await this.attachmentsService.listStorageKeysOlderThan(
          ORPHAN_FILE_MIN_AGE_MS,
        )
      ).slice(0, ORPHAN_FILE_SWEEP_BATCH_SIZE);
      if (candidates.length === 0) {
        return;
      }

      // 1 query cho cả batch thay vì .exists() từng file trong vòng lặp (mục 18.2/18.6
      // CODING_STANDARD.md) — tập hợp bị chặn trên bởi ORPHAN_FILE_SWEEP_BATCH_SIZE nên IN(...)
      // an toàn, không phải trường hợp "id list không có cận trên" của mục 18.2.
      const inUseRows = await this.attachmentsRepository.find({
        select: { storageKey: true },
        where: { storageKey: In(candidates) },
      });
      const inUseStorageKeys = new Set(inUseRows.map((row) => row.storageKey));

      for (const storageKey of candidates) {
        if (inUseStorageKeys.has(storageKey)) {
          continue;
        }
        await this.attachmentsService.deleteFileByStorageKey(storageKey);
        this.logger.log(`Swept orphan attachment file ${storageKey}`);
      }
    } finally {
      this.isRunning = false;
    }
  }
}
