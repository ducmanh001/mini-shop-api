/** bcrypt cost factor — dùng chung cho mọi nơi hash password (seed CLI, auth service ở PR06). */
export const SALT_ROUNDS = 10;

/**
 * Rule username dùng chung cho đăng ký (`auth`) và sửa hồ sơ (`users`, PR07) — database.md mục 4:
 * "users" (3..30 ký tự [a-z0-9_], lowercase). `auth` import từ đây thay vì tự định nghĩa lại
 * (CODING_STANDARD.md mục 15, cùng lý do với `SALT_ROUNDS`).
 */
export const USERNAME_MIN_LENGTH = 3;
export const USERNAME_MAX_LENGTH = 30;
export const USERNAME_PATTERN = /^[a-z0-9_]+$/;

/** `users.email varchar(254)` — database.md mục 4. Dùng chung cho đăng ký (`auth`) và PR07. */
export const MAX_EMAIL_LENGTH = 254;
