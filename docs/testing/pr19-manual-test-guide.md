# PR19 — Hướng dẫn test thủ công deploy thật lên Railway (bằng chứng cho reviewer)

PR này không thêm endpoint mới — chỉ thêm hỗ trợ **SMTP có auth** (`MAIL_USER`/`MAIL_PASSWORD`/
`MAIL_SECURE`) và **Redis có auth** (`REDIS_PASSWORD`), vì Mailpit/Redis của `docker-compose` local
không cần auth nhưng hạ tầng managed thật (Mailtrap, Railway Redis) đều bắt buộc. Không thể test 2
thay đổi này bằng unit test đơn thuần — bằng chứng là **deploy thật lên Railway** + verify bằng kết
nối SMTP/Redis auth thật, cộng 1 luồng nghiệp vụ thật (checkout → gửi email) để chứng minh transporter
mới hoạt động đầu-cuối, không chỉ "connect được". Toàn bộ bước dưới đây đã tự chạy tay trong lúc làm
PR, không phải suy đoán lý thuyết — kể cả 2 lỗi ở mục 1a/2a là lỗi thật đã gặp và tự sửa.

## 0. Chuẩn bị

1. Railway project đã có 3 service: `mini-shop-api`, `Postgres`, `Redis`, cùng 1 project/environment.
2. Service `mini-shop-api` đã set đủ biến môi trường, đáng chú ý:
   - `DB_HOST/PORT/USERNAME/PASSWORD/NAME` = `${{Postgres.PGHOST}}` / `PGPORT` / `PGUSER` /
     `PGPASSWORD` / `PGDATABASE`.
   - `REDIS_HOST/PORT` = `${{Redis.REDISHOST}}` / `REDISPORT`, và **`REDIS_PASSWORD` =
     `${{Redis.REDISPASSWORD}}`** (biến mới của PR này).
   - `MAIL_HOST/PORT` = SMTP thật (vd Mailtrap sandbox `sandbox.smtp.mailtrap.io:2525`), và
     **`MAIL_USER`/`MAIL_PASSWORD`** (biến mới của PR này) = credential SMTP thật, `MAIL_SECURE=false`.
   - `PUBLIC_WEB_URL` = domain public đã generate cho service (Settings → Networking → Generate
     Domain), không có dấu `/` cuối.
3. Domain public của `mini-shop-api`, Swagger tại `https://<domain>/api-docs`.
4. Đã chạy `npm run migration:run` và `npm run seed -- --profile=demo` (qua tab Console của Railway,
   `NODE_ENV=development npm run seed -- --profile=demo` vì seed tự chặn khi `NODE_ENV=production`)
   — có user/product demo để login/checkout ở mục 2.
5. Có quyền xem inbox Mailtrap sandbox đang cấu hình ở `MAIL_HOST`.

## 1. Verify app khởi động sạch — không còn lỗi auth

Mở tab **Deploy Logs** của `mini-shop-api` sau lần deploy mới nhất (đã có đủ biến ở mục 0).

**Kỳ vọng:** thấy dòng `[NestApplication] Nest application successfully started`, toàn bộ route
`Mapped {...}` in ra bình thường, **không có** dòng lỗi nào chứa `NOAUTH` hay `Config validation
error`.

### 1a. Test lỗi — tái hiện đúng bug đã gặp và sửa trong PR này

Đây là bug thật gặp phải khi làm PR, không phải case lý thuyết. Trước khi thêm `REDIS_PASSWORD` vào
`redis.module.ts`/`notifications.module.ts`, Deploy Logs của chính service này (dù đã set đủ
`REDIS_PASSWORD` ở biến môi trường) vẫn báo:

```
[ioredis] Unhandled error event: ReplyError: NOAUTH Authentication required.
    at parseError (/app/node_modules/redis-parser/lib/parser.js:179:12)
    at parseType (/app/node_modules/redis-parser/lib/parser.js:302:14)
...
  command: { name: 'client', args: [ 'setname', 'bull:...' ] }
```

Lý do: code cũ không đọc `REDIS_PASSWORD` nên có set biến môi trường cũng vô nghĩa. Muốn tái hiện:
`git stash` riêng đoạn `password: config.get<string>('REDIS_PASSWORD')` ở 2 file trên, build lại
image, deploy — log sẽ quay lại y hệt lỗi trên. Không cần làm lại bước này nếu đã tin vào log thật đã
capture ở trên.

## 2. Verify SMTP auth hoạt động thật — checkout tạo email và tới nơi thật

1. Vào Swagger (`/api-docs`) → `POST /auth/login` bằng tài khoản demo (từ seed) → copy
   `accessToken` → bấm **Authorize**, dán token.
2. Thêm sản phẩm vào giỏ (`POST /cart/items`), rồi `POST /orders/checkout` (COD) — tạo 1 đơn hàng
   thật, kèm theo đó dispatcher sẽ tạo `email_notifications` record loại `ORDER_PLACED`.
3. Đợi tối đa 1 phút (cron `NotificationDispatcherService` chạy mỗi phút) hoặc gọi admin-only
   dispatch ngay nếu có sẵn.
4. Mở inbox Mailtrap sandbox đang trỏ ở `MAIL_HOST`.

**Kỳ vọng:** thấy mail chủ đề "Order ... has been placed" nằm trong inbox — chứng minh
`nodemailer.createTransport()` với `auth: { user, pass }` mới thêm ở PR này đã authenticate thành
công với SMTP thật (SMTP thật sẽ từ chối kết nối nếu thiếu/sai auth, không giống Mailpit local).

### 2a. Test edge — `MAIL_USER` có mà thiếu `MAIL_PASSWORD` (ràng buộc Joi `.and()`)

Không nên phá cấu hình Railway đang chạy tốt chỉ để test case này — verify bằng local:

```bash
# .env local: set MAIL_USER, xoá/comment MAIL_PASSWORD
npm run start:dev
```

**Kỳ vọng:** app fail-fast ngay lúc boot với `Config validation error: "MAIL_PASSWORD" is required`
(hoặc tương đương từ `.and('MAIL_USER', 'MAIL_PASSWORD')` trong `env.validation.ts`) — không bao giờ
chạy được ở trạng thái nửa vời (có user không có password).

## 3. Tổng hợp bằng chứng cho PR

- [ ] Screenshot Deploy Logs mục 1 — dòng `Nest application successfully started`, không lỗi.
- [x] Log lỗi `NOAUTH` thật trước khi sửa — đã capture nguyên văn ở mục 1a.
- [ ] Screenshot email "Order ... has been placed" trong Mailtrap inbox (mục 2) — kèm timestamp đối
      chiếu được với thời điểm checkout.
- [ ] Log/screenshot config validation error khi thiếu `MAIL_PASSWORD` (mục 2a).
- [ ] Link Swagger UI thật đang chạy: `https://<domain>/api-docs`.

**Việc chưa làm ở PR này (nêu rõ để không gây hiểu nhầm phạm vi):** PR này chỉ thêm khả năng đọc
credential SMTP/Redis thật qua env — không đổi business logic dispatcher/mail content, không thêm
API mới. Cấu hình Railway project (Postgres/Redis service, domain, secret thật) nằm ngoài repo, làm
thủ công trên dashboard, không phải nội dung review code của PR.
