/**
 * Trim + lowercase một field trước validate, khớp CHECK `= lower(btrim(...))` của `users.email`/
 * `users.username` (docs/planning/database.md mục 2). Dùng trong `@Transform()` của DTO — chạy
 * trước class-validator vì `ValidationPipe({ transform: true })` transform trước rồi mới validate.
 */
export function normalizeIdentifier(value: unknown): unknown {
  return typeof value === 'string' ? value.trim().toLowerCase() : value;
}
