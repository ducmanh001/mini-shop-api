import { ExecutionContext, Logger } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import {
  ThrottlerException,
  ThrottlerModuleOptions,
  ThrottlerStorage,
} from '@nestjs/throttler';
import { FailOpenThrottlerStorage } from './fail-open-throttler-storage';
import { RateLimitGuard } from './rate-limit.guard';

class SampleController {}

const sampleHandler = (): void => undefined;

function buildContext(res: { header: jest.Mock }): ExecutionContext {
  return {
    getHandler: () => sampleHandler,
    getClass: () => SampleController,
    switchToHttp: () => ({
      getRequest: () => ({
        ip: '203.0.113.7',
        id: 'req-1',
        headers: {},
        body: { email: 'victim@example.test' },
      }),
      getResponse: () => res,
    }),
  } as unknown as ExecutionContext;
}

describe('RateLimitGuard', () => {
  const options: ThrottlerModuleOptions = {
    throttlers: [{ name: 'ip', limit: 2, ttl: 60_000 }],
    errorMessage: () => 'blocked by test',
  };
  let storage: { increment: jest.Mock };
  let res: { header: jest.Mock };
  let warn: jest.SpyInstance;

  async function buildGuard(
    storageForGuard: ThrottlerStorage,
  ): Promise<RateLimitGuard> {
    const guard = new RateLimitGuard(options, storageForGuard, new Reflector());
    await guard.onModuleInit();
    return guard;
  }

  beforeEach(() => {
    storage = { increment: jest.fn() };
    res = { header: jest.fn() };
    warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation();
  });

  afterEach(() => {
    warn.mockRestore();
  });

  function blockedRecord(totalHits: number) {
    return {
      totalHits,
      timeToExpire: 30,
      isBlocked: true,
      timeToBlockExpire: 42,
    };
  }

  it('lets a request through while under the limit, without a Retry-After header', async () => {
    storage.increment.mockResolvedValue({
      totalHits: 1,
      timeToExpire: 59,
      isBlocked: false,
      timeToBlockExpire: 0,
    });
    const guard = await buildGuard(storage);

    await expect(guard.canActivate(buildContext(res))).resolves.toBe(true);

    const headerNames = res.header.mock.calls.map(([name]) => name as string);
    expect(headerNames).not.toContain('Retry-After');
  });

  it('throws 429 with the configured message and a standard Retry-After header when blocked', async () => {
    storage.increment.mockResolvedValue({
      totalHits: 3,
      timeToExpire: 30,
      isBlocked: true,
      timeToBlockExpire: 42,
    });
    const guard = await buildGuard(storage);

    const attempt = guard.canActivate(buildContext(res));

    await expect(attempt).rejects.toBeInstanceOf(ThrottlerException);
    await expect(attempt).rejects.toMatchObject({
      message: 'blocked by test',
      status: 429,
    });
    expect(res.header).toHaveBeenCalledWith('Retry-After', 42);
  });

  it('logs the first request over the limit with route, ip and window, but never the email', async () => {
    storage.increment.mockResolvedValue(blockedRecord(3));
    const guard = await buildGuard(storage);

    await expect(guard.canActivate(buildContext(res))).rejects.toBeInstanceOf(
      ThrottlerException,
    );

    expect(warn).toHaveBeenCalledTimes(1);
    const [message] = warn.mock.calls[0] as [string];
    expect(message).toContain('route=SampleController.sampleHandler');
    expect(message).toContain('ip=203.0.113.7');
    expect(message).toContain('limit=2');
    expect(message).toContain('windowSeconds=60');
    expect(message).toContain('retryAfterSeconds=42');
    expect(message).toContain('requestId=req-1');
    expect(message).not.toContain('victim@example.test');
  });

  it('does not log again for requests blocked later in the same window', async () => {
    storage.increment.mockResolvedValue(blockedRecord(7));
    const guard = await buildGuard(storage);

    await expect(guard.canActivate(buildContext(res))).rejects.toBeInstanceOf(
      ThrottlerException,
    );

    expect(warn).not.toHaveBeenCalled();
    expect(res.header).toHaveBeenCalledWith('Retry-After', 42);
  });

  it('keeps the request flowing when the store fails (fail-open wrapper)', async () => {
    storage.increment.mockRejectedValue(new Error('redis down'));
    const guard = await buildGuard(new FailOpenThrottlerStorage(storage));

    await expect(guard.canActivate(buildContext(res))).resolves.toBe(true);
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining('Rate-limit store unavailable'),
    );
  });
});
