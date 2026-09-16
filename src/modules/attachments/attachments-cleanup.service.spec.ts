import { ConfigService } from '@nestjs/config';
import { Repository } from 'typeorm';
import { AttachmentsCleanupService } from './attachments-cleanup.service';
import { AttachmentsService } from './attachments.service';
import { Attachment } from './entities/attachment.entity';

describe('AttachmentsCleanupService', () => {
  let attachmentsRepository: jest.Mocked<Pick<Repository<Attachment>, 'find'>>;
  let attachmentsService: jest.Mocked<
    Pick<
      AttachmentsService,
      'listStorageKeysOlderThan' | 'deleteFileByStorageKey'
    >
  >;
  let config: { get: jest.Mock };
  let service: AttachmentsCleanupService;

  beforeEach(() => {
    attachmentsRepository = { find: jest.fn().mockResolvedValue([]) };
    attachmentsService = {
      listStorageKeysOlderThan: jest.fn().mockResolvedValue([]),
      deleteFileByStorageKey: jest.fn(),
    };
    config = { get: jest.fn().mockReturnValue('development') };
    service = new AttachmentsCleanupService(
      attachmentsRepository as unknown as Repository<Attachment>,
      attachmentsService as unknown as AttachmentsService,
      config as unknown as ConfigService,
    );
  });

  describe('sweepOrphanFiles', () => {
    it('deletes a file that no longer has a matching Attachment row', async () => {
      attachmentsService.listStorageKeysOlderThan.mockResolvedValue([
        'orphan.png',
      ]);
      attachmentsRepository.find.mockResolvedValue([]);

      await service.sweepOrphanFiles();

      expect(attachmentsService.deleteFileByStorageKey).toHaveBeenCalledWith(
        'orphan.png',
      );
    });

    it('keeps a file that still has a matching Attachment row', async () => {
      attachmentsService.listStorageKeysOlderThan.mockResolvedValue([
        'in-use.png',
      ]);
      attachmentsRepository.find.mockResolvedValue([
        { storageKey: 'in-use.png' } as Attachment,
      ]);

      await service.sweepOrphanFiles();

      expect(attachmentsService.deleteFileByStorageKey).not.toHaveBeenCalled();
    });

    it('checks which candidates are in use with a single batched query, not one per file', async () => {
      const candidates = Array.from({ length: 5 }, (_, i) => `file-${i}.png`);
      attachmentsService.listStorageKeysOlderThan.mockResolvedValue(candidates);
      attachmentsRepository.find.mockResolvedValue([]);

      await service.sweepOrphanFiles();

      expect(attachmentsRepository.find).toHaveBeenCalledTimes(1);
      expect(attachmentsService.deleteFileByStorageKey).toHaveBeenCalledTimes(
        5,
      );
    });

    it('does not query at all when there are no candidates', async () => {
      attachmentsService.listStorageKeysOlderThan.mockResolvedValue([]);

      await service.sweepOrphanFiles();

      expect(attachmentsRepository.find).not.toHaveBeenCalled();
    });

    it('caps the number of files considered per run at the batch size', async () => {
      const candidates = Array.from({ length: 60 }, (_, i) => `file-${i}.png`);
      attachmentsService.listStorageKeysOlderThan.mockResolvedValue(candidates);
      attachmentsRepository.find.mockResolvedValue([]);

      await service.sweepOrphanFiles();

      expect(attachmentsService.deleteFileByStorageKey).toHaveBeenCalledTimes(
        50,
      );
    });

    it('skips a run that is still in progress instead of overlapping', async () => {
      let resolveFirstList: (value: string[]) => void = () => {};
      attachmentsService.listStorageKeysOlderThan.mockReturnValueOnce(
        new Promise((resolve) => {
          resolveFirstList = resolve;
        }),
      );

      const firstRun = service.sweepOrphanFiles();
      const secondRun = service.sweepOrphanFiles();
      resolveFirstList([]);
      await Promise.all([firstRun, secondRun]);

      expect(attachmentsService.listStorageKeysOlderThan).toHaveBeenCalledTimes(
        1,
      );
    });
  });

  describe('handleCron', () => {
    it('does not run the sweep in the test environment', async () => {
      config.get.mockReturnValue('test');

      await service.handleCron();

      expect(
        attachmentsService.listStorageKeysOlderThan,
      ).not.toHaveBeenCalled();
    });

    it('runs the sweep outside the test environment', async () => {
      config.get.mockReturnValue('development');

      await service.handleCron();

      expect(attachmentsService.listStorageKeysOlderThan).toHaveBeenCalled();
    });
  });
});
