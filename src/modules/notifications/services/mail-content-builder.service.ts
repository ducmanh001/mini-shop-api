import { Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { I18nService } from 'nestjs-i18n';
import { escapeHtml } from '../../../common/utils/escape-html.util';
import { decryptNotificationSecret } from '../../../common/utils/notification-secret-cipher.util';
import { NOTIFICATION_SECRET_KEY_PROVIDER } from '../../../notification-secret/notification-secret.constants';
import { AuthTokenMailPayload } from '../../auth/interfaces/auth-token-mail-payload.interface';
import {
  AUTH_TOKEN_LINK_PATH,
  ORDER_MAIL_KEY,
} from '../constants/notifications.constants';
import { EmailNotificationEventType } from '../enums/email-notification-event-type.enum';
import { EmailNotification } from '../entities/email-notification.entity';
import { MailContent } from '../interfaces/mail-content.interface';

/** Tách khỏi `MailerService` để test được logic dựng nội dung mà không cần mock SMTP transport. */
@Injectable()
export class MailContentBuilderService {
  constructor(
    @Inject(NOTIFICATION_SECRET_KEY_PROVIDER)
    private readonly secretKey: Buffer,
    private readonly i18n: I18nService,
    private readonly config: ConfigService,
  ) {}

  build(notification: EmailNotification): MailContent {
    switch (notification.eventType) {
      case EmailNotificationEventType.EMAIL_VERIFICATION:
      case EmailNotificationEventType.PASSWORD_RESET:
        return this.buildAuthTokenContent(notification);
      case EmailNotificationEventType.ORDER_PLACED:
      case EmailNotificationEventType.ORDER_CONFIRMED:
      case EmailNotificationEventType.ORDER_REJECTED:
        return this.buildOrderContent(notification);
      case EmailNotificationEventType.MONTHLY_REVENUE:
        throw new Error(
          `MONTHLY_REVENUE email content is not implemented yet (PR16): ${notification.id}`,
        );
      default: {
        const exhaustiveCheck: never = notification.eventType;
        throw new Error(
          `Unsupported email notification event type: ${String(exhaustiveCheck)}`,
        );
      }
    }
  }

  private buildAuthTokenContent(notification: EmailNotification): MailContent {
    if (!notification.secretCiphertext) {
      throw new Error(
        `Missing secretCiphertext for ${notification.eventType} notification ${notification.id}`,
      );
    }
    const rawToken = decryptNotificationSecret(
      notification.secretCiphertext,
      this.secretKey,
    );
    const path = AUTH_TOKEN_LINK_PATH[notification.eventType];
    const link = `${this.config.getOrThrow<string>('PUBLIC_WEB_URL')}/${path}?token=${encodeURIComponent(rawToken)}`;

    const payload = notification.payload as unknown as AuthTokenMailPayload;
    const key =
      notification.eventType === EmailNotificationEventType.EMAIL_VERIFICATION
        ? 'emailVerification'
        : 'passwordReset';
    const lang = notification.locale;

    const greeting = this.renderHtml(`mail.${key}.greeting`, lang, {
      username: payload.username,
    });
    const instruction = this.plain(`mail.${key}.instruction`, lang);
    const ctaLabel = this.plain(`mail.${key}.ctaLabel`, lang);
    const footer = this.plain(`mail.${key}.footer`, lang);
    const subject = this.plain(`mail.${key}.subject`, lang);

    return {
      subject,
      html: [
        `<p>${greeting}</p>`,
        `<p>${instruction}</p>`,
        `<p><a href="${link}">${ctaLabel}</a></p>`,
        `<p>${footer}</p>`,
      ].join('\n'),
    };
  }

  private buildOrderContent(notification: EmailNotification): MailContent {
    const order = notification.order;
    if (!order) {
      throw new Error(
        `Missing order relation for ${notification.eventType} notification ${notification.id}`,
      );
    }
    const key = ORDER_MAIL_KEY[notification.eventType];
    const lang = notification.locale;

    const subject = this.renderPlain(`mail.${key}.subject`, lang, {
      orderId: order.id,
    });
    const greeting = this.renderHtml(`mail.${key}.greeting`, lang, {
      recipientName: order.recipientName,
    });
    const body = this.renderHtml(`mail.${key}.body`, lang, {
      orderId: order.id,
      totalVnd: order.totalVnd,
      rejectionReason: order.rejectionReason ?? '',
    });
    const footer = this.plain(`mail.${key}.footer`, lang);

    return {
      subject,
      html: [`<p>${greeting}</p>`, `<p>${body}</p>`, `<p>${footer}</p>`].join(
        '\n',
      ),
    };
  }

  private plain(key: string, lang: string): string {
    return this.i18n.t<string, string>(key, { lang });
  }

  private interpolate(
    key: string,
    lang: string,
    vars: Record<string, string>,
    escape: (value: string) => string,
  ): string {
    const template = this.i18n.t<string, string>(key, { lang });
    return template.replace(/\{(\w+)\}/g, (match: string, name: string) =>
      name in vars ? escape(vars[name]) : match,
    );
  }

  private renderPlain(
    key: string,
    lang: string,
    vars: Record<string, string>,
  ): string {
    return this.interpolate(key, lang, vars, (value) => value);
  }

  /** Khác `renderPlain`: escape giá trị trước khi chèn, vì field free-text của user có thể chứa HTML. */
  private renderHtml(
    key: string,
    lang: string,
    vars: Record<string, string>,
  ): string {
    return this.interpolate(key, lang, vars, escapeHtml);
  }
}
