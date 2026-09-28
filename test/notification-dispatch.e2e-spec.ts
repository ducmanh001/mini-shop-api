import { INestApplication } from '@nestjs/common';
import { getRepositoryToken } from '@nestjs/typeorm';
import { randomUUID } from 'crypto';
import { Repository } from 'typeorm';
import type { App } from 'supertest/types';
import { EmailNotification } from '../src/modules/notifications/entities/email-notification.entity';
import { EmailNotificationEventType } from '../src/modules/notifications/enums/email-notification-event-type.enum';
import { EmailNotificationStatus } from '../src/modules/notifications/enums/email-notification-status.enum';
import { NotificationDispatcherService } from '../src/modules/notifications/services/notification-dispatcher.service';
import { Order } from '../src/modules/orders/entities/order.entity';
import { User } from '../src/modules/users/entities/user.entity';
import { createTestApp } from './utils/create-test-app';

/**
 * Chứng minh outbox dispatcher end-to-end trên Redis/Postgres/SMTP (Mailpit) thật — không mock.
 * Gọi `dispatchPendingNotifications()` trực tiếp thay vì chờ `@Cron` thật (api-contract.md,
 * "Integration test queue"). `docker-compose up` (postgres/redis/mailpit) phải đang chạy.
 */
describe('Notification dispatch (e2e)', () => {
  let app: INestApplication<App>;
  let dispatcher: NotificationDispatcherService;
  let usersRepository: Repository<User>;
  let ordersRepository: Repository<Order>;
  let notificationsRepository: Repository<EmailNotification>;

  const REQUEST_HASH_FIXTURE = 'a'.repeat(64);

  beforeAll(async () => {
    app = await createTestApp();
    dispatcher = app.get(NotificationDispatcherService);
    usersRepository = app.get(getRepositoryToken(User));
    ordersRepository = app.get(getRepositoryToken(Order));
    notificationsRepository = app.get(getRepositoryToken(EmailNotification));
  });

  afterAll(async () => {
    if (app) {
      await app.close();
    }
  });

  async function createOrderFixture(): Promise<Order> {
    const user = usersRepository.create({
      email: `notif-dispatch-${randomUUID()}@example.test`,
      username: `test_${randomUUID().replace(/-/g, '').slice(0, 20)}`,
      passwordHash: 'not-a-real-hash',
    });
    await usersRepository.save(user);

    const order = ordersRepository.create({
      userId: user.id,
      totalVnd: '250000',
      recipientName: 'Nguyen Van A',
      phone: '0901234567',
      addressSnapshot: '123 Test Street',
      idempotencyKey: randomUUID(),
      requestHash: REQUEST_HASH_FIXTURE,
    });
    await ordersRepository.save(order);

    return order;
  }

  async function cleanupFixture(order: Order): Promise<void> {
    await notificationsRepository.delete({ orderId: order.id });
    await ordersRepository.delete({ id: order.id });
    await usersRepository.delete({ id: order.userId });
  }

  async function waitUntilNotSent(
    id: string,
    timeoutMs = 8000,
  ): Promise<EmailNotification> {
    const deadline = Date.now() + timeoutMs;
    for (;;) {
      const notification = await notificationsRepository.findOneOrFail({
        where: { id },
      });
      if (notification.status !== EmailNotificationStatus.PENDING) {
        return notification;
      }
      if (Date.now() > deadline) {
        throw new Error(
          `Notification ${id} is still PENDING after ${timeoutMs}ms`,
        );
      }
      await new Promise((resolve) => setTimeout(resolve, 200));
    }
  }

  it('sends an ORDER_PLACED email through real Redis/BullMQ/SMTP and marks it SENT', async () => {
    const order = await createOrderFixture();
    const notification = notificationsRepository.create({
      orderId: order.id,
      eventType: EmailNotificationEventType.ORDER_PLACED,
      recipientEmail: 'customer@example.test',
      locale: 'en',
      payload: { templateVersion: 1 },
    });
    await notificationsRepository.save(notification);

    try {
      await dispatcher.dispatchPendingNotifications();
      const sent = await waitUntilNotSent(notification.id);

      expect(sent.status).toBe(EmailNotificationStatus.SENT);
      expect(sent.sentAt).not.toBeNull();
      expect(sent.attempts).toBe(1);
    } finally {
      await cleanupFixture(order);
    }
  }, 15000);
});
