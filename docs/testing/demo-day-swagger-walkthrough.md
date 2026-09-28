# Demo Day — Swagger walkthrough theo role (guest / customer / admin)

Đúng format mentor (`pham.thanh.binh`) đã confirm: demo trên **cloud thật** (không phải local), đi
một lượt tính năng của từng role trên **Swagger UI** (không Postman, không FE riêng), kết bằng phần
chia sẻ kiến thức/kỹ thuật đã học trong module. Tài liệu này liệt kê **toàn bộ endpoint hiện có**,
kèm sẵn body mẫu cho từng request, sắp theo đúng luồng nghiệp vụ thật để trình bày mượt — không theo
thứ tự khai báo trong code.

Quy ước đọc bên dưới: mỗi endpoint có dòng **Body** (JSON dán vào ô "Request body" của Swagger sau
khi bấm "Try it out") hoặc ghi rõ **Không cần body** — GET/DELETE và vài POST chỉ cần điền `:id`/param
trên URL, không có ô body nào để điền cả.

## 0. Chuẩn bị trước buổi demo

1. Mở sẵn 2 tab: Swagger UI (`https://<domain-Railway>/api-docs`) và inbox Mailtrap sandbox (để
   show email thật khi tới đoạn verify email / order placed).
2. Tài khoản demo có sẵn từ `npm run seed -- --profile=demo` (password chung `Demo@12345`):
   - Admin: `admin@mini-shop.example.com`
   - Customer: `customer1@mini-shop.example.com` (và `customer2@...` nếu cần tài khoản thứ 2, vd
     demo chat giữa 2 khách).
3. Swagger có nút **Authorize** (icon ổ khoá góc trên phải) — dán `accessToken` vào đó sau khi login.
   Đổi vai (customer ↔ admin) chỉ cần Authorize lại bằng token khác, không cần logout trước.
4. Các `:id` dùng trong bước sau (`:productId`, `orders/:id`...) đều lấy từ **response thật** của
   bước GET danh sách ngay trước đó — không có ID cố định để chép sẵn.

## 1. Vai khách — chưa đăng nhập (~3-4 phút)

1. `POST /auth/register` — hoặc bỏ qua, dùng thẳng `customer2` có sẵn để tiết kiệm thời gian.
   **Body:**
   ```json
   {
     "email": "guest-demo@example.com",
     "username": "guest_demo",
     "password": ""
   }
   ```
2. Mở Mailtrap → cho xem mail xác thực thật → copy `token` trong link.
   `POST /auth/verify-email` — **Body:** `{ "token": "<token copy từ link trong mail>" }`
3. `GET /categories` — **Không cần body.**
4. `GET /products` — **Không cần body** (có thể gõ query `search`/`page` nếu muốn demo filter).
5. `GET /products/:id` — **Không cần body**, `:id` lấy từ response bước 4.
6. `GET /products/:id/share-links` — **Không cần body.**
7. _(Optional nếu còn thời gian)_ `POST /auth/forgot-password` — **Body:**
   `{ "email": "customer1@mini-shop.example.com" }` → mở Mailtrap xem mail reset → copy token →
   `POST /auth/reset-password` — **Body:**
   ```json
   {
     "token": "<token từ mail>",
     "newPassword": "Demo@99999",
     "confirmPassword": "Demo@99999"
   }
   ```
8. `POST /auth/login` bằng `customer1` — **Body:**
   ```json
   { "email": "customer1@mini-shop.example.com", "password": "Demo@12345" }
   ```
   → copy `accessToken` trong response → bấm **Authorize**.

## 2. Vai khách hàng — đã Authorize bằng customer (~5-6 phút)

1. `PUT /cart/items/:productId` — `:productId` lấy từ mục 1.4. **Body:** `{ "quantity": 2 }`
2. `GET /cart` — **Không cần body.**
3. `DELETE /cart/items/:productId` — **Không cần body** (optional, bớt 1 item để demo).
4. `POST /orders` — checkout COD. **Body:**
   ```json
   {
     "recipientName": "Nguyen Van A",
     "phone": "0901234567",
     "address": "123 Đường ABC, Quận 1, TP.HCM",
     "customerNote": "Giao giờ hành chính"
   }
   ```
5. `GET /orders` — **Không cần body.**
6. `GET /orders/:id` — **Không cần body**, `:id` lấy từ response bước 5.
7. `POST /orders/:id/cancel` — **Không cần body** (chỉ huỷ được khi đơn còn PENDING).
8. Mở Mailtrap → cho xem mail "Order ... has been placed" vừa gửi — đúng luồng SMTP auth thật vừa
   deploy xong (PR19).
9. `POST /product-suggestions` — **Body:**
   ```json
   {
     "name": "Bàn phím cơ",
     "description": "Switch đỏ, có đèn nền",
     "categoryName": "Phụ kiện"
   }
   ```
10. `GET /product-suggestions` — **Không cần body.**
11. `POST /chat/conversations` — **Không cần body** (mở hoặc trả lại conversation OPEN sẵn có của
    chính mình, tự động get-or-create).
12. `GET /chat/conversations/me` — **Không cần body.**
13. `POST /chat/conversations/:id/messages` — `:id` lấy từ bước 11/12. **Body:**
    `{ "body": "Cho em hỏi đơn hàng của em khi nào giao ạ?" }`
14. `GET /chat/conversations/:id/messages` — **Không cần body.**
    - Ghi chú khi demo: tin nhắn đẩy realtime qua WebSocket namespace `/chat`
      (event `chat.message.created`), Swagger không demo được WebSocket — có thể mở thêm 1 tab dùng
      `socket.io-client` qua console browser nếu muốn cho thấy đẩy tức thời, không bắt buộc cho demo.
15. `GET /users/me` — **Không cần body.**
    `PATCH /users/me` — **Body:** `{ "username": "customer1_new" }`
    `PATCH /users/me/password` — **Body:**
    ```json
    {
      "currentPassword": "Demo@12345",
      "newPassword": "Demo@54321",
      "confirmPassword": "Demo@54321"
    }
    ```

## 3. Vai admin — Authorize lại bằng admin (~6-7 phút)

1. `GET /admin/users` / `GET /admin/users/:id` — **Không cần body.**
   `PATCH /admin/users/:id/status` — **Body:** `{ "status": "INACTIVE" }` (hoặc `"ACTIVE"`).
2. `POST /admin/categories` — **Body:**
   `{ "name": "Phụ kiện", "slug": "phu-kien", "isActive": true }`
   `PATCH /admin/categories/:id` — **Body** (gửi field nào sửa field đó, không cần đủ hết):
   `{ "isActive": false }`
   `DELETE /admin/categories/:id` — **Không cần body.**
3. `POST /admin/products` — **Body:**
   ```json
   {
     "categoryId": "<id danh mục lấy từ GET /categories>",
     "name": "Bàn phím cơ Demo",
     "description": "Switch đỏ, có đèn nền",
     "sku": "KEYB-DEMO-001",
     "priceVnd": "350000",
     "stock": 20,
     "isActive": true,
     "isFeatured": false
   }
   ```
   `PATCH /admin/products/:id` — **Body** (subset bất kỳ): `{ "priceVnd": "320000", "stock": 15 }`
   `DELETE /admin/products/:id` — **Không cần body.**
   `POST /admin/products/:id/image` — **Không phải JSON** — chọn tab "multipart/form-data" trong
   Swagger, field `file`, chọn 1 ảnh từ máy.
   `DELETE /admin/products/:id/image` — **Không cần body.**
4. `GET /admin/orders` / `GET /admin/orders/:id` — **Không cần body.**
   `PATCH /admin/orders/:id/status` — **Body:** `{ "status": "CONFIRMED" }` — nếu chọn `"REJECTED"`
   thì bắt buộc kèm `"reason"`: `{ "status": "REJECTED", "reason": "Hết hàng" }`.
5. `GET /admin/orders/export` — **Không cần body** — Swagger trả file Excel tải về trực tiếp (điểm
   kỹ thuật: dùng `exceljs`, xem mục 4).
6. `GET /admin/product-suggestions` / `GET /admin/product-suggestions/:id` — **Không cần body.**
   `PATCH /admin/product-suggestions/:id/status` — **Body:** `{ "status": "APPROVED" }` (hoặc
   `{ "status": "REJECTED", "reason": "Đã có sản phẩm tương tự" }`).
7. `GET /admin/chat/conversations` — **Không cần body.**
   `PATCH /admin/chat/conversations/:id` — **Body:**
   `{ "assignedAdminId": "<id admin hiện tại, từ GET /admin/users>", "status": "OPEN" }`

## 4. Chia sẻ kiến thức, kỹ thuật đã học (~5 phút)

- **Mail**: pattern outbox — `email_notifications` là bảng riêng, không gửi mail đồng bộ trong
  request; Bull queue xử lý nền, ngân sách retry (`attempts`) lưu ở DB chứ không phải bộ đếm nội bộ
  của Bull (sống sót qua Redis restart); vừa thêm SMTP auth thật (Mailtrap) để chạy được trên cloud
  — Mailpit local không cần auth nên bug này chỉ lộ ra khi deploy thật.
- **Excel**: `exceljs` build `StreamableFile` trả thẳng qua response stream, không tạo file tạm trên
  đĩa server.
- **Cron**: 2 job độc lập qua `@nestjs/schedule` — dispatcher gửi mail chạy mỗi phút, báo cáo doanh
  thu chạy cuối tháng theo giờ Asia/Bangkok (không phải UTC).
- **Deploy/CD**: Dockerfile multi-stage nhưng **giữ nguyên `src/` + devDependencies ở runtime image**
  (khác thông lệ thường "chỉ giữ dist") — lý do: `migration:run` dùng `typeorm-ts-node-commonjs`
  chạy thẳng trên TS source, cần được ở production để chạy migration ngay trong container qua Railway
  Console. GitHub Actions build & push image lên GHCR khi merge `main`; case study thật lúc deploy:
  phát hiện bug Redis thiếu gửi `password` (lỗi `NOAUTH` — Mailpit/Redis local không auth nên không
  lộ ra ở CI/local, chỉ lộ khi nối managed Redis thật) và tự sửa ngay trong buổi deploy.

## 5. Q&A

Dành thời gian còn lại cho câu hỏi của mentor/reviewer.
