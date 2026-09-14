/** Access token payload — role/status KHÔNG nằm ở đây, `JwtStrategy` luôn đọc lại từ DB (database.md mục 4 — "users"). */
export interface JwtPayload {
  sub: string;
  jti: string;
  tokenVersion: number;
}
