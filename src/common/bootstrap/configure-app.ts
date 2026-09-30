import { ClassSerializerInterceptor, INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Reflector } from '@nestjs/core';
import type { Express } from 'express';
import helmet from 'helmet';
import { I18nValidationPipe } from 'nestjs-i18n';
import { AllExceptionsFilter } from '../filters/all-exceptions.filter';

export function configureApp(app: INestApplication): void {
  const config = app.get(ConfigService);

  // Phải đặt trước mọi middleware/guard đọc `req.ip` (rate limit) — xem `TRUST_PROXY_HOPS`.
  const trustProxyHops = config.getOrThrow<number>('TRUST_PROXY_HOPS');
  if (trustProxyHops > 0) {
    (app.getHttpAdapter().getInstance() as Express).set(
      'trust proxy',
      trustProxyHops,
    );
  }

  app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));
  app.setGlobalPrefix(config.getOrThrow<string>('API_PREFIX'));
  app.useGlobalPipes(
    new I18nValidationPipe({
      forbidNonWhitelisted: true,
      transform: true,
      whitelist: true,
    }),
  );
  app.useGlobalInterceptors(new ClassSerializerInterceptor(app.get(Reflector)));
  app.useGlobalFilters(new AllExceptionsFilter());
}
