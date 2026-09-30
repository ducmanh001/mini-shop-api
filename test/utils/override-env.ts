/**
 * Ghi đè biến môi trường cho RIÊNG file e2e đang chạy. Gọi trong `beforeAll()` NGAY TRƯỚC
 * `createTestApp()`: `ConfigModule.forRoot()` chụp snapshot env đã validate vào lúc `AppModule` được
 * nạp (lười, trong `createTestApp()`), nên giá trị đặt sau đó bị bỏ qua âm thầm. Jest cấp cho mỗi
 * file test một bản `process.env` riêng nên giá trị này không rò sang file khác.
 */
export function overrideEnv(values: Record<string, string>): void {
  Object.assign(process.env, values);
}
