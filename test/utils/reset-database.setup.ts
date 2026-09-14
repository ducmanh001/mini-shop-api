import { getActiveDataSource } from './create-test-app';
import { truncateAllTables } from './db-reset';
import { seedDatabase } from './seed-database';

/**
 * `setupFilesAfterEnv` (test/jest-e2e.json) — mọi file `*.e2e-spec.ts` tự động seed trước và
 * truncate sau mỗi test case, không cần từng file tự gọi (CODING_STANDARD.md mục 11). Chạy sau
 * `beforeAll()` của từng spec file (nơi gọi `createTestApp()`), nên `getActiveDataSource()` luôn
 * có connection sẵn sàng khi hook này bắt đầu thực thi.
 */
beforeEach(async () => {
  await seedDatabase(getActiveDataSource());
});

afterEach(async () => {
  await truncateAllTables(getActiveDataSource());
});
