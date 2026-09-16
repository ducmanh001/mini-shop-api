import { detectImageMimeType } from './attachment-signature.util';

describe('detectImageMimeType', () => {
  it('recognizes a JPEG signature', () => {
    const buffer = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]);
    expect(detectImageMimeType(buffer)).toBe('image/jpeg');
  });

  it('recognizes a PNG signature', () => {
    const buffer = Buffer.from([
      0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00,
    ]);
    expect(detectImageMimeType(buffer)).toBe('image/png');
  });

  it('recognizes a WebP signature (RIFF....WEBP)', () => {
    const buffer = Buffer.from([
      0x52, 0x49, 0x46, 0x46, 0x00, 0x00, 0x00, 0x00, 0x57, 0x45, 0x42, 0x50,
    ]);
    expect(detectImageMimeType(buffer)).toBe('image/webp');
  });

  it('rejects a RIFF container that is not WebP', () => {
    const buffer = Buffer.from([
      0x52, 0x49, 0x46, 0x46, 0x00, 0x00, 0x00, 0x00, 0x41, 0x56, 0x49, 0x20,
    ]);
    expect(detectImageMimeType(buffer)).toBeNull();
  });

  it('rejects an unrelated or spoofed file (e.g. HTML claiming to be an image)', () => {
    const buffer = Buffer.from('<html><body>gotcha</body></html>');
    expect(detectImageMimeType(buffer)).toBeNull();
  });

  it('rejects a buffer shorter than any known signature', () => {
    expect(detectImageMimeType(Buffer.from([0xff, 0xd8]))).toBeNull();
    expect(detectImageMimeType(Buffer.alloc(0))).toBeNull();
  });
});
