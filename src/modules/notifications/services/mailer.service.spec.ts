import { ConfigService } from '@nestjs/config';
import { MailerService } from './mailer.service';

describe('MailerService', () => {
  let transporter: { sendMail: jest.Mock; close: jest.Mock };
  let config: { getOrThrow: jest.Mock };
  let service: MailerService;

  beforeEach(() => {
    transporter = {
      sendMail: jest.fn().mockResolvedValue(undefined),
      close: jest.fn(),
    };
    config = {
      getOrThrow: jest.fn().mockReturnValue('no-reply@mini-shop.example.com'),
    };
    service = new MailerService(
      transporter,
      config as unknown as ConfigService,
    );
  });

  it('sends mail using the configured MAIL_FROM address', async () => {
    await service.sendMail('customer@example.test', {
      subject: 'Subject',
      html: '<p>Body</p>',
    });

    expect(transporter.sendMail).toHaveBeenCalledWith({
      from: 'no-reply@mini-shop.example.com',
      to: 'customer@example.test',
      subject: 'Subject',
      html: '<p>Body</p>',
    });
  });

  it('closes the transporter on module destroy', () => {
    service.onModuleDestroy();

    expect(transporter.close).toHaveBeenCalledTimes(1);
  });
});
