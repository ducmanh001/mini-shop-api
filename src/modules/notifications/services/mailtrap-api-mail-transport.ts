import { MAILTRAP_SEND_API_URL } from '../constants/notifications.constants';
import {
  MailTransport,
  MailTransportSendParams,
} from '../interfaces/mail-transport.interface';

/**
 * Không tự log lỗi ở đây — ném lỗi lên để `MailProcessor.handleSendFailure()` log, cùng chỗ với
 * nhánh SMTP (nodemailer cũng chỉ throw, không tự log), tránh log trùng 2 lần cho cùng 1 lỗi.
 */
export class MailtrapApiMailTransport implements MailTransport {
  constructor(private readonly apiToken: string) {}

  async sendMail(params: MailTransportSendParams): Promise<void> {
    const response = await fetch(MAILTRAP_SEND_API_URL, {
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
    });

    if (!response.ok) {
      const body = await response.text();
      throw new Error(
        `Mailtrap API responded with ${response.status}: ${body}`,
      );
    }
  }
}
