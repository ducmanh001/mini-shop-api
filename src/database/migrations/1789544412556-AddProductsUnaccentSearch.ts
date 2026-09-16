import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * `GET /products?q=` và `GET /admin/categories?q=` dùng `ILIKE '%keyword%'` trên cột tiếng Việt có
 * dấu (`products.name/description`, `categories.name`) — `ILIKE` không phân biệt hoa/thường nhưng
 * VẪN phân biệt dấu, nên tìm "chuot khong day" không khớp "Chuột không dây". `unaccent` là extension
 * chuẩn của Postgres để bỏ dấu 2 chiều (cột lẫn tham số) ngay trong câu query — không cần đổi entity
 * hay thêm cột mới. Không thêm index GIN trigram theo `unaccent(...)` đi kèm: api-contract.md dòng
 * 56 đã chấp nhận `ILIKE` chưa được tăng tốc bởi index ở MVP (dữ liệu demo nhỏ); `unaccent()` mặc
 * định là STABLE (không phải IMMUTABLE) nên nếu sau này cần index theo hướng này phải viết thêm 1
 * wrapper function IMMUTABLE riêng — để lại cho lúc thực sự đo thấy cần (cùng tinh thần "sau khi đo
 * mới xem xét pg_trgm/GIN" ở database.md mục 5).
 */
export class AddProductsUnaccentSearch1789544412556 implements MigrationInterface {
  name = 'AddProductsUnaccentSearch1789544412556';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE EXTENSION IF NOT EXISTS unaccent`);
  }

  public async down(): Promise<void> {
    // Không DROP EXTENSION unaccent ở đây — extension dùng chung cho cả database, object khác có
    // thể đã phụ thuộc vào nó sau khi migration này chạy; gỡ extension là quyết định thủ công.
  }
}
