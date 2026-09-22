import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * `ChatMessage.requestHash` thiếu `@Check(sha256HexCheck(...))` so với `Order.requestHash` — thêm
 * cho nhất quán (PR15). `migration:generate` gốc còn kèm DROP/CREATE `idx_users_username_trgm`,
 * `idx_users_email_trgm` — drift đã biết trước, không liên quan: 2 index GIN trigram này cố ý không
 * khai qua `@Index()` (TypeORM không khai được operator class `gin_trgm_ops`), xem
 * `AddUsersSearchTrigramIndexes1789462728997`'s doc comment. Đã bỏ 2 câu đó khỏi migration này.
 */
export class AddChatMessageRequestHashCheck1790019476326 implements MigrationInterface {
  name = 'AddChatMessageRequestHashCheck1790019476326';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "chat_messages" ADD CONSTRAINT "ck_chat_messages_request_hash_format" CHECK (request_hash ~ '^[0-9a-f]{64}$')`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "chat_messages" DROP CONSTRAINT "ck_chat_messages_request_hash_format"`,
    );
  }
}
