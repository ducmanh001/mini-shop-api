import { Logger } from '@nestjs/common';
import { MAILTRAP_SEND_API_URL } from '../constants/notifications.constants';
import {
  MailTransport,
  MailTransportSendParams,
} from '../interfaces/mail-transport.interface';

/**
 * Không tự log lỗi ở đây — ném lỗi lên để `MailProcessor.handleSendFailure()` log, cùng chỗ với
 * nhánh SMTP (nodemailer cũng chỉ throw, không tự log), tránh log trùng 2 lần cho cùng 1 lỗi.
 */
// TODO(demo-bypass): Mailtrap account trả 401 dù token/quyền đúng (chưa rõ nguyên nhân phía
// account Mailtrap, xem docs/testing/pr19-manual-test-guide.md). Tạm coi mọi lần gửi là thành
// công (không gọi API thật) để không chặn demo — PHẢI gỡ khối try/catch giả này khi Mailtrap
// account được xác nhận hoạt động, không được để lại trong code thật lâu dài.
const DEMO_BYPASS_SKIP_REAL_SEND = true;

export class MailtrapApiMailTransport implements MailTransport {
  private readonly logger = new Logger(MailtrapApiMailTransport.name);

  constructor(private readonly apiToken: string) {}

  async sendMail(params: MailTransportSendParams): Promise<void> {
    if (DEMO_BYPASS_SKIP_REAL_SEND) {
      // Không gửi thật nên không có email nào để lấy token/link — log thẳng nội dung ra đây,
      // copy link/token trực tiếp từ Deploy Logs khi demo.
      this.logger.warn(
        `[DEMO BYPASS] Mail không gửi thật tới ${params.to} — nội dung: ${params.html}`,
      );
      return;
    }
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
