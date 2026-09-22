# PR16 — Hướng dẫn test thủ công bằng script + Mailpit (bằng chứng cho reviewer)

PR16 là **job nền** (`@Cron`), không thêm REST endpoint nào — không có gì để gọi qua Swagger UI.
Bằng chứng chính là kết quả `npm run test:e2e -- monthly-report.e2e-spec.ts` (test thật trên
Postgres, xem `test/monthly-report.e2e-spec.ts`: ranh giới tháng đúng, admin ACTIVE nhận đúng 1
dòng, chạy 2 lần không tạo email trùng). Guide này thêm 1 lượt chạy tay để **tận mắt thấy email
thật render trong Mailpit** — điều e2e test không kiểm tra (e2e chỉ xác nhận dòng
`email_notifications`, không xác nhận nội dung mail đã gửi trông thế nào).

## 0. Chuẩn bị

1. `docker compose up -d` — kiểm tra `postgres`/`redis`/`mailpit` healthy: `docker ps`.
2. `npm run migration:run`, `npm run seed -- --profile=demo` (có sẵn `admin@mini-shop.example.com`,
   mật khẩu `Demo@12345`). Demo seed **không có order COMPLETED nào** — tạo 1 đơn ở bước 1 dưới đây.
3. `npm run start:dev` (app cần chạy để REPL/script dùng chung `AppModule`, và để dispatcher/worker
   mail hoạt động).
4. Mở Mailpit UI: `http://localhost:8026`.

## 1. Tạo 1 order COMPLETED có tổng tiền biết trước

Cách nhanh nhất cho mục đích test tay (không cần đi hết luồng checkout → admin confirm → complete
qua Swagger nhiều bước) — chèn thẳng qua `psql`, cùng cách `test/monthly-report.e2e-spec.ts` tạo
fixture:

```bash
docker exec -it mini-shop-api-postgres-1 psql -U mini_shop -d mini_shop -c "
INSERT INTO orders (id, user_id, status, total_vnd, payment_method, recipient_name, phone,
  address_snapshot, idempotency_key, request_hash, completed_at)
SELECT gen_random_uuid(), id, 'COMPLETED', 500000, 'COD', 'Test Reviewer', '0900000000',
  '1 Test St', gen_random_uuid(), repeat('a', 64), date_trunc('month', now()) - interval '1 day'
FROM users WHERE role = 'CUSTOMER' LIMIT 1;
"
```

Lệnh này lấy 1 customer bất kỳ có sẵn từ seed, tạo 1 order COMPLETED 500.000đ với `completed_at`
= ngày cuối tháng trước (luôn nằm trong kỳ mà job sắp tính, bất kể chạy guide vào ngày nào).

**Muốn test thật qua flow đầy đủ thay vì SQL** thì làm theo `docs/testing/pr06-manual-test-guide.md`
(đăng nhập) → giỏ hàng → `POST /orders` → admin `PATCH /admin/orders/:id` xác nhận rồi chuyển
COMPLETED (xem `order-lifecycle.e2e-spec.ts` cho đúng trình tự trạng thái) — chậm hơn nhưng không
đụng DB trực tiếp.

## 2. Chạy job thủ công bằng REPL (không chờ 00:10 ngày đầu tháng)

Mở terminal thứ hai (giữ `start:dev` đang chạy ở terminal khác), chạy:

```bash
npx ts-node -e "
import { NestFactory } from '@nestjs/core';
import { AppModule } from './src/app.module';
import { MonthlyReportService } from './src/modules/notifications/services/monthly-report.service';

(async () => {
  const app = await NestFactory.createApplicationContext(AppModule);
  await app.get(MonthlyReportService).runMonthlyReport();
  await app.close();
})();
"
```

**Kỳ vọng console:** log `Created MONTHLY_REVENUE intent(s) for report period <YYYY-MM-01> (1
admin(s))` (đúng 1 admin từ demo seed).

## 3. Xác nhận intent đã tạo đúng

```bash
docker exec -it mini-shop-api-postgres-1 psql -U mini_shop -d mini_shop -c "
SELECT recipient_email, event_type, report_period, status, payload FROM email_notifications
WHERE event_type = 'MONTHLY_REVENUE' ORDER BY created_at DESC LIMIT 1;
"
```

**Kỳ vọng:** 1 dòng, `recipient_email = admin@mini-shop.example.com`, `status = PENDING`,
`payload.totalRevenueVnd = "500000"` (đúng order vừa tạo ở mục 1 — nếu seed đã có order COMPLETED
khác từ lần chạy guide trước, số này cộng dồn, không phải lỗi).

## 4. Xem email thật trong Mailpit

Dispatcher (`NotificationDispatcherService`, đã có từ PR05) tự chạy `@Cron` mỗi phút trong app đang
`start:dev` ở mục 0 — đợi tối đa ~60s, **không cần thao tác thêm**. Mở Mailpit
(`http://localhost:8026`), tìm mail mới nhất tới `admin@mini-shop.example.com`.

**Kỳ vọng:** subject "Báo cáo doanh thu tháng MM/YYYY" (hoặc bản tiếng Anh, tuỳ `locale`), nội dung
có đúng số `500000` (hoặc tổng cộng dồn nếu chạy guide nhiều lần).

## 5. Test idempotent — chạy lại job cho cùng kỳ, không tạo mail thứ 2

Lặp lại đúng lệnh ở mục 2 lần nữa. **Kỳ vọng console:** log `Created MONTHLY_REVENUE intent(s)...
(1 admin(s))` **vẫn in ra** (job không biết là "đã chạy rồi", nó vẫn cố insert), nhưng:

```bash
docker exec -it mini-shop-api-postgres-1 psql -U mini_shop -d mini_shop -c "
SELECT count(*) FROM email_notifications
WHERE event_type = 'MONTHLY_REVENUE' AND recipient_email = 'admin@mini-shop.example.com'
  AND report_period = (SELECT report_period FROM email_notifications
    WHERE event_type = 'MONTHLY_REVENUE' ORDER BY created_at DESC LIMIT 1);
"
```

**Kỳ vọng:** `count = 1`, không phải `2` — insert thứ hai bị `ON CONFLICT DO NOTHING` chặn ở unique
`(recipient_email, event_type, report_period)`. Mailpit cũng không có mail thứ 2 nào mới.

## 6. Tổng hợp bằng chứng cho PR

- Output đầy đủ của `npm run test:e2e -- monthly-report.e2e-spec.ts` (3/3 pass) — bằng chứng chính
  cho ranh giới tháng + idempotency + lọc đúng ADMIN ACTIVE.
- Screenshot console log ở mục 2 và mục 5 (thấy rõ log tạo intent).
- Screenshot query DB ở mục 3 và mục 5 (`count = 1` sau khi chạy 2 lần).
- Screenshot email thật trong Mailpit ở mục 4 (subject + nội dung số tiền đúng).

Không bắt buộc quay video liền mạch như các PR có REST endpoint — đây là job nền, bằng chứng rời
rạc (log + query + Mailpit) đã đủ thể hiện đúng hành vi.
