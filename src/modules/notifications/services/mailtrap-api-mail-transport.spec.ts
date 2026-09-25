import { MAILTRAP_SEND_API_URL } from '../constants/notifications.constants';
import { MailtrapApiMailTransport } from './mailtrap-api-mail-transport';

describe('MailtrapApiMailTransport', () => {
  const params = {
    from: 'no-reply@mini-shop.example.com',
    to: 'customer@example.test',
    subject: 'Subject',
    html: '<p>Body</p>',
  };
  let fetchMock: jest.Mock;

  beforeEach(() => {
    fetchMock = jest.fn();
    global.fetch = fetchMock as typeof fetch;
  });

  it('POSTs the mail as JSON with a Bearer token', async () => {
    fetchMock.mockResolvedValue({ ok: true });
    const transport = new MailtrapApiMailTransport('api-token');

    await transport.sendMail(params);

    expect(fetchMock).toHaveBeenCalledWith(
      MAILTRAP_SEND_API_URL,
      expect.objectContaining({
        method: 'POST',
        headers: {
          Authorization: 'Bearer api-token',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from: { email: params.from },
          to: [{ email: params.to }],
          subject: params.subject,
          html: params.html,
        }),
      }),
    );
  });

  it('throws when Mailtrap responds with a non-2xx status', async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 401,
      text: () => Promise.resolve('Unauthorized'),
    });
    const transport = new MailtrapApiMailTransport('bad-token');

    await expect(transport.sendMail(params)).rejects.toThrow('401');
  });
});
