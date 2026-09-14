/** Độ dài raw token (bytes) dùng chung cho mọi `AuthTokenType` — hex hoá thành 64 ký tự. */
export const AUTH_TOKEN_BYTES = 32;
export const EMAIL_VERIFICATION_TOKEN_TTL_SECONDS = 24 * 60 * 60;
export const PASSWORD_RESET_TOKEN_TTL_SECONDS = 60 * 60;

/** Cận độ dài raw token nhận từ client — dùng chung cho `VerifyEmailRequest`/`ResetPasswordRequest`. */
export const AUTH_TOKEN_MIN_LENGTH = 32;
export const AUTH_TOKEN_MAX_LENGTH = 512;

/**
 * Hash bcrypt cố định của một chuỗi không phải password thật — dùng làm vế so sánh khi email
 * không tồn tại, để `bcrypt.compare()` luôn chạy đủ thời gian như khi user có thật (chống timing
 * attack dò email tồn tại qua độ trễ response của login).
 */
export const DUMMY_PASSWORD_HASH =
  '$2b$10$9GznZgUQqyy6nNTkpv4QHelVWo/1yPEcRROtiCdTsha8lCuzmwziW';
