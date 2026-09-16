import { UnsupportedMediaTypeException } from '@nestjs/common';
import { MAX_ATTACHMENT_SIZE_BYTES } from '../../attachments/constants/attachments.constants';

type MulterFileFilter = (
  req: unknown,
  file: Express.Multer.File,
  callback: (error: Error | null, acceptFile: boolean) => void,
) => void;

let capturedOptions: {
  limits?: { fileSize?: number };
  fileFilter?: MulterFileFilter;
} = {};

jest.mock('@nestjs/platform-express', () => ({
  FileInterceptor: (
    _fieldName: string,
    options: { limits?: { fileSize?: number }; fileFilter?: MulterFileFilter },
  ) => {
    capturedOptions = options;
    return class {};
  },
}));

import { createProductImageUploadInterceptor } from './product-image-upload.interceptor';

describe('createProductImageUploadInterceptor', () => {
  beforeEach(() => {
    capturedOptions = {};
    createProductImageUploadInterceptor();
  });

  it('caps the file size at MAX_ATTACHMENT_SIZE_BYTES', () => {
    expect(capturedOptions.limits?.fileSize).toBe(MAX_ATTACHMENT_SIZE_BYTES);
  });

  it('accepts a declared MIME type in the allow-list', () => {
    const callback = jest.fn();
    capturedOptions.fileFilter?.(
      {},
      { mimetype: 'image/png' } as Express.Multer.File,
      callback,
    );
    expect(callback).toHaveBeenCalledWith(null, true);
  });

  it('rejects a declared MIME type outside the allow-list', () => {
    const callback = jest.fn();
    capturedOptions.fileFilter?.(
      {},
      { mimetype: 'application/pdf' } as Express.Multer.File,
      callback,
    );
    expect(callback).toHaveBeenCalledWith(
      expect.any(UnsupportedMediaTypeException),
      false,
    );
  });
});
