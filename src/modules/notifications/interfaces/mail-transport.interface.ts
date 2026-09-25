export interface MailTransportSendParams {
  from: string;
  to: string;
  subject: string;
  html: string;
}

/**
 * Interface chung cho 2 cách gửi mail thật: SMTP (`nodemailer`, dùng local/CI với Mailpit) và HTTP
 * API (Mailtrap Sending API, dùng cloud — Railway chặn outbound SMTP, xác nhận thật lúc deploy
 * PR19: mọi port 587/2525 đều bị drop ở tầng mạng dù credential đúng).
 */
export interface MailTransport {
  /** Trả `Promise<unknown>` (không `Promise<void>`) để nodemailer's `Transporter.sendMail()`
   * (trả `Promise<SentMessageInfo>`) gán thẳng được, không cần bọc adapter — caller không dùng
   * giá trị trả về, chỉ quan tâm reject/resolve. */
  sendMail(params: MailTransportSendParams): Promise<unknown>;
  close?(): void;
}
