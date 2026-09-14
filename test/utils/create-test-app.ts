import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import type { App } from 'supertest/types';
import { DataSource } from 'typeorm';
import { AppModule } from '../../src/app.module';
import { configureApp } from '../../src/common/bootstrap/configure-app';

let activeDataSource: DataSource | undefined;

export async function createTestApp(): Promise<INestApplication<App>> {
  const moduleFixture: TestingModule = await Test.createTestingModule({
    imports: [AppModule],
  }).compile();
  const app = moduleFixture.createNestApplication<INestApplication<App>>();
  configureApp(app);
  await app.init();
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
