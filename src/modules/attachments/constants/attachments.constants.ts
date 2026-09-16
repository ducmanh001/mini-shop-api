/** Route path của `AttachmentsController` — `ProductsService` dùng lại để dựng `image.url` trong
 * response, tránh 2 nơi tự gõ tay cùng 1 chuỗi `'attachments'`. */
export const ATTACHMENT_ROUTE_PATH = 'attachments';

export const ALLOWED_ATTACHMENT_MIME_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
] as const;
export const MAX_ATTACHMENT_SIZE_BYTES = 2 * 1024 * 1024;

/** Đuôi file dùng khi sinh storage key — chỉ để dễ đọc trên đĩa, không ảnh hưởng Content-Type trả về. */
export const ATTACHMENT_MIME_TYPE_EXTENSIONS: Record<
  (typeof ALLOWED_ATTACHMENT_MIME_TYPES)[number],
  string
> = {
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
};

/**
 * Biên độ an toàn cho `AttachmentsCleanupService` — chỉ coi một file trên đĩa là "mồ côi" khi đã
 * cũ hơn khoảng này, để không đụng file vừa `writeImageFile()` ghi xong mà transaction DB
 * (`ProductsService.replaceProductImage`) chưa kịp commit dòng `Attachment` tương ứng.
 */
export const ORPHAN_FILE_MIN_AGE_MS = 60 * 60 * 1000;
export const ORPHAN_FILE_SWEEP_BATCH_SIZE = 50;
