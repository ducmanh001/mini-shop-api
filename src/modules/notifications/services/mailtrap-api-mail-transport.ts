import {
  MAILTRAP_API_TIMEOUT_MS,
  MAILTRAP_SANDBOX_SEND_API_BASE_URL,
} from '../constants/notifications.constants';
import {
  MailTransport,
  MailTransportSendParams,
} from '../interfaces/mail-transport.interface';

/**
 * Không tự log lỗi ở đây — ném lỗi lên để `MailProcessor.handleSendFailure()` log, cùng chỗ với
 * nhánh SMTP (nodemailer cũng chỉ throw, không tự log), tránh log trùng 2 lần cho cùng 1 lỗi.
 */
export class MailtrapApiMailTransport implements MailTransport {
  private readonly sendUrl: string;

  constructor(
    private readonly apiToken: string,
    inboxId: string,
  ) {
    this.sendUrl = `${MAILTRAP_SANDBOX_SEND_API_BASE_URL}/${inboxId}`;
  }

  async sendMail(params: MailTransportSendParams): Promise<void> {
    const controller = new AbortController();
    const timeout = setTimeout(
      () => controller.abort(),
      MAILTRAP_API_TIMEOUT_MS,
    );
    try {
      const response = await fetch(this.sendUrl, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.apiToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from: { email: params.from },
          to: [{ email: params.to }],
          subject: params.subject,
          html: params.html,
        }),
        signal: controller.signal,
      });

      if (!response.ok) {
        const body = await response.text();
        throw new Error(
          `Mailtrap API responded with ${response.status}: ${body}`,
        );
      }
    } finally {
      clearTimeout(timeout);
    }
  }
}
