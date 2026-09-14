import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddAuthTokenHashFormatCheck1789112302774 implements MigrationInterface {
  name = 'AddAuthTokenHashFormatCheck1789112302774';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "auth_tokens" ADD CONSTRAINT "ck_auth_tokens_token_hash_format" CHECK (token_hash ~ '^[0-9a-f]{64}$')`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "auth_tokens" DROP CONSTRAINT "ck_auth_tokens_token_hash_format"`,
    );
  }
}
