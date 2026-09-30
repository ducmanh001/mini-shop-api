import { ConfigService } from '@nestjs/config';
import { ExecutionContext } from '@nestjs/common';
import { ThrottlerModuleOptions } from '@nestjs/throttler';
import Redis from 'ioredis';
import { I18nService } from 'nestjs-i18n';
import { FailOpenThrottlerStorage } from './fail-open-throttler-storage';
import { buildThrottlerOptions, getEmailFromBody } from './rate-limit.config';

type ObjectOptions = Exclude<ThrottlerModuleOptions, unknown[]>;

const ENV: Record<string, number> = {
  THROTTLE_AUTH_IP_LIMIT: 20,
  THROTTLE_AUTH_IP_TTL_SECONDS: 60,
  THROTTLE_AUTH_ACCOUNT_LIMIT: 10,
  THROTTLE_AUTH_ACCOUNT_TTL_SECONDS: 900,
};

function contextWithBody(body: unknown): ExecutionContext {
  return {
    switchToHttp: () => ({ getRequest: () => ({ body }) }),
  } as unknown as ExecutionContext;
}

describe('getEmailFromBody', () => {
  it('trims and lowercases the email like the login DTO does', () => {
    expect(
      getEmailFromBody({ body: { email: '  Seed_Alice@Example.TEST ' } }),
    ).toBe('seed_alice@example.test');
  });

  it.each([
    ['no body', undefined],
    ['null body', null],
    ['no email field', {}],
    ['non-string email', { email: 123 }],
    ['blank email', { email: '   ' }],
  ])('returns an empty string for %s', (_label, body) => {
    expect(getEmailFromBody({ body })).toBe('');
  });
});

describe('buildThrottlerOptions', () => {
  let redis: Redis;
  let i18n: { t: jest.Mock };
  let options: ObjectOptions;

  beforeEach(() => {
    // `lazyConnect` giữ instance thật (thư viện kiểm `instanceof Redis`) nhưng không mở kết nối.
    redis = new Redis({ lazyConnect: true });
    i18n = { t: jest.fn((key: string) => key) };
    const config = {
      getOrThrow: jest.fn((key: string) => ENV[key]),
    } as unknown as ConfigService;
    options = buildThrottlerOptions(
      config,
      redis,
      i18n as unknown as I18nService,
    ) as ObjectOptions;
  });

  afterEach(() => {
    redis.disconnect();
  });

  it('configures an ip and an account throttler with limits from env and ttl in milliseconds', () => {
    expect(options.throttlers).toEqual([
      expect.objectContaining({ name: 'ip', limit: 20, ttl: 60_000 }),
      expect.objectContaining({ name: 'account', limit: 10, ttl: 900_000 }),
    ]);
  });

  it('wraps the redis store so a Redis outage does not block requests', () => {
    expect(options.storage).toBeInstanceOf(FailOpenThrottlerStorage);
  });

  it('translates the 429 message through i18n', () => {
    const errorMessage = options.errorMessage as () => string;

    expect(errorMessage()).toBe('errors.tooManyRequests');
    expect(i18n.t).toHaveBeenCalledWith('errors.tooManyRequests');
  });

  describe('account throttler', () => {
    const account = () =>
      options.throttlers.find((throttler) => throttler.name === 'account')!;

    it('tracks by the normalized email in the body', async () => {
      const tracker = await account().getTracker!(
        { body: { email: ' Foo@Bar.test ' } },
        contextWithBody(undefined),
      );

      expect(tracker).toBe('foo@bar.test');
    });

    it('is skipped when the body has no email (verify-email, reset-password)', () => {
      expect(account().skipIf!(contextWithBody({ token: 'abc' }))).toBe(true);
      expect(account().skipIf!(contextWithBody(undefined))).toBe(true);
    });

    it('applies when the body has an email', () => {
      expect(account().skipIf!(contextWithBody({ email: 'a@b.test' }))).toBe(
        false,
      );
    });
  });

  it('leaves the ip throttler on the default tracker (client IP) and never skips it', () => {
    const ip = options.throttlers.find((throttler) => throttler.name === 'ip')!;

    expect(ip.getTracker).toBeUndefined();
    expect(ip.skipIf).toBeUndefined();
  });
});
