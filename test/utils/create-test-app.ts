import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import type { App } from 'supertest/types';
import { DataSource } from 'typeorm';
import { AppModule } from '../../src/app.module';
import { configureApp } from '../../src/common/bootstrap/configure-app';

let activeDataSource: DataSource | undefined;

/**
 * `listen: true` cũng bind một cổng TCP thật (`app.listen(0)`, cổng ngẫu nhiên) thay vì chỉ
 * `app.init()` — cần cho test dùng `socket.io-client` thật (CHAT-07), vì `supertest` lái thẳng
 * server chưa listen được nhưng WebSocket handshake thì không. Mặc định `false` để không đổi hành
 * vi của mọi e2e test REST hiện có.
 */
export async function createTestApp(
  options: { listen?: boolean } = {},
): Promise<INestApplication<App>> {
  const moduleFixture: TestingModule = await Test.createTestingModule({
    imports: [AppModule],
  }).compile();
  const app = moduleFixture.createNestApplication<INestApplication<App>>();
  configureApp(app);
  await app.init();
  if (options.listen) {
    await app.listen(0);
  }
  activeDataSource = app.get(DataSource);
  return app;
}

/** Dùng bởi `test/utils/reset-database.setup.ts` — global hook cần đúng connection của app đang chạy. */
export function getActiveDataSource(): DataSource {
  if (!activeDataSource) {
    throw new Error(
      'No active DataSource — call createTestApp() in beforeAll() first',
    );
  }
  return activeDataSource;
}
