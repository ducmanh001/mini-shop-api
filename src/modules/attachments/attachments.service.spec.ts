import {
  NotFoundException,
  UnsupportedMediaTypeException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as fs from 'fs';
import { I18nService } from 'nestjs-i18n';
import * as os from 'os';
import * as path from 'path';
import { EntityManager, Repository } from 'typeorm';
import { Product } from '../products/entities/product.entity';
import { AttachmentsService } from './attachments.service';
import { Attachment } from './entities/attachment.entity';

const PNG_HEADER = Buffer.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
]);

function pngBuffer(): Buffer {
  return Buffer.concat([PNG_HEADER, Buffer.from('fake-png-body')]);
}

function mockAttachmentQueryBuilder(repository: {
  createQueryBuilder: jest.Mock;
}) {
  const builder = {
    innerJoin: jest.fn().mockReturnThis(),
    select: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    andWhere: jest.fn().mockReturnThis(),
    getOne: jest.fn(),
  };
  repository.createQueryBuilder.mockReturnValue(builder);
  return builder;
}

async function drain(stream: NodeJS.ReadableStream): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const chunk of stream) {
    chunks.push(chunk as Buffer);
  }
  return Buffer.concat(chunks);
}

describe('AttachmentsService', () => {
  let uploadDir: string;
  let productsRepository: jest.Mocked<Pick<Repository<Product>, never>> & {
    createQueryBuilder: jest.Mock;
  };
  let i18n: { t: jest.Mock };
  let service: AttachmentsService;

  beforeEach(() => {
    uploadDir = fs.mkdtempSync(path.join(os.tmpdir(), 'attachments-test-'));
    productsRepository = { createQueryBuilder: jest.fn() };
    i18n = { t: jest.fn((key: string) => key) };
    const config = {
      getOrThrow: jest.fn().mockReturnValue(uploadDir),
    } as unknown as ConfigService;
    service = new AttachmentsService(
      productsRepository as unknown as Repository<Product>,
      config,
      i18n as unknown as I18nService,
    );
  });

  afterEach(() => {
    fs.rmSync(uploadDir, { recursive: true, force: true });
  });

  describe('validateImageFile', () => {
    it('accepts a file whose declared MIME matches its byte signature', () => {
      const file = {
        mimetype: 'image/png',
        buffer: pngBuffer(),
      } as Express.Multer.File;

      expect(() => service.validateImageFile(file)).not.toThrow();
    });

    it('rejects a MIME type outside the allow-list', () => {
      const file = {
        mimetype: 'image/gif',
        buffer: pngBuffer(),
      } as Express.Multer.File;

      expect(() => service.validateImageFile(file)).toThrow(
        UnsupportedMediaTypeException,
      );
    });

    it('rejects a spoofed file whose signature does not match its declared MIME', () => {
      const file = {
        mimetype: 'image/png',
        buffer: Buffer.from('<html><body>gotcha</body></html>'),
      } as Express.Multer.File;

      expect(() => service.validateImageFile(file)).toThrow(
        UnsupportedMediaTypeException,
      );
    });
  });

  describe('writeImageFile / deleteFileByStorageKey', () => {
    it('writes the buffer under a generated storage key with the matching extension', async () => {
      const storageKey = await service.writeImageFile(pngBuffer(), 'image/png');

      expect(storageKey.endsWith('.png')).toBe(true);
      expect(fs.readFileSync(path.join(uploadDir, storageKey))).toEqual(
        pngBuffer(),
      );
    });

    it('deletes a previously written file', async () => {
      const storageKey = await service.writeImageFile(pngBuffer(), 'image/png');

      await service.deleteFileByStorageKey(storageKey);

      expect(fs.existsSync(path.join(uploadDir, storageKey))).toBe(false);
    });

    it('does not throw when the file to delete no longer exists', async () => {
      await expect(
        service.deleteFileByStorageKey('already-gone.png'),
      ).resolves.toBeUndefined();
    });

    it('logs and does not throw on an unexpected filesystem error', async () => {
      // unlink trên một thư mục (không phải file) ném EISDIR, không phải ENOENT — mô phỏng lỗi
      // filesystem bất ngờ khác mà không cần mock `fs`.
      const dirAsStorageKey = 'not-a-file';
      fs.mkdirSync(path.join(uploadDir, dirAsStorageKey));

      await expect(
        service.deleteFileByStorageKey(dirAsStorageKey),
      ).resolves.toBeUndefined();
    });
  });

  describe('createAttachmentRecord / deleteAttachmentRecord', () => {
    it('always goes through the given transaction manager, never a default repository', async () => {
      const create = jest.fn((data: unknown) => data as Attachment);
      const save = jest.fn((entity: Attachment) => Promise.resolve(entity));
      const del = jest.fn();
      const getRepository = jest.fn().mockReturnValue({
        create,
        save,
        delete: del,
      });
      const manager = { getRepository } as unknown as EntityManager;

      const attachment = await service.createAttachmentRecord(
        { storageKey: 'k.png', mimeType: 'image/png', sizeBytes: 10 },
        manager,
      );

      expect(getRepository).toHaveBeenCalledWith(Attachment);
      expect(attachment.storageKey).toBe('k.png');

      await service.deleteAttachmentRecord('attachment-1', manager);
      expect(del).toHaveBeenCalledWith('attachment-1');
    });
  });

  describe('findStorageKeyById', () => {
    it('returns the storageKey of an existing attachment', async () => {
      const findOne = jest.fn().mockResolvedValue({ storageKey: 'k.png' });
      const manager = {
        getRepository: jest.fn().mockReturnValue({ findOne }),
      } as unknown as EntityManager;

      await expect(
        service.findStorageKeyById('attachment-1', manager),
      ).resolves.toBe('k.png');
    });

    it('returns null when the attachment no longer exists', async () => {
      const findOne = jest.fn().mockResolvedValue(null);
      const manager = {
        getRepository: jest.fn().mockReturnValue({ findOne }),
      } as unknown as EntityManager;

      await expect(
        service.findStorageKeyById('missing-id', manager),
      ).resolves.toBeNull();
    });
  });

  describe('listStorageKeysOlderThan', () => {
    it('only returns files whose mtime is at least the given age', async () => {
      const oldKey = await service.writeImageFile(pngBuffer(), 'image/png');
      const newKey = await service.writeImageFile(pngBuffer(), 'image/png');
      const oldTime = new Date(Date.now() - 2 * 60 * 60 * 1000);
      fs.utimesSync(path.join(uploadDir, oldKey), oldTime, oldTime);

      const result = await service.listStorageKeysOlderThan(60 * 60 * 1000);

      expect(result).toContain(oldKey);
      expect(result).not.toContain(newKey);
    });

    it('returns an empty list when the upload dir has no files', async () => {
      await expect(
        service.listStorageKeysOlderThan(60 * 60 * 1000),
      ).resolves.toEqual([]);
    });

    it('skips non-file entries (e.g. a stray subdirectory)', async () => {
      fs.mkdirSync(path.join(uploadDir, 'stray-dir'));

      await expect(service.listStorageKeysOlderThan(0)).resolves.not.toContain(
        'stray-dir',
      );
    });
  });

  describe('getVisibleAttachmentFile', () => {
    it('throws NotFoundException when no visible product currently uses this image', async () => {
      const builder = mockAttachmentQueryBuilder(productsRepository);
      builder.getOne.mockResolvedValue(null);

      await expect(
        service.getVisibleAttachmentFile('missing-id'),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('streams the file for the current image of a visible product', async () => {
      const storageKey = await service.writeImageFile(pngBuffer(), 'image/png');
      const builder = mockAttachmentQueryBuilder(productsRepository);
      builder.getOne.mockResolvedValue({
        id: 'product-1',
        image: { storageKey, mimeType: 'image/png' },
      });

      const result = await service.getVisibleAttachmentFile('attachment-1');

      expect(result.options.type).toBe('image/png');
      expect(await drain(result.getStream())).toEqual(pngBuffer());
    });
  });
});
