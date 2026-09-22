import { ConfigService } from '@nestjs/config';
import { I18nService } from 'nestjs-i18n';
import { encryptNotificationSecret } from '../../../common/utils/notification-secret-cipher.util';
import { Order } from '../../orders/entities/order.entity';
import { EmailNotification } from '../entities/email-notification.entity';
import { EmailNotificationEventType } from '../enums/email-notification-event-type.enum';
import { MailContentBuilderService } from './mail-content-builder.service';

describe('MailContentBuilderService', () => {
  const secretKey = Buffer.alloc(32, 7);
  let i18n: { t: jest.Mock };
  let config: { getOrThrow: jest.Mock };
  let service: MailContentBuilderService;

  const translations: Record<string, string> = {
    'mail.emailVerification.subject': 'Verify your Mini Shop account',
    'mail.emailVerification.greeting': 'Hello {username},',
    'mail.emailVerification.instruction': 'Please verify your email.',
    'mail.emailVerification.ctaLabel': 'Verify email',
    'mail.emailVerification.footer': 'Ignore if not you.',
    'mail.orderPlaced.subject': 'Order {orderId} has been placed',
    'mail.orderPlaced.greeting': 'Hello {recipientName},',
    'mail.orderPlaced.body': 'Order {orderId} total {totalVnd} VND.',
    'mail.orderPlaced.footer': 'Check your account for status.',
    'mail.orderRejected.subject': 'Order {orderId} has been rejected',
    'mail.orderRejected.greeting': 'Hello {recipientName},',
    'mail.orderRejected.body': 'Rejected: {rejectionReason}',
    'mail.orderRejected.footer': 'Contact support.',
    'mail.monthlyRevenue.subject': 'Monthly revenue report — {period}',
    'mail.monthlyRevenue.greeting': 'Hello Admin,',
    'mail.monthlyRevenue.body':
      'Total revenue in {period} was {totalRevenueVnd} VND.',
    'mail.monthlyRevenue.footer': 'This is an automated monthly report.',
  };

  beforeEach(() => {
    i18n = { t: jest.fn((key: string) => translations[key] ?? key) };
    config = {
      getOrThrow: jest.fn().mockReturnValue('https://mini-shop.example.com'),
    };
    service = new MailContentBuilderService(
      secretKey,
      i18n as unknown as I18nService,
      config as unknown as ConfigService,
    );
  });

  function buildNotification(
    overrides: Partial<EmailNotification>,
  ): EmailNotification {
    return {
      id: 'notif-1',
      locale: 'en',
      payload: {},
      order: null,
      secretCiphertext: null,
      reportPeriod: null,
      ...overrides,
    } as EmailNotification;
  }

  it('builds an activation link from the decrypted secret and escapes the username', () => {
    const notification = buildNotification({
      eventType: EmailNotificationEventType.EMAIL_VERIFICATION,
      secretCiphertext: encryptNotificationSecret('raw-token', secretKey),
      payload: { username: '<b>alice</b>', templateVersion: 1 },
    });

    const content = service.build(notification);

    expect(content.subject).toBe('Verify your Mini Shop account');
    expect(content.html).toContain(
      'https://mini-shop.example.com/verify-email?token=raw-token',
    );
    expect(content.html).toContain('&lt;b&gt;alice&lt;/b&gt;');
    expect(content.html).not.toContain('<b>alice</b>');
  });

  it('throws when an auth token notification has no secretCiphertext', () => {
    const notification = buildNotification({
      eventType: EmailNotificationEventType.EMAIL_VERIFICATION,
      secretCiphertext: null,
    });

    expect(() => service.build(notification)).toThrow(/secretCiphertext/);
  });

  it('builds order-placed content from the order relation', () => {
    const notification = buildNotification({
      eventType: EmailNotificationEventType.ORDER_PLACED,
      order: {
        id: 'order-1',
        recipientName: 'Nguyen Van A',
        totalVnd: '250000',
        rejectionReason: null,
      } as Order,
    });

    const content = service.build(notification);

    expect(content.subject).toBe('Order order-1 has been placed');
    expect(content.html).toContain('Hello Nguyen Van A,');
    expect(content.html).toContain('Order order-1 total 250000 VND.');
  });

  it('escapes the rejection reason before embedding it in HTML', () => {
    const notification = buildNotification({
      eventType: EmailNotificationEventType.ORDER_REJECTED,
      order: {
        id: 'order-1',
        recipientName: 'Nguyen Van A',
        totalVnd: '250000',
        rejectionReason: '<script>alert(1)</script>',
      } as Order,
    });

    const content = service.build(notification);

    expect(content.html).toContain(
      'Rejected: &lt;script&gt;alert(1)&lt;/script&gt;',
    );
  });

  it('throws when an order notification has no loaded order relation', () => {
    const notification = buildNotification({
      eventType: EmailNotificationEventType.ORDER_PLACED,
      order: null,
    });

    expect(() => service.build(notification)).toThrow(/order relation/);
  });

  it('builds monthly revenue content from reportPeriod and payload', () => {
    const notification = buildNotification({
      eventType: EmailNotificationEventType.MONTHLY_REVENUE,
      reportPeriod: '2026-09-01',
      payload: { templateVersion: 1, totalRevenueVnd: '12500000' },
    });

    const content = service.build(notification);

    expect(content.subject).toBe('Monthly revenue report — 09/2026');
    expect(content.html).toContain('Hello Admin,');
    expect(content.html).toContain(
      'Total revenue in 09/2026 was 12500000 VND.',
    );
  });

  it('throws when a MONTHLY_REVENUE notification has no reportPeriod', () => {
    const notification = buildNotification({
      eventType: EmailNotificationEventType.MONTHLY_REVENUE,
      reportPeriod: null,
    });

    expect(() => service.build(notification)).toThrow(/reportPeriod/);
  });
});
