import { AttachmentMimeType } from '../interfaces/attachment-mime-type.type';

const JPEG_SIGNATURE = [0xff, 0xd8, 0xff];
const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const WEBP_RIFF_SIGNATURE = [0x52, 0x49, 0x46, 0x46];
const WEBP_FORMAT_SIGNATURE = [0x57, 0x45, 0x42, 0x50];
const WEBP_FORMAT_OFFSET = 8;

function matchesSignature(
  buffer: Buffer,
  signature: number[],
  offset = 0,
): boolean {
  if (buffer.length < offset + signature.length) {
    return false;
  }
  return signature.every((byte, index) => buffer[offset + index] === byte);
}

/**
 * Nhận diện MIME thật từ byte đầu buffer (magic bytes) — không tin `file.mimetype` do client khai
 * (CODING_STANDARD.md mục 8, chống stored-content-type spoofing). Chỉ 3 định dạng cố định nên tự
 * viết, không thêm dependency (`file-type` v17+ là pure ESM, xung đột CommonJS/ts-node hiện tại).
 */
export function detectImageMimeType(buffer: Buffer): AttachmentMimeType | null {
  if (matchesSignature(buffer, JPEG_SIGNATURE)) {
    return 'image/jpeg';
  }
  if (matchesSignature(buffer, PNG_SIGNATURE)) {
    return 'image/png';
  }
  if (
    matchesSignature(buffer, WEBP_RIFF_SIGNATURE) &&
    matchesSignature(buffer, WEBP_FORMAT_SIGNATURE, WEBP_FORMAT_OFFSET)
  ) {
    return 'image/webp';
  }
  return null;
}
