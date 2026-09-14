import { DataSource } from 'typeorm';

/** Dọn sạch DB test giữa các test case — không tin vào cleanup thủ công của từng file (mục 11 CODING_STANDARD.md). */
export async function truncateAllTables(dataSource: DataSource): Promise<void> {
  const tables: { tablename: string }[] = await dataSource.query(
    `SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename != 'migrations'`,
  );
  if (tables.length === 0) {
    return;
  }
  const tableList = tables.map((t) => `"${t.tablename}"`).join(', ');
  await dataSource.query(
    `TRUNCATE TABLE ${tableList} RESTART IDENTITY CASCADE`,
  );
}
