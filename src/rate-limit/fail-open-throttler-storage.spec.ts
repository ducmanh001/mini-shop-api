import { Logger } from '@nestjs/common';
import { FailOpenThrottlerStorage } from './fail-open-throttler-storage';
import { RATE_LIMIT_ALLOW_RECORD } from './rate-limit.constants';

describe('FailOpenThrottlerStorage', () => {
  let delegate: { increment: jest.Mock };
  let warn: jest.SpyInstance;
  let storage: FailOpenThrottlerStorage;

  beforeEach(() => {
    delegate = { increment: jest.fn() };
    warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation();
    storage = new FailOpenThrottlerStorage(delegate);
  });

  afterEach(() => {
    warn.mockRestore();
  });

  it('forwards the call and returns the delegate record untouched', async () => {
    const record = {
      totalHits: 3,
      timeToExpire: 40,
      isBlocked: false,
      timeToBlockExpire: 0,
    };
    delegate.increment.mockResolvedValue(record);

    const result = await storage.increment('key', 60_000, 5, 60_000, 'ip');

    expect(result).toBe(record);
    expect(delegate.increment).toHaveBeenCalledWith(
      'key',
      60_000,
      5,
      60_000,
      'ip',
    );
    expect(warn).not.toHaveBeenCalled();
  });

  it('allows the request and logs a warning when the store fails', async () => {
    delegate.increment.mockRejectedValue(new Error('connection refused'));

    const result = await storage.increment('key', 60_000, 5, 60_000, 'ip');

    expect(result).toEqual(RATE_LIMIT_ALLOW_RECORD);
    expect(result.isBlocked).toBe(false);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('throttler=ip'));
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining('connection refused'),
    );
  });

  it('handles a rejection that is not an Error instance', async () => {
    delegate.increment.mockRejectedValue('boom');

    const result = await storage.increment('key', 1, 1, 1, 'account');

    expect(result.isBlocked).toBe(false);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('boom'));
  });

  it('returns a fresh record each time so callers cannot mutate the shared constant', async () => {
    delegate.increment.mockRejectedValue(new Error('down'));

    const first = await storage.increment('k', 1, 1, 1, 'ip');
    first.totalHits = 99;
    const second = await storage.increment('k', 1, 1, 1, 'ip');

    expect(second.totalHits).toBe(0);
    expect(RATE_LIMIT_ALLOW_RECORD.totalHits).toBe(0);
  });
});
