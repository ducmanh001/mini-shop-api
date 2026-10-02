import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import type { App } from 'supertest/types';
import { createTestApp } from './utils/create-test-app';

/** Helmet nằm trong `configureApp()` nên e2e (dùng chung `createTestApp`) thấy đúng header production. */
describe('Security headers (e2e)', () => {
  let app: INestApplication<App>;

  beforeAll(async () => {
    app = await createTestApp();
  });

  afterAll(async () => {
    if (app) {
      await app.close();
    }
  });

  it('sends the helmet security headers and hides the framework', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/v1/health')
      .expect(200);

    expect(response.headers['x-content-type-options']).toBe('nosniff');
    expect(response.headers['x-frame-options']).toBe('SAMEORIGIN');
    expect(response.headers['strict-transport-security']).toBeDefined();
    expect(response.headers['referrer-policy']).toBe('no-referrer');
    expect(response.headers['content-security-policy']).toContain(
      "default-src 'self'",
    );
    expect(response.headers['x-powered-by']).toBeUndefined();
  });

  it('allows public images to be embedded from another origin', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/v1/health')
      .expect(200);

    // Mặc định của helmet là `same-origin`, sẽ chặn web frontend khác origin nhúng ảnh sản phẩm.
    expect(response.headers['cross-origin-resource-policy']).toBe(
      'cross-origin',
    );
  });

  it('keeps a well-formed upstream request id and replaces a forged one', async () => {
    const kept = await request(app.getHttpServer())
      .get('/api/v1/health')
      .set('X-Request-ID', 'upstream-trace.42')
      .expect(200);
    const replaced = await request(app.getHttpServer())
      .get('/api/v1/health')
      .set('X-Request-ID', 'x] ip=10.0.0.1, route=Fake.login, [y')
      .expect(200);

    expect(kept.headers['x-request-id']).toBe('upstream-trace.42');
    // ID nhận từ client đi thẳng vào log nên ID giả mạo trường log phải bị thay bằng UUID.
    expect(replaced.headers['x-request-id']).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('also protects error responses', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/v1/this-route-does-not-exist')
      .expect(404);

    expect(response.headers['x-content-type-options']).toBe('nosniff');
    expect(response.headers['x-powered-by']).toBeUndefined();
  });
});
