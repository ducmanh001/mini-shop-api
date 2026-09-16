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
