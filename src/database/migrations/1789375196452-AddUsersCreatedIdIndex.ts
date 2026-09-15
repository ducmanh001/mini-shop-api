import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddUsersCreatedIdIndex1789375196452 implements MigrationInterface {
  name = 'AddUsersCreatedIdIndex1789375196452';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE INDEX "idx_users_created_id" ON "users" ("created_at", "id") `,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "public"."idx_users_created_id"`);
  }
}
