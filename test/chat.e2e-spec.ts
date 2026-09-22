import { INestApplication } from '@nestjs/common';
import { getRepositoryToken } from '@nestjs/typeorm';
import * as bcrypt from 'bcrypt';
import { randomUUID } from 'crypto';
import type { Server } from 'http';
import type { AddressInfo } from 'net';
import { io, Socket } from 'socket.io-client';
import request from 'supertest';
import type { App } from 'supertest/types';
import { Repository } from 'typeorm';
import { UserRole } from '../src/common/enums/user-role.enum';
import { CHAT_WS_NAMESPACE } from '../src/modules/chat/constants/chat.constants';
import { ChatConversation } from '../src/modules/chat/entities/chat-conversation.entity';
import { ChatMessage } from '../src/modules/chat/entities/chat-message.entity';
import { SALT_ROUNDS } from '../src/modules/users/constants/users.constants';
import { User } from '../src/modules/users/entities/user.entity';
import { UserStatus } from '../src/modules/users/enums/user-status.enum';
import { createTestApp } from './utils/create-test-app';
import { SEED_BOB_EMAIL, SEED_PASSWORD } from './utils/seed-database';

interface ConversationBody {
  conversation: {
    id: string;
    customer: { id: string; username: string };
    assignedAdmin: { id: string; username: string } | null;
    status: 'OPEN' | 'CLOSED';
    lastMessageAt: string | null;
    createdAt: string;
  };
}

interface ConversationsBody {
  conversations: ConversationBody['conversation'][] & { unreadCount: number }[];
  conversationsCount: number;
}

interface MessageBody {
  message: {
    id: string;
    conversationId: string;
    senderId: string;
    body: string;
    readAt: string | null;
    createdAt: string;
  };
}

interface MessagesBody {
  messages: MessageBody['message'][];
  nextCursor: string | null;
}

type JoinAck =
  | { ok: true }
  | { ok: false; code: 'UNAUTHORIZED' | 'NOT_FOUND' | 'CONVERSATION_CLOSED' };

/** CHAT-01..07 (PR15) end-to-end: REST conversations/messages + WebSocket join/broadcast. */
describe('Chat (e2e)', () => {
  let app: INestApplication<App>;
  let usersRepository: Repository<User>;
  let conversationsRepository: Repository<ChatConversation>;
  let messagesRepository: Repository<ChatMessage>;
  let baseWsUrl: string;
  const openSockets: Socket[] = [];

  beforeAll(async () => {
    app = await createTestApp({ listen: true });
    usersRepository = app.get(getRepositoryToken(User));
    conversationsRepository = app.get(getRepositoryToken(ChatConversation));
    messagesRepository = app.get(getRepositoryToken(ChatMessage));
    const httpServer = app.getHttpServer() as Server;
    const address = httpServer.address() as AddressInfo;
    baseWsUrl = `http://127.0.0.1:${address.port}`;
  });

  afterEach(() => {
    for (const socket of openSockets) {
      socket.disconnect();
    }
    openSockets.length = 0;
  });

  afterAll(async () => {
    if (app) {
      await app.close();
    }
  });

  async function loginAs(email: string): Promise<string> {
    const response = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email, password: SEED_PASSWORD })
      .expect(200);
    return (response.body as { user: { token: string } }).user.token;
  }

  function uniqueSuffix(): string {
    return randomUUID().replace(/-/g, '').slice(0, 10);
  }

  async function createCustomerToken(): Promise<string> {
    const suffix = uniqueSuffix();
    const email = `chat-customer-${suffix}@example.test`;
    const passwordHash = await bcrypt.hash(SEED_PASSWORD, SALT_ROUNDS);
    await usersRepository.save(
      usersRepository.create({
        email,
        username: `chat_customer_${suffix}`,
        passwordHash,
        role: UserRole.CUSTOMER,
        status: UserStatus.ACTIVE,
        emailVerifiedAt: new Date(),
      }),
    );
    return loginAs(email);
  }

  async function createAdminAccount(): Promise<{
    token: string;
    adminId: string;
  }> {
    const suffix = uniqueSuffix();
    const email = `chat-admin-${suffix}@example.test`;
    const passwordHash = await bcrypt.hash(SEED_PASSWORD, SALT_ROUNDS);
    const admin = await usersRepository.save(
      usersRepository.create({
        email,
        username: `chat_admin_${suffix}`,
        passwordHash,
        role: UserRole.ADMIN,
        status: UserStatus.ACTIVE,
        emailVerifiedAt: new Date(),
      }),
    );
    return { token: await loginAs(email), adminId: admin.id };
  }

  function openConversation(token: string) {
    return request(app.getHttpServer())
      .post('/api/v1/chat/conversations')
      .set('Authorization', `Bearer ${token}`)
      .send();
  }

  function sendMessage(
    token: string,
    conversationId: string,
    body: string,
    idempotencyKey: string,
  ) {
    return request(app.getHttpServer())
      .post(`/api/v1/chat/conversations/${conversationId}/messages`)
      .set('Authorization', `Bearer ${token}`)
      .set('Idempotency-Key', idempotencyKey)
      .send({ body });
  }

  function listMessages(
    token: string,
    conversationId: string,
    query: Record<string, string | number> = {},
  ) {
    return request(app.getHttpServer())
      .get(`/api/v1/chat/conversations/${conversationId}/messages`)
      .query(query)
      .set('Authorization', `Bearer ${token}`);
  }

  function adminListConversations(
    token: string,
    query: Record<string, string | number> = {},
  ) {
    return request(app.getHttpServer())
      .get('/api/v1/admin/chat/conversations')
      .query(query)
      .set('Authorization', `Bearer ${token}`);
  }

  function adminUpdateConversation(
    token: string,
    conversationId: string,
    body: Record<string, unknown>,
  ) {
    return request(app.getHttpServer())
      .patch(`/api/v1/admin/chat/conversations/${conversationId}`)
      .set('Authorization', `Bearer ${token}`)
      .send(body);
  }

  function connectSocket(token: string): Socket {
    const socket = io(`${baseWsUrl}${CHAT_WS_NAMESPACE}`, {
      auth: { token },
      transports: ['websocket'],
      reconnection: false,
    });
    openSockets.push(socket);
    return socket;
  }

  function waitForConnect(socket: Socket, timeoutMs = 3000): Promise<void> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(
        () => reject(new Error('Timed out waiting for connect')),
        timeoutMs,
      );
      socket.once('connect', () => {
        clearTimeout(timer);
        resolve();
      });
    });
  }

  function waitForDisconnect(socket: Socket, timeoutMs = 3000): Promise<void> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(
        () => reject(new Error('Timed out waiting for disconnect')),
        timeoutMs,
      );
      socket.once('disconnect', () => {
        clearTimeout(timer);
        resolve();
      });
    });
  }

  function joinConversation(
    socket: Socket,
    conversationId: string,
  ): Promise<JoinAck> {
    return new Promise((resolve) => {
      socket.emit('conversation.join', { conversationId }, (ack: JoinAck) =>
        resolve(ack),
      );
    });
  }

  function waitForMessageCreated(
    socket: Socket,
    timeoutMs = 3000,
  ): Promise<MessageBody> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(
        () => reject(new Error('Timed out waiting for chat.message.created')),
        timeoutMs,
      );
      socket.once('chat.message.created', (payload: MessageBody) => {
        clearTimeout(timer);
        resolve(payload);
      });
    });
  }

  describe('CHAT-01 open conversation', () => {
    it('rejects a request without a token with 401', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/chat/conversations')
        .send()
        .expect(401);
    });

    it('rejects an ADMIN token with 403', async () => {
      const adminToken = await loginAs(SEED_BOB_EMAIL);
      await openConversation(adminToken).expect(403);
    });

    it('creates a new OPEN conversation with 201', async () => {
      const token = await createCustomerToken();

      const response = await openConversation(token).expect(201);

      const body = response.body as ConversationBody;
      expect(body.conversation.status).toBe('OPEN');
      expect(body.conversation.assignedAdmin).toBeNull();
    });

    it('returns the same OPEN conversation with 200 on a repeat call', async () => {
      const token = await createCustomerToken();

      const first = await openConversation(token).expect(201);
      const second = await openConversation(token).expect(200);

      expect((second.body as ConversationBody).conversation.id).toBe(
        (first.body as ConversationBody).conversation.id,
      );
    });

    it('resolves two concurrent open calls into exactly one conversation row', async () => {
      const token = await createCustomerToken();

      const [first, second] = await Promise.all([
        openConversation(token),
        openConversation(token),
      ]);

      expect([first.status, second.status].sort()).toEqual([200, 201]);
      const firstBody = first.body as ConversationBody;
      const secondBody = second.body as ConversationBody;
      expect(firstBody.conversation.id).toBe(secondBody.conversation.id);

      const count = await conversationsRepository.count({
        where: { customerId: firstBody.conversation.customer.id },
      });
      expect(count).toBe(1);
    });
  });

  describe('CHAT-02 get my conversation', () => {
    it('returns 404 when the customer has not opened a conversation yet', async () => {
      const token = await createCustomerToken();

      await request(app.getHttpServer())
        .get('/api/v1/chat/conversations/me')
        .set('Authorization', `Bearer ${token}`)
        .expect(404);
    });

    it('returns the OPEN conversation once opened', async () => {
      const token = await createCustomerToken();
      await openConversation(token).expect(201);

      const response = await request(app.getHttpServer())
        .get('/api/v1/chat/conversations/me')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect((response.body as ConversationBody).conversation.status).toBe(
        'OPEN',
      );
    });
  });

  describe('CHAT-03/CHAT-04 messages', () => {
    it('lets the owning customer send and read their own conversation, and rejects a different customer with 404', async () => {
      const token = await createCustomerToken();
      const otherToken = await createCustomerToken();
      const opened = await openConversation(token).expect(201);
      const conversationId = (opened.body as ConversationBody).conversation.id;

      await sendMessage(token, conversationId, 'hello', randomUUID()).expect(
        201,
      );
      await listMessages(token, conversationId).expect(200);

      await sendMessage(otherToken, conversationId, 'hi', randomUUID()).expect(
        404,
      );
      await listMessages(otherToken, conversationId).expect(404);
    });

    it('lets any ADMIN (not just an assigned one) read and send in a customer’s conversation', async () => {
      const token = await createCustomerToken();
      const { token: adminToken } = await createAdminAccount();
      const opened = await openConversation(token).expect(201);
      const conversationId = (opened.body as ConversationBody).conversation.id;

      await sendMessage(
        adminToken,
        conversationId,
        'how can we help?',
        randomUUID(),
      ).expect(201);
      const history = await listMessages(adminToken, conversationId).expect(
        200,
      );
      expect((history.body as MessagesBody).messages).toHaveLength(1);
    });

    it('requires an Idempotency-Key header (400 when missing)', async () => {
      const token = await createCustomerToken();
      const opened = await openConversation(token).expect(201);
      const conversationId = (opened.body as ConversationBody).conversation.id;

      await request(app.getHttpServer())
        .post(`/api/v1/chat/conversations/${conversationId}/messages`)
        .set('Authorization', `Bearer ${token}`)
        .send({ body: 'hello' })
        .expect(400);
    });

    it('rejects sending to a CLOSED conversation with 409', async () => {
      const token = await createCustomerToken();
      const adminToken = await loginAs(SEED_BOB_EMAIL);
      const opened = await openConversation(token).expect(201);
      const conversationId = (opened.body as ConversationBody).conversation.id;
      await adminUpdateConversation(adminToken, conversationId, {
        status: 'CLOSED',
      }).expect(200);

      await sendMessage(
        token,
        conversationId,
        'still there?',
        randomUUID(),
      ).expect(409);
    });

    describe('idempotency replay', () => {
      it('returns the same message with 200 when the same key + body is replayed', async () => {
        const token = await createCustomerToken();
        const opened = await openConversation(token).expect(201);
        const conversationId = (opened.body as ConversationBody).conversation
          .id;
        const idempotencyKey = randomUUID();

        const first = await sendMessage(
          token,
          conversationId,
          'hello',
          idempotencyKey,
        ).expect(201);
        const second = await sendMessage(
          token,
          conversationId,
          'hello',
          idempotencyKey,
        ).expect(200);

        expect((second.body as MessageBody).message.id).toBe(
          (first.body as MessageBody).message.id,
        );
      });

      it('returns 409 when the same key is replayed with a different body', async () => {
        const token = await createCustomerToken();
        const opened = await openConversation(token).expect(201);
        const conversationId = (opened.body as ConversationBody).conversation
          .id;
        const idempotencyKey = randomUUID();

        await sendMessage(
          token,
          conversationId,
          'hello',
          idempotencyKey,
        ).expect(201);
        await sendMessage(
          token,
          conversationId,
          'a different message',
          idempotencyKey,
        ).expect(409);
      });

      it('resolves two concurrent requests with the same key+body into exactly one message', async () => {
        const token = await createCustomerToken();
        const opened = await openConversation(token).expect(201);
        const conversationId = (opened.body as ConversationBody).conversation
          .id;
        const idempotencyKey = randomUUID();

        const [first, second] = await Promise.all([
          sendMessage(token, conversationId, 'hello', idempotencyKey),
          sendMessage(token, conversationId, 'hello', idempotencyKey),
        ]);

        expect([first.status, second.status].sort()).toEqual([200, 201]);
        const count = await messagesRepository.count({
          where: { conversationId },
        });
        expect(count).toBe(1);
      });
    });

    describe('cursor pagination', () => {
      it('pages through all messages sent back-to-back with no gaps or duplicates', async () => {
        const token = await createCustomerToken();
        const opened = await openConversation(token).expect(201);
        const conversationId = (opened.body as ConversationBody).conversation
          .id;
        const bodies = Array.from({ length: 5 }, (_, i) => `message ${i}`);
        for (const body of bodies) {
          await sendMessage(token, conversationId, body, randomUUID()).expect(
            201,
          );
        }

        const collected: MessageBody['message'][] = [];
        let cursor: string | undefined;
        for (let page = 0; page < 10; page += 1) {
          const response = await listMessages(token, conversationId, {
            limit: 2,
            ...(cursor ? { cursor } : {}),
          }).expect(200);
          const { messages, nextCursor } = response.body as MessagesBody;
          collected.push(...messages);
          if (!nextCursor) {
            break;
          }
          cursor = nextCursor;
        }

        expect(collected).toHaveLength(bodies.length);
        expect(new Set(collected.map((m) => m.id)).size).toBe(bodies.length);
        expect(new Set(collected.map((m) => m.body))).toEqual(new Set(bodies));
      });
    });

    it('marks the other party’s messages as read when history is fetched', async () => {
      const token = await createCustomerToken();
      const adminToken = await loginAs(SEED_BOB_EMAIL);
      const opened = await openConversation(token).expect(201);
      const conversationId = (opened.body as ConversationBody).conversation.id;
      // unreadCount (CHAT-05) counts CUSTOMER-sent messages the admin side hasn't read yet, so the
      // customer must be the sender here and the admin the one who reads (mark-as-read is a
      // side effect of the *reader's* GET, not the sender's POST).
      await sendMessage(token, conversationId, 'hi there', randomUUID()).expect(
        201,
      );

      const beforeRead = await adminListConversations(adminToken).expect(200);
      const beforeEntry = (
        beforeRead.body as ConversationsBody
      ).conversations.find((c) => c.id === conversationId);
      expect(beforeEntry?.unreadCount).toBe(1);

      await listMessages(adminToken, conversationId).expect(200);

      const afterRead = await adminListConversations(adminToken).expect(200);
      const afterEntry = (
        afterRead.body as ConversationsBody
      ).conversations.find((c) => c.id === conversationId);
      expect(afterEntry?.unreadCount).toBe(0);
    });
  });

  describe('CHAT-05/CHAT-06 admin inbox', () => {
    it('rejects a CUSTOMER token with 403 on both endpoints', async () => {
      const token = await createCustomerToken();

      await adminListConversations(token).expect(403);
      await adminUpdateConversation(token, randomUUID(), {
        status: 'CLOSED',
      }).expect(403);
    });

    it('sorts conversations by lastMessageAt DESC, id DESC', async () => {
      const adminToken = await loginAs(SEED_BOB_EMAIL);
      const tokenA = await createCustomerToken();
      const tokenB = await createCustomerToken();
      const openedA = await openConversation(tokenA).expect(201);
      const openedB = await openConversation(tokenB).expect(201);
      await sendMessage(
        tokenA,
        (openedA.body as ConversationBody).conversation.id,
        'first',
        randomUUID(),
      ).expect(201);
      await sendMessage(
        tokenB,
        (openedB.body as ConversationBody).conversation.id,
        'second',
        randomUUID(),
      ).expect(201);

      const response = await adminListConversations(adminToken, {
        limit: 2,
      }).expect(200);
      const ids = (response.body as ConversationsBody).conversations.map(
        (c) => c.id,
      );
      expect(ids[0]).toBe((openedB.body as ConversationBody).conversation.id);
    });

    it('assigns an ACTIVE ADMIN and rejects assigning a non-admin with 400', async () => {
      const adminToken = await loginAs(SEED_BOB_EMAIL);
      const { adminId } = await createAdminAccount();
      const customerToken = await createCustomerToken();
      const opened = await openConversation(customerToken).expect(201);
      const conversation = (opened.body as ConversationBody).conversation;

      const assigned = await adminUpdateConversation(
        adminToken,
        conversation.id,
        { assignedAdminId: adminId },
      ).expect(200);
      expect(
        (assigned.body as ConversationBody).conversation.assignedAdmin?.id,
      ).toBe(adminId);

      await adminUpdateConversation(adminToken, conversation.id, {
        assignedAdminId: conversation.customer.id,
      }).expect(400);

      await adminUpdateConversation(adminToken, conversation.id, {
        assignedAdminId: randomUUID(),
      }).expect(404);
    });

    it('rejects reopening a CLOSED conversation when the customer already has another OPEN one, with 409', async () => {
      const adminToken = await loginAs(SEED_BOB_EMAIL);
      const token = await createCustomerToken();
      const firstOpened = await openConversation(token).expect(201);
      const firstId = (firstOpened.body as ConversationBody).conversation.id;
      await adminUpdateConversation(adminToken, firstId, {
        status: 'CLOSED',
      }).expect(200);
      await openConversation(token).expect(201); // opens a second, new OPEN conversation

      await adminUpdateConversation(adminToken, firstId, {
        status: 'OPEN',
      }).expect(409);
    });

    it('returns 400 when neither assignedAdminId nor status is given', async () => {
      const adminToken = await loginAs(SEED_BOB_EMAIL);
      const token = await createCustomerToken();
      const opened = await openConversation(token).expect(201);

      await adminUpdateConversation(
        adminToken,
        (opened.body as ConversationBody).conversation.id,
        {},
      ).expect(400);
    });
  });

  describe('CHAT-07 WebSocket', () => {
    it('disconnects a handshake with an invalid token', async () => {
      const socket = connectSocket('not-a-real-jwt');

      await waitForDisconnect(socket);
    });

    it('joins the socket’s own conversation even when the join is emitted immediately after connecting (auth race)', async () => {
      const token = await createCustomerToken();
      const opened = await openConversation(token).expect(201);
      const conversationId = (opened.body as ConversationBody).conversation.id;

      const socket = connectSocket(token);
      const ack = await joinConversation(socket, conversationId);

      expect(ack).toEqual({ ok: true });
    });

    it('rejects joining a conversation owned by a different customer', async () => {
      const token = await createCustomerToken();
      const otherToken = await createCustomerToken();
      const opened = await openConversation(token).expect(201);
      const conversationId = (opened.body as ConversationBody).conversation.id;

      const socket = connectSocket(otherToken);
      await waitForConnect(socket);
      const ack = await joinConversation(socket, conversationId);

      expect(ack).toEqual({ ok: false, code: 'NOT_FOUND' });
    });

    it('rejects joining a CLOSED conversation', async () => {
      const token = await createCustomerToken();
      const adminToken = await loginAs(SEED_BOB_EMAIL);
      const opened = await openConversation(token).expect(201);
      const conversationId = (opened.body as ConversationBody).conversation.id;
      await adminUpdateConversation(adminToken, conversationId, {
        status: 'CLOSED',
      }).expect(200);

      const socket = connectSocket(token);
      await waitForConnect(socket);
      const ack = await joinConversation(socket, conversationId);

      expect(ack).toEqual({ ok: false, code: 'CONVERSATION_CLOSED' });
    });

    it('broadcasts chat.message.created to a joined room after a REST send commits', async () => {
      const token = await createCustomerToken();
      const adminToken = await loginAs(SEED_BOB_EMAIL);
      const opened = await openConversation(token).expect(201);
      const conversationId = (opened.body as ConversationBody).conversation.id;

      const socket = connectSocket(token);
      await waitForConnect(socket);
      const ack = await joinConversation(socket, conversationId);
      expect(ack).toEqual({ ok: true });

      const waitForBroadcast = waitForMessageCreated(socket);
      await sendMessage(
        adminToken,
        conversationId,
        'delivered over websocket',
        randomUUID(),
      ).expect(201);

      const payload = await waitForBroadcast;
      expect(payload.message.conversationId).toBe(conversationId);
      expect(payload.message.body).toBe('delivered over websocket');
    });
  });
});
