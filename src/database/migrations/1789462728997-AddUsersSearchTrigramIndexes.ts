import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * `GET /admin/users?q=` dùng `ILIKE '%keyword%'` (wildcard cả 2 đầu) trên `username`/`email` —
 * B-tree thường (kể cả `idx_users_created_id`/unique index có sẵn) không tăng tốc được kiểu tìm
 * kiếm này, Postgres phải quét tuần tự toàn bảng. `pg_trgm` + GIN index theo trigram là giải pháp
 * chuẩn cho `ILIKE`/`LIKE` substring search — đã note trước trong docs/planning/database.md mục 5
 * ("sau khi đo mới xem xét pg_trgm/GIN"); thêm sớm vì chi phí thấp trên bảng nhỏ và tránh phải
 * viết lại migration + đổi index name khi seed data lớn hơn sau này.
 *
 * Không declare 2 index này qua `@Index()` trên entity: TypeORM không có cách khai operator class
 * (`gin_trgm_ops`) qua decorator, nên `migration:generate` sẽ luôn coi đây là index "lạ" so với
 * metadata nếu cố khai — chấp nhận quản lý thủ công 2 index này ngoài entity, không đưa vào diff.
 */
export class AddUsersSearchTrigramIndexes1789462728997 implements MigrationInterface {
  name = 'AddUsersSearchTrigramIndexes1789462728997';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE EXTENSION IF NOT EXISTS pg_trgm`);
    await queryRunner.query(
      `CREATE INDEX "idx_users_username_trgm" ON "users" USING gin ("username" gin_trgm_ops)`,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_users_email_trgm" ON "users" USING gin ("email" gin_trgm_ops)`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "public"."idx_users_email_trgm"`);
    await queryRunner.query(`DROP INDEX "public"."idx_users_username_trgm"`);
    // Không DROP EXTENSION pg_trgm ở đây — extension dùng chung cho cả database, object khác có
    // thể đã phụ thuộc vào nó sau khi migration này chạy; gỡ extension là quyết định thủ công.
  }
}
