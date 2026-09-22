import { INestApplication } from '@nestjs/common';
import { getRepositoryToken } from '@nestjs/typeorm';
import { randomUUID } from 'crypto';
import { Repository } from 'typeorm';
import type { App } from 'supertest/types';
import { UserRole } from '../src/common/enums/user-role.enum';
import { EmailNotification } from '../src/modules/notifications/entities/email-notification.entity';
import { EmailNotificationEventType } from '../src/modules/notifications/enums/email-notification-event-type.enum';
import { MonthlyReportService } from '../src/modules/notifications/services/monthly-report.service';
import { Order } from '../src/modules/orders/entities/order.entity';
import { OrderStatus } from '../src/modules/orders/enums/order-status.enum';
import { User } from '../src/modules/users/entities/user.entity';
import { UserStatus } from '../src/modules/users/enums/user-status.enum';
import { createTestApp } from './utils/create-test-app';

/**
 * Chứng minh 2 điều unit test (mock) không chứng minh được: (1) ranh giới tháng `[from, to)` đúng
 * trên dữ liệu Postgres thật, và (2) unique constraint
 * `(recipient_email, event_type, report_period)` thật sự chặn trùng khi `runMonthlyReport` chạy 2
 * lần — không chỉ vì code gọi `.orIgnore()` đúng cú pháp.
 */
describe('Monthly revenue report (e2e)', () => {
  let app: INestApplication<App>;
  let monthlyReportService: MonthlyReportService;
  let usersRepository: Repository<User>;
  let ordersRepository: Repository<Order>;
  let notificationsRepository: Repository<EmailNotification>;

  const REQUEST_HASH_FIXTURE = 'a'.repeat(64);
  // 2026-09-30T17:10:00Z = 2026-10-01T00:10:00+07:00 — reports on September 2026,
  // range [2026-08-31T17:00:00Z, 2026-09-30T17:00:00Z).
  const referenceDate = new Date('2026-09-30T17:10:00.000Z');
  const rangeFrom = new Date('2026-08-31T17:00:00.000Z');
  const rangeTo = new Date('2026-09-30T17:00:00.000Z');
  const reportPeriod = '2026-09-01';

  const createdUserIds: string[] = [];
  const createdOrderIds: string[] = [];

  beforeAll(async () => {
    app = await createTestApp();
    monthlyReportService = app.get(MonthlyReportService);
    usersRepository = app.get(getRepositoryToken(User));
    ordersRepository = app.get(getRepositoryToken(Order));
    notificationsRepository = app.get(getRepositoryToken(EmailNotification));
  });

  afterAll(async () => {
    if (app) {
      await app.close();
    }
  });

  afterEach(async () => {
    await notificationsRepository.delete({
      eventType: EmailNotificationEventType.MONTHLY_REVENUE,
      reportPeriod,
    });
    if (createdOrderIds.length > 0) {
      await ordersRepository.delete(createdOrderIds.splice(0));
    }
    if (createdUserIds.length > 0) {
      await usersRepository.delete(createdUserIds.splice(0));
    }
  });

  async function createUser(overrides: Partial<User> = {}): Promise<User> {
    const suffix = randomUUID().replace(/-/g, '').slice(0, 20);
    const user = usersRepository.create({
      email: `monthly-report-${suffix}@example.test`,
      username: `mr_${suffix}`,
      passwordHash: 'not-a-real-hash',
      role: UserRole.CUSTOMER,
      status: UserStatus.ACTIVE,
      ...overrides,
    });
    const saved = await usersRepository.save(user);
    createdUserIds.push(saved.id);
    return saved;
  }

  async function createOrder(
    userId: string,
    overrides: Partial<Order> = {},
  ): Promise<Order> {
    const order = ordersRepository.create({
      userId,
      totalVnd: '100000',
      recipientName: 'Nguyen Van A',
      phone: '0901234567',
      addressSnapshot: '123 Test Street',
      idempotencyKey: randomUUID(),
      requestHash: REQUEST_HASH_FIXTURE,
      ...overrides,
    });
    const saved = await ordersRepository.save(order);
    createdOrderIds.push(saved.id);
    return saved;
  }

  it('sums only COMPLETED orders whose completedAt falls in the half-open [from, to) range', async () => {
    const customer = await createUser();
    const admin = await createUser({
      role: UserRole.ADMIN,
      status: UserStatus.ACTIVE,
    });
    // Included: exactly at the inclusive lower bound, and one in the middle of the month.
    await createOrder(customer.id, {
      status: OrderStatus.COMPLETED,
      completedAt: rangeFrom,
      totalVnd: '111111',
    });
    await createOrder(customer.id, {
      status: OrderStatus.COMPLETED,
      completedAt: new Date('2026-09-15T10:00:00.000Z'),
      totalVnd: '222222',
    });
    // Excluded: exactly at the exclusive upper bound, 1ms before the lower bound, and not COMPLETED.
    await createOrder(customer.id, {
      status: OrderStatus.COMPLETED,
      completedAt: rangeTo,
      totalVnd: '999999999',
    });
    await createOrder(customer.id, {
      status: OrderStatus.COMPLETED,
      completedAt: new Date(rangeFrom.getTime() - 1),
      totalVnd: '999999999',
    });
    await createOrder(customer.id, { totalVnd: '999999999' }); // PENDING, no completedAt

    await monthlyReportService.runMonthlyReport(referenceDate);

    const notification = await notificationsRepository.findOneOrFail({
      where: { recipientEmail: admin.email, reportPeriod },
    });
    expect(notification.payload).toEqual({
      templateVersion: 1,
      totalRevenueVnd: '333333',
    });
  });

  it('creates exactly one notification per admin even when run twice for the same period', async () => {
    // Không đếm toàn bộ event MONTHLY_REVENUE của kỳ này — DB test còn `seed_bob` (ADMIN/ACTIVE cố
    // định dùng chung nhiều e2e spec khác, xem test/utils/seed-database.ts) cũng hợp lệ nhận 1 dòng
    // mỗi lần job chạy; đếm không giới hạn theo admin sẽ luôn ra >1 dù cơ chế idempotent đúng.
    const admin = await createUser({
      role: UserRole.ADMIN,
      status: UserStatus.ACTIVE,
    });

    await monthlyReportService.runMonthlyReport(referenceDate);
    await monthlyReportService.runMonthlyReport(referenceDate);

    const count = await notificationsRepository.count({
      where: {
        eventType: EmailNotificationEventType.MONTHLY_REVENUE,
        recipientEmail: admin.email,
        reportPeriod,
      },
    });
    expect(count).toBe(1);
  });

  it('notifies every ACTIVE admin but not inactive admins or customers', async () => {
    const activeAdmin = await createUser({
      role: UserRole.ADMIN,
      status: UserStatus.ACTIVE,
    });
    const inactiveAdmin = await createUser({
      role: UserRole.ADMIN,
      status: UserStatus.INACTIVE,
    });
    const customer = await createUser({
      role: UserRole.CUSTOMER,
      status: UserStatus.ACTIVE,
    });

    await monthlyReportService.runMonthlyReport(referenceDate);

    const recipients = (
      await notificationsRepository.find({
        select: { recipientEmail: true },
        where: {
          eventType: EmailNotificationEventType.MONTHLY_REVENUE,
          reportPeriod,
        },
      })
    ).map((n) => n.recipientEmail);
    expect(recipients).toContain(activeAdmin.email);
    expect(recipients).not.toContain(inactiveAdmin.email);
    expect(recipients).not.toContain(customer.email);
  });
});
