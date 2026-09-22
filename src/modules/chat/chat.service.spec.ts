import {
  BadRequestException,
  ConflictException,
  HttpStatus,
  NotFoundException,
} from '@nestjs/common';
import { createHash } from 'crypto';
import { I18nService } from 'nestjs-i18n';
import { DataSource, EntityManager, QueryFailedError } from 'typeorm';
import type { AuthenticatedUser } from '../../common/auth/authenticated-user.interface';
import { UserRole } from '../../common/enums/user-role.enum';
import { canonicalizeForHash } from '../../common/utils/idempotency.util';
import { UserStatus } from '../users/enums/user-status.enum';
import { ChatAccessService } from './chat-access.service';
import { ChatGateway } from './chat.gateway';
import { ChatService } from './chat.service';
import {
  CHAT_CONVERSATIONS_CUSTOMER_OPEN_CONSTRAINT,
  CHAT_MESSAGES_SENDER_IDEMPOTENCY_KEY_CONSTRAINT,
} from './constants/chat.constants';
import { ChatConversation } from './entities/chat-conversation.entity';
import { ChatMessage } from './entities/chat-message.entity';
import { ChatConversationStatus } from './enums/chat-conversation-status.enum';
import { encodeMessageCursor } from './utils/message-cursor.util';

function queryError(code: string, constraint?: string): QueryFailedError {
  return new QueryFailedError(
    'INSERT INTO chat_conversations ...',
    [],
    Object.assign(new Error('database error'), { code, constraint }),
  );
}

function mockQueryBuilder() {
  const builder: Record<string, jest.Mock> = {};
  for (const method of [
    'select',
    'addSelect',
    'leftJoin',
    'innerJoin',
    'where',
    'andWhere',
    'orderBy',
    'addOrderBy',
    'groupBy',
    'take',
    'skip',
    'update',
    'set',
  ]) {
    builder[method] = jest.fn().mockReturnThis();
  }
  builder.getManyAndCount = jest.fn().mockResolvedValue([[], 0]);
  builder.getRawAndEntities = jest
    .fn()
    .mockResolvedValue({ entities: [], raw: [] });
  builder.getRawMany = jest.fn().mockResolvedValue([]);
  builder.execute = jest.fn().mockResolvedValue({ affected: 1 });
  return builder;
}

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
): Record<string, unknown> {
  return {
    id: 'conversation-1',
    customerId: 'customer-1',
    assignedAdminId: null,
    status: ChatConversationStatus.OPEN,
    lastMessageAt: null,
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    updatedAt: new Date('2026-01-01T00:00:00.000Z'),
    customer: { id: 'customer-1', username: 'buyer1' },
    assignedAdmin: null,
    ...overrides,
  };
}

function sampleMessage(
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    id: 'message-1',
    conversationId: 'conversation-1',
    senderId: 'customer-1',
    idempotencyKey: '11111111-1111-4111-8111-111111111111',
    requestHash: 'hash-1',
    body: 'hello',
    readAt: null,
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    ...overrides,
  };
}

describe('ChatService', () => {
  let i18n: { t: jest.Mock };
  let usersService: { findById: jest.Mock };
  let chatAccessService: { assertCanReadConversation: jest.Mock };
  let chatGateway: { broadcastMessageCreated: jest.Mock };
  let dataSource: { getRepository: jest.Mock; transaction: jest.Mock };
  let dataSourceConversationRepository: {
    findOne: jest.Mock;
    save: jest.Mock;
    create: jest.Mock;
    createQueryBuilder: jest.Mock;
  };
  let dataSourceMessageRepository: { createQueryBuilder: jest.Mock };
  let manager: { getRepository: jest.Mock };
  let managerConversationRepository: { findOne: jest.Mock; update: jest.Mock };
  let managerMessageRepository: {
    findOne: jest.Mock;
    create: jest.Mock;
    save: jest.Mock;
  };
  let service: ChatService;

  beforeEach(() => {
    i18n = { t: jest.fn((key: string) => key) };
    usersService = { findById: jest.fn() };
    chatAccessService = { assertCanReadConversation: jest.fn() };
    chatGateway = {
      broadcastMessageCreated: jest.fn().mockResolvedValue(undefined),
    };

    dataSourceConversationRepository = {
      findOne: jest.fn().mockResolvedValue(null),
      save: jest.fn((data: Record<string, unknown>) =>
        Promise.resolve({ ...data, id: 'conversation-1' }),
      ),
      create: jest.fn((data: Record<string, unknown>) => data),
      createQueryBuilder: jest.fn(() => mockQueryBuilder()),
    };
    dataSourceMessageRepository = {
      createQueryBuilder: jest.fn(() => mockQueryBuilder()),
    };

    managerConversationRepository = {
      findOne: jest.fn().mockResolvedValue(sampleConversation()),
      update: jest.fn().mockResolvedValue({ affected: 1 }),
    };
    managerMessageRepository = {
      findOne: jest.fn().mockResolvedValue(null),
      create: jest.fn((data: Record<string, unknown>) => data),
      save: jest.fn((data: Record<string, unknown>) =>
        Promise.resolve({ ...sampleMessage(), ...data, id: 'message-1' }),
      ),
    };
    manager = {
      getRepository: jest.fn((entity: unknown) => {
        if (entity === ChatConversation) return managerConversationRepository;
        if (entity === ChatMessage) return managerMessageRepository;
        throw new Error('unexpected entity requested from manager');
      }),
    };

    dataSource = {
      getRepository: jest.fn((entity: unknown) => {
        if (entity === ChatConversation)
          return dataSourceConversationRepository;
        if (entity === ChatMessage) return dataSourceMessageRepository;
        throw new Error('unexpected entity requested from dataSource');
      }),
      transaction: jest.fn((callback: (m: EntityManager) => Promise<unknown>) =>
        callback(manager as unknown as EntityManager),
      ),
    };

    service = new ChatService(
      dataSource as unknown as DataSource,
      i18n as unknown as I18nService,
      usersService as never,
      chatAccessService as unknown as ChatAccessService,
      chatGateway as unknown as ChatGateway,
    );
  });

  describe('getOrCreateOpenConversation (CHAT-01)', () => {
    it('returns the existing OPEN conversation with statusCode=OK without inserting', async () => {
      dataSourceConversationRepository.findOne
        .mockResolvedValueOnce({ id: 'conversation-1' })
        .mockResolvedValueOnce(sampleConversation());

      const result = await service.getOrCreateOpenConversation('customer-1');

      expect(result.statusCode).toBe(HttpStatus.OK);
      expect(dataSourceConversationRepository.save).not.toHaveBeenCalled();
    });

    it('creates a new conversation with statusCode=CREATED when none exists', async () => {
      dataSourceConversationRepository.findOne
        .mockResolvedValueOnce(null) // existing check
        .mockResolvedValueOnce(sampleConversation()); // loadConversationResponse

      const result = await service.getOrCreateOpenConversation('customer-1');

      expect(result.statusCode).toBe(HttpStatus.CREATED);
      expect(dataSourceConversationRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({
          customerId: 'customer-1',
          status: ChatConversationStatus.OPEN,
        }),
      );
    });

    it('recovers from a concurrent-insert race by returning the winner as statusCode=OK', async () => {
      dataSourceConversationRepository.findOne
        .mockResolvedValueOnce(null) // existing check finds nothing
        .mockResolvedValueOnce({ id: 'conversation-1' }) // re-select after 23505
        .mockResolvedValueOnce(sampleConversation()); // loadConversationResponse
      dataSourceConversationRepository.save.mockRejectedValue(
        queryError('23505', CHAT_CONVERSATIONS_CUSTOMER_OPEN_CONSTRAINT),
      );

      const result = await service.getOrCreateOpenConversation('customer-1');

      expect(result.statusCode).toBe(HttpStatus.OK);
    });

    it('rethrows a unique violation on an unrelated constraint', async () => {
      dataSourceConversationRepository.findOne.mockResolvedValueOnce(null);
      dataSourceConversationRepository.save.mockRejectedValue(
        queryError('23505', 'some_other_constraint'),
      );

      await expect(
        service.getOrCreateOpenConversation('customer-1'),
      ).rejects.toThrow('database error');
    });
  });

  describe('getMyOpenConversation (CHAT-02)', () => {
    it('throws NotFoundException when there is no OPEN conversation', async () => {
      dataSourceConversationRepository.findOne.mockResolvedValue(null);

      await expect(
        service.getMyOpenConversation('customer-1'),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('returns the OPEN conversation when it exists', async () => {
      dataSourceConversationRepository.findOne
        .mockResolvedValueOnce({ id: 'conversation-1' })
        .mockResolvedValueOnce(sampleConversation());

      const result = await service.getMyOpenConversation('customer-1');

      expect(result.conversation.id).toBe('conversation-1');
    });
  });

  describe('listMessages (CHAT-03)', () => {
    it('checks access before querying and marks the other party’s messages read', async () => {
      const builder = mockQueryBuilder();
      dataSourceMessageRepository.createQueryBuilder.mockReturnValue(builder);
      const updateBuilder = mockQueryBuilder();
      dataSourceMessageRepository.createQueryBuilder
        .mockReturnValueOnce(builder)
        .mockReturnValueOnce(updateBuilder);

      await service.listMessages('conversation-1', sampleUser(), {
        limit: 20,
      });

      expect(chatAccessService.assertCanReadConversation).toHaveBeenCalledWith(
        'conversation-1',
        sampleUser(),
      );
      expect(updateBuilder.update).toHaveBeenCalledWith(ChatMessage);
      expect(updateBuilder.andWhere).toHaveBeenCalledWith(
        'senderId != :requesterId',
        { requesterId: 'customer-1' },
      );
    });

    it('returns nextCursor=null when the page is not full', async () => {
      const builder = mockQueryBuilder();
      builder.getRawAndEntities.mockResolvedValue({
        entities: [sampleMessage()],
        raw: [{ message_created_at_raw: '2026-01-01 00:00:00.000000+00' }],
      });
      dataSourceMessageRepository.createQueryBuilder
        .mockReturnValueOnce(builder)
        .mockReturnValueOnce(mockQueryBuilder());

      const result = await service.listMessages(
        'conversation-1',
        sampleUser(),
        {
          limit: 1,
        },
      );

      expect(result.nextCursor).toBeNull();
      expect(result.messages).toHaveLength(1);
    });

    it('returns an encoded nextCursor built from the raw (non-Date) timestamp when there is another page', async () => {
      const builder = mockQueryBuilder();
      builder.getRawAndEntities.mockResolvedValue({
        entities: [sampleMessage({ id: 'a' }), sampleMessage({ id: 'b' })],
        raw: [
          { message_created_at_raw: '2026-01-01 00:00:00.123456+00' },
          { message_created_at_raw: '2026-01-01 00:00:00.100000+00' },
        ],
      });
      dataSourceMessageRepository.createQueryBuilder
        .mockReturnValueOnce(builder)
        .mockReturnValueOnce(mockQueryBuilder());

      const result = await service.listMessages(
        'conversation-1',
        sampleUser(),
        {
          limit: 1,
        },
      );

      expect(result.messages).toHaveLength(1);
      expect(result.nextCursor).toBe(
        encodeMessageCursor({
          createdAtRaw: '2026-01-01 00:00:00.123456+00',
          id: 'a',
        }),
      );
    });

    it('throws BadRequestException for a malformed cursor', async () => {
      dataSourceMessageRepository.createQueryBuilder.mockReturnValue(
        mockQueryBuilder(),
      );

      await expect(
        service.listMessages('conversation-1', sampleUser(), {
          limit: 20,
          cursor: 'not-a-valid-cursor',
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });
  });

  describe('sendMessage (CHAT-04)', () => {
    const dto = { body: 'hello there' };
    const idempotencyKey = '11111111-1111-4111-8111-111111111111';

    it('locks the conversation row before anything else', async () => {
      await service.sendMessage(
        'conversation-1',
        sampleUser(),
        dto,
        idempotencyKey,
      );

      expect(managerConversationRepository.findOne).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'conversation-1' },
          lock: { mode: 'pessimistic_write' },
        }),
      );
    });

    it('throws NotFoundException when the conversation does not exist', async () => {
      managerConversationRepository.findOne.mockResolvedValue(null);

      await expect(
        service.sendMessage(
          'conversation-1',
          sampleUser(),
          dto,
          idempotencyKey,
        ),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('throws NotFoundException when a CUSTOMER does not own the conversation', async () => {
      managerConversationRepository.findOne.mockResolvedValue(
        sampleConversation({ customerId: 'someone-else' }),
      );

      await expect(
        service.sendMessage(
          'conversation-1',
          sampleUser(),
          dto,
          idempotencyKey,
        ),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('throws ConflictException when the conversation is CLOSED', async () => {
      managerConversationRepository.findOne.mockResolvedValue(
        sampleConversation({ status: ChatConversationStatus.CLOSED }),
      );

      await expect(
        service.sendMessage(
          'conversation-1',
          sampleUser(),
          dto,
          idempotencyKey,
        ),
      ).rejects.toBeInstanceOf(ConflictException);
      expect(managerMessageRepository.save).not.toHaveBeenCalled();
    });

    it('creates the message, updates lastMessageAt, and broadcasts after commit', async () => {
      const result = await service.sendMessage(
        'conversation-1',
        sampleUser(),
        dto,
        idempotencyKey,
      );

      expect(result.statusCode).toBe(HttpStatus.CREATED);
      expect(managerMessageRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({
          conversationId: 'conversation-1',
          senderId: 'customer-1',
          body: 'hello there',
        }),
      );
      const [, updatePayload] = managerConversationRepository.update.mock
        .calls[0] as [string, { lastMessageAt: Date }];
      expect(updatePayload.lastMessageAt).toBeInstanceOf(Date);
      expect(chatGateway.broadcastMessageCreated).toHaveBeenCalledTimes(1);
      const [broadcastConversationId, broadcastPayload] = chatGateway
        .broadcastMessageCreated.mock.calls[0] as [
        string,
        { message: unknown },
      ];
      expect(broadcastConversationId).toBe('conversation-1');
      expect(broadcastPayload.message).toBeDefined();
    });

    it('returns the replayed message with statusCode=OK on a same-key same-body retry, without re-broadcasting', async () => {
      const matchingHash = createHash('sha256')
        .update(
          canonicalizeForHash({
            conversationId: 'conversation-1',
            body: dto.body,
          }),
        )
        .digest('hex');
      managerMessageRepository.findOne.mockResolvedValue(
        sampleMessage({ requestHash: matchingHash }),
      );

      const result = await service.sendMessage(
        'conversation-1',
        sampleUser(),
        dto,
        idempotencyKey,
      );

      expect(result.statusCode).toBe(HttpStatus.OK);
      expect(managerMessageRepository.save).not.toHaveBeenCalled();
      expect(chatGateway.broadcastMessageCreated).not.toHaveBeenCalled();
    });

    it('throws ConflictException when the same key is replayed with a different body', async () => {
      managerMessageRepository.findOne.mockResolvedValue(
        sampleMessage({ requestHash: 'a-completely-different-hash' }),
      );

      await expect(
        service.sendMessage(
          'conversation-1',
          sampleUser(),
          dto,
          idempotencyKey,
        ),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it('throws ConflictException (not a silent wrong-conversation 200) when the same key+body was already used for a different conversation', async () => {
      // uq_chat_messages_sender_idempotency_key is scoped to (senderId, idempotencyKey) only, not
      // conversationId — the hash must include conversationId so this reuse is detected as a
      // conflict instead of replaying the other conversation's message.
      const hashForOtherConversation = createHash('sha256')
        .update(
          canonicalizeForHash({
            conversationId: 'conversation-2',
            body: dto.body,
          }),
        )
        .digest('hex');
      managerMessageRepository.findOne.mockResolvedValue(
        sampleMessage({
          conversationId: 'conversation-2',
          requestHash: hashForOtherConversation,
        }),
      );

      await expect(
        service.sendMessage(
          'conversation-1',
          sampleUser(),
          dto,
          idempotencyKey,
        ),
      ).rejects.toBeInstanceOf(ConflictException);
      expect(managerMessageRepository.save).not.toHaveBeenCalled();
    });

    it('recovers from a concurrent same-key insert race by resolving through the replay path', async () => {
      const matchingHash = createHash('sha256')
        .update(
          canonicalizeForHash({
            conversationId: 'conversation-1',
            body: dto.body,
          }),
        )
        .digest('hex');
      managerMessageRepository.findOne
        .mockResolvedValueOnce(null) // pre-insert replay check: nothing yet
        .mockResolvedValueOnce(
          sampleMessage({
            conversationId: 'conversation-1',
            requestHash: matchingHash,
          }),
        ); // post-conflict recovery lookup: the winner (same content, lost the insert race)
      managerMessageRepository.save.mockRejectedValue(
        queryError('23505', CHAT_MESSAGES_SENDER_IDEMPOTENCY_KEY_CONSTRAINT),
      );

      const result = await service.sendMessage(
        'conversation-1',
        sampleUser(),
        dto,
        idempotencyKey,
      );

      expect(result.statusCode).toBe(HttpStatus.OK);
    });

    it('swallows a broadcast failure instead of rejecting the request', async () => {
      chatGateway.broadcastMessageCreated.mockRejectedValue(
        new Error('socket boom'),
      );

      const result = await service.sendMessage(
        'conversation-1',
        sampleUser(),
        dto,
        idempotencyKey,
      );

      expect(result.statusCode).toBe(HttpStatus.CREATED);
    });
  });

  describe('listForAdmin (CHAT-05)', () => {
    it('applies status and assignedAdminId filters, and skips the unread-count query when there are no rows', async () => {
      const builder = mockQueryBuilder();
      dataSourceConversationRepository.createQueryBuilder.mockReturnValue(
        builder,
      );

      await service.listForAdmin({
        limit: 20,
        offset: 0,
        status: ChatConversationStatus.OPEN,
        assignedAdminId: 'admin-1',
      });

      expect(builder.andWhere).toHaveBeenCalledWith(
        'conversation.status = :status',
        { status: ChatConversationStatus.OPEN },
      );
      expect(builder.andWhere).toHaveBeenCalledWith(
        'conversation.assignedAdminId = :assignedAdminId',
        { assignedAdminId: 'admin-1' },
      );
      expect(
        dataSourceMessageRepository.createQueryBuilder,
      ).not.toHaveBeenCalled();
    });

    it('attaches the unread count per conversation from a single aggregate query', async () => {
      const listBuilder = mockQueryBuilder();
      listBuilder.getManyAndCount.mockResolvedValue([
        [sampleConversation({ id: 'conversation-1' })],
        1,
      ]);
      dataSourceConversationRepository.createQueryBuilder.mockReturnValue(
        listBuilder,
      );
      const unreadBuilder = mockQueryBuilder();
      unreadBuilder.getRawMany.mockResolvedValue([
        { conversationId: 'conversation-1', count: '3' },
      ]);
      dataSourceMessageRepository.createQueryBuilder.mockReturnValue(
        unreadBuilder,
      );

      const result = await service.listForAdmin({ limit: 20, offset: 0 });

      expect(
        dataSourceMessageRepository.createQueryBuilder,
      ).toHaveBeenCalledTimes(1);
      expect(result.conversations[0].unreadCount).toBe(3);
      expect(result.conversationsCount).toBe(1);
    });
  });

  describe('updateConversation (CHAT-06)', () => {
    it('throws BadRequestException when neither assignedAdminId nor status is given', async () => {
      await expect(
        service.updateConversation('conversation-1', {}),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('validates the assignee is an ACTIVE ADMIN before touching the conversation row', async () => {
      usersService.findById.mockResolvedValue({
        id: 'not-admin',
        role: UserRole.CUSTOMER,
        status: UserStatus.ACTIVE,
      });

      await expect(
        service.updateConversation('conversation-1', {
          assignedAdminId: 'not-admin',
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(managerConversationRepository.findOne).not.toHaveBeenCalled();
    });

    it('throws NotFoundException when the assignee user does not exist', async () => {
      usersService.findById.mockResolvedValue(null);

      await expect(
        service.updateConversation('conversation-1', {
          assignedAdminId: 'missing-user',
        }),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('locks the conversation row and throws NotFoundException when missing', async () => {
      managerConversationRepository.findOne.mockResolvedValue(null);

      await expect(
        service.updateConversation('conversation-1', {
          status: ChatConversationStatus.CLOSED,
        }),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(managerConversationRepository.findOne).toHaveBeenCalledWith(
        expect.objectContaining({ lock: { mode: 'pessimistic_write' } }),
      );
    });

    it('throws ConflictException when the target status equals the current status', async () => {
      managerConversationRepository.findOne.mockResolvedValue(
        sampleConversation({ status: ChatConversationStatus.OPEN }),
      );

      await expect(
        service.updateConversation('conversation-1', {
          status: ChatConversationStatus.OPEN,
        }),
      ).rejects.toBeInstanceOf(ConflictException);
      expect(managerConversationRepository.update).not.toHaveBeenCalled();
    });

    it('converts a reopen unique-violation race into ConflictException', async () => {
      managerConversationRepository.findOne.mockResolvedValueOnce(
        sampleConversation({ status: ChatConversationStatus.CLOSED }),
      );
      managerConversationRepository.update.mockRejectedValue(
        queryError('23505', CHAT_CONVERSATIONS_CUSTOMER_OPEN_CONSTRAINT),
      );

      await expect(
        service.updateConversation('conversation-1', {
          status: ChatConversationStatus.OPEN,
        }),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it('assigns and closes in one call, returning the fresh response built within the same transaction', async () => {
      usersService.findById.mockResolvedValue({
        id: 'admin-1',
        role: UserRole.ADMIN,
        status: UserStatus.ACTIVE,
      });
      managerConversationRepository.findOne
        .mockResolvedValueOnce(
          sampleConversation({ status: ChatConversationStatus.OPEN }),
        )
        .mockResolvedValueOnce(
          sampleConversation({
            status: ChatConversationStatus.CLOSED,
            assignedAdminId: 'admin-1',
            assignedAdmin: { id: 'admin-1', username: 'admin1' },
          }),
        );

      const result = await service.updateConversation('conversation-1', {
        assignedAdminId: 'admin-1',
        status: ChatConversationStatus.CLOSED,
      });

      expect(managerConversationRepository.update).toHaveBeenCalledWith(
        'conversation-1',
        { assignedAdminId: 'admin-1', status: ChatConversationStatus.CLOSED },
      );
      expect(result.conversation.status).toBe(ChatConversationStatus.CLOSED);
      expect(result.conversation.assignedAdmin?.id).toBe('admin-1');
    });
  });
});
