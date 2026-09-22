import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron } from '@nestjs/schedule';
import { randomUUID } from 'crypto';
import { DataSource } from 'typeorm';
import { UserRole } from '../../../common/enums/user-role.enum';
import { Order } from '../../orders/entities/order.entity';
import { OrderStatus } from '../../orders/enums/order-status.enum';
import { User } from '../../users/entities/user.entity';
import { UserStatus } from '../../users/enums/user-status.enum';
import { MONTHLY_REPORT_CRON_EXPRESSION } from '../constants/notifications.constants';
import { EmailNotification } from '../entities/email-notification.entity';
import { EmailNotificationEventType } from '../enums/email-notification-event-type.enum';
import { getPreviousMonthBangkokRange } from '../utils/monthly-report-period.util';

/**
 * SYS-04 — tạo intent `MONTHLY_REVENUE` cho từng ADMIN ACTIVE; không tự gửi mail (dispatcher/worker
 * chung của PR05 đảm nhiệm, xem `NotificationDispatcherService`). Không phải bestseller/revenue API
 * đầy đủ — đó là phần riêng, ngoài phạm vi PR này.
 */
@Injectable()
export class MonthlyReportService {
  private readonly logger = new Logger(MonthlyReportService.name);
  private isRunning = false;

  constructor(
    private readonly dataSource: DataSource,
    private readonly config: ConfigService,
  ) {}

  @Cron(MONTHLY_REPORT_CRON_EXPRESSION)
  async handleCron(): Promise<void> {
    // Cùng lý do với NotificationDispatcherService.handleCron() — tắt tick thật trong test env, test
    // tự gọi runMonthlyReport() với clock cố định để kiểm soát ranh giới tháng.
    if (this.config.get<string>('NODE_ENV') === 'test') {
      return;
    }
    await this.runMonthlyReport();
  }

  /**
   * Public + nhận `referenceDate` để test gọi trực tiếp với clock cố định, không chờ cron thật
   * (api-contract.md mục "Statistics và monthly revenue").
   */
  async runMonthlyReport(referenceDate: Date = new Date()): Promise<void> {
    if (this.isRunning) {
      this.logger.warn(
        'Previous monthly report run is still in progress, skipping this tick',
      );
      return;
    }
    this.isRunning = true;
    try {
      const { from, to, reportPeriod } =
        getPreviousMonthBangkokRange(referenceDate);

      // Không LIMIT/phân trang — khác `NotificationDispatcherService` (giới hạn 50 vì hàng đợi
      // PENDING có thể tăng không giới hạn), số ADMIN ACTIVE luôn nhỏ và không tăng theo tải hệ
      // thống, không cần giới hạn batch (mục 25 CODING_STANDARD.md).
      const admins = await this.dataSource.getRepository(User).find({
        select: { id: true, email: true },
        where: { role: UserRole.ADMIN, status: UserStatus.ACTIVE },
      });
      if (admins.length === 0) {
        this.logger.log(
          `No ACTIVE admin to notify for report period ${reportPeriod}`,
        );
        return;
      }

      const totalRevenueVnd = await this.sumCompletedRevenue(from, to);
      // `id` phải tự sinh ở đây — object literal thô đi qua QueryBuilder không chạy field
      // initializer của `UuidBaseEntity` (chỉ chạy khi `new EmailNotification()`/`.create()` thật
      // sự được gọi), nên nếu bỏ qua sẽ insert `id = NULL` (vi phạm NOT NULL). Không dùng
      // `.create()` ở đây vì entity instance thật lại không khớp kiểu `payload` mà `.values()` của
      // QueryBuilder đòi hỏi cho cột jsonb — object literal + `id` tường minh là cách đơn giản nhất
      // thoả cả hai.
      const rows = admins.map((admin) => ({
        id: randomUUID(),
        eventType: EmailNotificationEventType.MONTHLY_REVENUE,
        recipientEmail: admin.email,
        reportPeriod,
        // Cron không có request/Accept-Language để `resolveLocale()` kiểu OrdersService dùng
        // (I18nContext.current() luôn null ngoài luồng HTTP) — mặc định 'vi' cho báo cáo nội bộ.
        locale: 'vi' as const,
        payload: { templateVersion: 1, totalRevenueVnd },
      }));

      // Bulk insert + ON CONFLICT DO NOTHING (`.orIgnore()`): idempotent kể cả khi tick chạy 2 lần
      // hoặc nhiều instance app bắn cron cùng lúc — unique (recipient_email, event_type,
      // report_period) đã bảo vệ đủ ở tầng DB, nên không cần thêm advisory lock Postgres (mục 25
      // CODING_STANDARD.md gợi ý cho trường hợp bản thân cơ chế ghi chưa tự idempotent).
      await this.dataSource
        .getRepository(EmailNotification)
        .createQueryBuilder()
        .insert()
        .into(EmailNotification)
        .values(rows)
        .orIgnore()
        .execute();

      this.logger.log(
        `Created MONTHLY_REVENUE intent(s) for report period ${reportPeriod} (${admins.length} admin(s))`,
      );
    } finally {
      this.isRunning = false;
    }
  }

  private async sumCompletedRevenue(from: Date, to: Date): Promise<string> {
    const row = await this.dataSource
      .getRepository(Order)
      .createQueryBuilder('order')
      .select('COALESCE(SUM(order.totalVnd), 0)', 'total')
      .where('order.status = :status', { status: OrderStatus.COMPLETED })
      .andWhere('order.completedAt >= :from AND order.completedAt < :to', {
        from,
        to,
      })
      .getRawOne<{ total: string }>();
    return row?.total ?? '0';
  }
}
