import { INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Reflector } from '@nestjs/core';
import { configureApp } from './configure-app';

function buildApp(trustProxyHops: number) {
  const config = {
    getOrThrow: jest.fn((key: string) =>
      key === 'TRUST_PROXY_HOPS' ? trustProxyHops : 'api/v1',
    ),
  } as unknown as ConfigService;
  const reflector = new Reflector();
  const expressSet = jest.fn();
  const mocks = {
    use: jest.fn(),
    setGlobalPrefix: jest.fn(),
    useGlobalPipes: jest.fn(),
    useGlobalInterceptors: jest.fn(),
    useGlobalFilters: jest.fn(),
    expressSet,
  };
  const app = {
    get: jest.fn((token: unknown) =>
      token === ConfigService ? config : reflector,
    ),
    getHttpAdapter: () => ({ getInstance: () => ({ set: expressSet }) }),
    use: mocks.use,
    setGlobalPrefix: mocks.setGlobalPrefix,
    useGlobalPipes: mocks.useGlobalPipes,
    useGlobalInterceptors: mocks.useGlobalInterceptors,
    useGlobalFilters: mocks.useGlobalFilters,
  } as unknown as INestApplication;
  return { app, mocks };
}

describe('configureApp', () => {
  it('applies the same prefix and global handlers to every app bootstrap', () => {
    const { app, mocks } = buildApp(0);

    configureApp(app);

    expect(mocks.setGlobalPrefix).toHaveBeenCalledWith('api/v1');
    expect(mocks.useGlobalPipes).toHaveBeenCalledTimes(1);
    expect(mocks.useGlobalInterceptors).toHaveBeenCalledTimes(1);
    expect(mocks.useGlobalFilters).toHaveBeenCalledTimes(1);
  });

  it('installs helmet as a middleware', () => {
    const { app, mocks } = buildApp(0);

    configureApp(app);

    expect(mocks.use).toHaveBeenCalledTimes(1);
    expect(mocks.use).toHaveBeenCalledWith(expect.any(Function));
  });

  it('trusts the configured number of proxies so req.ip is the real client', () => {
    const { app, mocks } = buildApp(1);

    configureApp(app);

    expect(mocks.expressSet).toHaveBeenCalledWith('trust proxy', 1);
  });

  it('leaves trust proxy off by default so clients cannot spoof X-Forwarded-For', () => {
    const { app, mocks } = buildApp(0);

    configureApp(app);

    expect(mocks.expressSet).not.toHaveBeenCalled();
  });
});
