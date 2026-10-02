import { GUARDS_METADATA } from '@nestjs/common/constants';
import { DECORATORS } from '@nestjs/swagger';
import { RateLimited } from './rate-limit.decorator';
import { RateLimitGuard } from './rate-limit.guard';

describe('RateLimited', () => {
  const handler = (): void => undefined;

  beforeAll(() => {
    RateLimited()({}, 'handler', { value: handler });
  });

  it('attaches the rate limit guard to the route', () => {
    expect(Reflect.getMetadata(GUARDS_METADATA, handler)).toEqual([
      RateLimitGuard,
    ]);
  });

  it('documents the 429 response in Swagger', () => {
    expect(
      Reflect.getMetadata(DECORATORS.API_RESPONSE, handler),
    ).toHaveProperty('429');
  });
});
