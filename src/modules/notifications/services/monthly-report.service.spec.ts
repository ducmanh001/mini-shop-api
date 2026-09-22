import { ConfigService } from '@nestjs/config';
import { DataSource } from 'typeorm';
import { UserRole } from '../../../common/enums/user-role.enum';
import { Order } from '../../orders/entities/order.entity';
import { OrderStatus } from '../../orders/enums/order-status.enum';
import { User } from '../../users/entities/user.entity';
import { UserStatus } from '../../users/enums/user-status.enum';
import { EmailNotification } from '../entities/email-notification.entity';
import { EmailNotificationEventType } from '../enums/email-notification-event-type.enum';
import { MonthlyReportService } from './monthly-report.service';

function mockInsertQueryBuilder() {
  const builder: Record<string, jest.Mock> = {};
  for (const method of ['insert', 'into', 'values', 'orIgnore']) {
    builder[method] = jest.fn().mockReturnThis();
  }
  builder.execute = jest
    .fn()
    .mockResolvedValue({ identifiers: [], generatedMaps: [], raw: [] });
  return builder;
}

describe('MonthlyReportService', () => {
  let config: { get: jest.Mock };
  let userRepository: { find: jest.Mock };
  let orderQueryBuilder: Record<string, jest.Mock>;
  let notificationInsertBuilder: ReturnType<typeof mockInsertQueryBuilder>;
  let dataSource: { getRepository: jest.Mock };
  let service: MonthlyReportService;

  // 2026-09-30T17:10:00Z = 2026-10-01T00:10:00+07:00 (cron tick for the October run, reports Sept)
  const referenceDate = new Date('2026-09-30T17:10:00.000Z');

  beforeEach(() => {
    config = { get: jest.fn() };
    userRepository = {
      find: jest.fn().mockResolvedValue([
        { id: 'admin-1', email: 'admin1@example.test' },
        { id: 'admin-2', email: 'admin2@example.test' },
      ]),
    };
    orderQueryBuilder = {
      select: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      getRawOne: jest.fn().mockResolvedValue({ total: '5000000' }),
    };
    notificationInsertBuilder = mockInsertQueryBuilder();

    dataSource = {
      getRepository: jest.fn((entity: { name: string }) => {
        if (entity.name === User.name) {
          return userRepository;
        }
        if (entity.name === Order.name) {
          return { createQueryBuilder: jest.fn(() => orderQueryBuilder) };
        }
        if (entity.name === EmailNotification.name) {
          return {
            createQueryBuilder: jest.fn(() => notificationInsertBuilder),
          };
        }
        throw new Error(`unexpected entity requested: ${entity.name}`);
      }),
    };

    service = new MonthlyReportService(
      dataSource as unknown as DataSource,
      config as unknown as ConfigService,
    );
  });

  describe('handleCron', () => {
    it('does nothing in the test environment', async () => {
      config.get.mockReturnValue('test');

      await service.handleCron();

      expect(userRepository.find).not.toHaveBeenCalled();
    });

    it('runs the report outside the test environment', async () => {
      config.get.mockReturnValue('production');

      await service.handleCron();

      expect(userRepository.find).toHaveBeenCalled();
    });
  });

  describe('runMonthlyReport', () => {
    it('queries only ACTIVE admins', async () => {
      await service.runMonthlyReport(referenceDate);

      expect(userRepository.find).toHaveBeenCalledWith({
        select: { id: true, email: true },
        where: { role: UserRole.ADMIN, status: UserStatus.ACTIVE },
      });
    });

    it('sums COMPLETED order revenue within the previous Bangkok month, half-open range', async () => {
      await service.runMonthlyReport(referenceDate);

      expect(orderQueryBuilder.where).toHaveBeenCalledWith(
        'order.status = :status',
        {
          status: OrderStatus.COMPLETED,
        },
      );
      const [, params] = orderQueryBuilder.andWhere.mock.calls[0] as [
        string,
        { from: Date; to: Date },
      ];
      expect(params.from.toISOString()).toBe('2026-08-31T17:00:00.000Z');
      expect(params.to.toISOString()).toBe('2026-09-30T17:00:00.000Z');
    });

    it('inserts one MONTHLY_REVENUE row per admin with ON CONFLICT DO NOTHING semantics', async () => {
      await service.runMonthlyReport(referenceDate);

      expect(notificationInsertBuilder.orIgnore).toHaveBeenCalled();
      const [values] = notificationInsertBuilder.values.mock.calls[0] as [
        Record<string, unknown>[],
      ];
      expect(values).toHaveLength(2);
      expect(values).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            eventType: EmailNotificationEventType.MONTHLY_REVENUE,
            recipientEmail: 'admin1@example.test',
            reportPeriod: '2026-09-01',
            payload: { templateVersion: 1, totalRevenueVnd: '5000000' },
          }),
          expect.objectContaining({
            recipientEmail: 'admin2@example.test',
          }),
        ]),
      );
    });

    it('skips both the revenue query and the insert when there are no ACTIVE admins', async () => {
      userRepository.find.mockResolvedValue([]);

      await service.runMonthlyReport(referenceDate);

      expect(orderQueryBuilder.getRawOne).not.toHaveBeenCalled();
      expect(notificationInsertBuilder.execute).not.toHaveBeenCalled();
    });

    it('skips a re-entrant call while a previous run is still in progress', async () => {
      let resolveFirstFind: (
        value: { id: string; email: string }[],
      ) => void = () => undefined;
      userRepository.find.mockReturnValueOnce(
        new Promise((resolve) => {
          resolveFirstFind = resolve;
        }),
      );

      const firstRun = service.runMonthlyReport(referenceDate);
      const secondRun = service.runMonthlyReport(referenceDate);
      resolveFirstFind([]);
      await Promise.all([firstRun, secondRun]);

      expect(userRepository.find).toHaveBeenCalledTimes(1);
    });
  });
});
