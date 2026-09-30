/**
 * Phần của Express `Request` mà rate limit cần đọc. Guard chạy trước validation pipe nên `body` ở
 * đây chưa được kiểm kiểu — luôn coi là `unknown`. `id` do `RequestIdMiddleware` gán.
 */
export interface RateLimitedRequest {
  body?: unknown;
  ip?: string;
  id?: string;
}
