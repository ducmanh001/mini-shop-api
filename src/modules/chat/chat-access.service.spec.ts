import { ConflictException, NotFoundException } from '@nestjs/common';
import { I18nService } from 'nestjs-i18n';
import { DataSource, EntityManager } from 'typeorm';
import type { AuthenticatedUser } from '../../common/auth/authenticated-user.interface';
import { UserRole } from '../../common/enums/user-role.enum';
import { UserStatus } from '../users/enums/user-status.enum';
import { ChatAccessService } from './chat-access.service';
import { ChatConversation } from './entities/chat-conversation.entity';
import { ChatConversationStatus } from './enums/chat-conversation-status.enum';

function sampleUser(
  overrides: Partial<AuthenticatedUser> = {},
): AuthenticatedUser {
  return {
    id: 'customer-1',
    role: UserRole.CUSTOMER,
    status: UserStatus.ACTIVE,
    tokenId: 'token-1',
    tokenVersion: 0,
    ...overrides,
  };
}

function sampleConversation(
  overrides: Record<string, unknown> = {},
): Partial<ChatConversation> {
  return {
    id: 'conversation-1',
    customerId: 'customer-1',
    assignedAdminId: null,
    status: ChatConversationStatus.OPEN,
    lastMessageAt: null,
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    ...overrides,
  };
}

describe('ChatAccessService', () => {
  let i18n: { t: jest.Mock };
  let dataSource: { getRepository: jest.Mock };
  let repository: { findOne: jest.Mock };
  let service: ChatAccessService;

  beforeEach(() => {
    i18n = { t: jest.fn((key: string) => key) };
    repository = { findOne: jest.fn() };
    dataSource = { getRepository: jest.fn(() => repository) };
    service = new ChatAccessService(
      dataSource as unknown as DataSource,
      i18n as unknown as I18nService,
    );
  });

  describe('assertCanReadConversation', () => {
    it('throws NotFoundException when the conversation does not exist', async () => {
      repository.findOne.mockResolvedValue(null);

      await expect(
        service.assertCanReadConversation('conversation-1', sampleUser()),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('throws NotFoundException when a CUSTOMER does not own the conversation', async () => {
      repository.findOne.mockResolvedValue(
        sampleConversation({ customerId: 'someone-else' }),
      );

      await expect(
        service.assertCanReadConversation('conversation-1', sampleUser()),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('returns the conversation when the CUSTOMER owns it', async () => {
      const conversation = sampleConversation();
      repository.findOne.mockResolvedValue(conversation);

      const result = await service.assertCanReadConversation(
        'conversation-1',
        sampleUser(),
      );

      expect(result).toBe(conversation);
    });

    it('returns the conversation for any ADMIN regardless of ownership', async () => {
      const conversation = sampleConversation({ customerId: 'someone-else' });
      repository.findOne.mockResolvedValue(conversation);

      const result = await service.assertCanReadConversation(
        'conversation-1',
        sampleUser({ id: 'admin-1', role: UserRole.ADMIN }),
      );

      expect(result).toBe(conversation);
    });

    it('reads through the given manager instead of dataSource when provided', async () => {
      const managerRepository = {
        findOne: jest.fn().mockResolvedValue(sampleConversation()),
      };
      const manager = { getRepository: jest.fn(() => managerRepository) };

      await service.assertCanReadConversation(
        'conversation-1',
        sampleUser(),
        manager as unknown as EntityManager,
      );

      expect(manager.getRepository).toHaveBeenCalledWith(ChatConversation);
      expect(dataSource.getRepository).not.toHaveBeenCalled();
    });
  });

  describe('assertCanJoinConversation', () => {
    it('throws ConflictException when the conversation is CLOSED', async () => {
      repository.findOne.mockResolvedValue(
        sampleConversation({ status: ChatConversationStatus.CLOSED }),
      );

      await expect(
        service.assertCanJoinConversation('conversation-1', sampleUser()),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it('returns the conversation when OPEN and access is allowed', async () => {
      const conversation = sampleConversation();
      repository.findOne.mockResolvedValue(conversation);

      const result = await service.assertCanJoinConversation(
        'conversation-1',
        sampleUser(),
      );

      expect(result).toBe(conversation);
    });

    it('propagates NotFoundException from the underlying access check', async () => {
      repository.findOne.mockResolvedValue(null);

      await expect(
        service.assertCanJoinConversation('conversation-1', sampleUser()),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });
});
