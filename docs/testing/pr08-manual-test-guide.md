# PR08 — Hướng dẫn test thủ công bằng Swagger UI (bằng chứng cho reviewer)

Test end-to-end thật trên môi trường local (không mock): app + Postgres qua `docker-compose`,
thao tác hoàn toàn qua Swagger UI (`http://localhost:3001/api-docs`) — không cần Postman, không cần
đọc DB trực tiếp. PR08 không phát sinh email nào nên không cần mở Mailpit.

Phạm vi: `GET /admin/users`, `GET /admin/users/:id`, `PATCH /admin/users/:id/status`
(ADMIN-USER-01/02/03).

## 0. Chuẩn bị

1. `docker compose up -d` (nếu chưa chạy) — kiểm tra container `postgres` `healthy`: `docker ps`.
2. Có file `.env` ở root repo (copy từ `.env.example`, điền `JWT_SECRET`/`NOTIFICATION_SECRET_KEY`
   như PR06).
3. `npm run migration:run` (áp cả migration `AddUsersCreatedIdIndex` của PR08 nếu DB dev đang ở
   migration cũ hơn).
4. `npm run seed -- --profile=demo` — tạo sẵn 1 admin (`admin` / `admin@mini-shop.example.com`) +
   2 customer (`customer1`, `customer2`) đều ACTIVE, cùng mật khẩu demo `Demo@12345`. Dùng
   `admin` để gọi các route `/admin/users`; `customer1`/`customer2` dùng để test RBAC 403 và làm
   đối tượng active/inactive (không đụng tới chính tài khoản `admin` vì admin không tự deactivate
   được).
5. `npm run start:dev` — app chạy ở `http://localhost:3001`.
6. Mở Swagger UI: `http://localhost:3001/api-docs`.

**Ghi hình/chụp:** bắt đầu quay từ bước `docker ps`.

**Cách gắn JWT vào Swagger UI:** bấm **Authorize** (biểu tượng ổ khoá) → dán **chỉ raw JWT** (không
thêm chữ `Bearer`) vào ô `Value` → **Authorize** → **Close**. Muốn đổi sang JWT khác thì **Authorize**
→ **Logout** → dán JWT mới → **Authorize** lại. Muốn test case "không có token" thì **Authorize** →
**Logout** (không dán gì) trước khi gọi endpoint đó.

## 1. Đăng nhập ADMIN — lấy JWT_ADMIN

`POST /auth/login` với `{ "email": "admin@mini-shop.example.com", "password": "Demo@12345" }`.
**Kỳ vọng:** `200`, có `user.token`, `user.role = "ADMIN"`. **Copy JWT này** → gọi là **JWT_ADMIN**
→ Authorize Swagger bằng JWT_ADMIN (xem hướng dẫn ở mục 0).

## 2. Đăng nhập CUSTOMER (customer1) — lấy JWT_CUSTOMER1

`POST /auth/login` với `{ "email": "customer1@mini-shop.example.com", "password": "Demo@12345" }`.
**Kỳ vọng:** `200`. **Copy JWT này** → gọi là **JWT_CUSTOMER1** (chưa Authorize vội — vẫn đang
dùng JWT_ADMIN cho các bước tiếp theo, sẽ quay lại dùng JWT_CUSTOMER1 ở các case RBAC 403).

## 3. Tạo 1 tài khoản PENDING (chưa verify email) để test case 409

`POST /auth/register`, body:

```json
{
  "username": "pr08_pending",
  "email": "pr08.pending@example.test",
  "password": "DemoPass123!"
}
```

**Kỳ vọng:** `201`, `user.status = "PENDING"`. **Copy `user.id`** → gọi là **PENDING_ID**. Không
verify email tài khoản này — mục đích là giữ nó ở trạng thái PENDING cho bước 6b.

## 4. Danh sách user — `GET /admin/users`

Đang Authorize bằng JWT_ADMIN.

### Happy path

Gọi `GET /admin/users` (không query param). **Kỳ vọng:** `200`, `usersCount >= 4` (admin,
customer1, customer2, pr08_pending), mỗi phần tử trong `users` chỉ có `id`/`username`/`email`/
`role`/`status`/`createdAt` — **không có** `passwordHash`/`token`/`emailVerifiedAt`.

### 4a. Test edge — filter theo `role`

`GET /admin/users?role=ADMIN`. **Kỳ vọng:** `200`, mọi phần tử `role = "ADMIN"` (chỉ có `admin`).

### 4b. Test edge — filter theo `status`

`GET /admin/users?status=PENDING`. **Kỳ vọng:** `200`, chỉ có đúng 1 phần tử — `pr08_pending`.

### 4c. Test edge — filter theo `q` (username/email)

`GET /admin/users?q=customer1`. **Kỳ vọng:** `200`, chỉ có đúng 1 phần tử — `customer1`.

### 4d. Test edge — `limit` ngoài khoảng cho phép

`GET /admin/users?limit=51`. **Kỳ vọng:** `400` (giới hạn `1..50`).

### 4e. Test edge — RBAC, token CUSTOMER

Authorize Swagger bằng JWT_CUSTOMER1, gọi lại `GET /admin/users`. **Kỳ vọng:** `403`. Xong thì
Authorize lại bằng JWT_ADMIN.

### 4f. Test edge — không có token

Authorize → Logout, gọi lại `GET /admin/users`. **Kỳ vọng:** `401`. Xong thì Authorize lại bằng
JWT_ADMIN.

## 5. Chi tiết user — `GET /admin/users/:id`

Trước tiên gọi lại `GET /admin/users` (bước 4) để copy `id` của `customer1` → gọi là
**CUSTOMER1_ID**.

### Happy path

`GET /admin/users/{CUSTOMER1_ID}`. **Kỳ vọng:** `200`, có thêm `emailVerifiedAt` (khác `null`) và
`orderCount` (= `0`, vì chưa có module orders) so với shape ở bước 4.

### 5a. Test edge — id không tồn tại

`GET /admin/users/00000000-0000-4000-8000-000000000000` (UUID hợp lệ nhưng không có user nào).
**Kỳ vọng:** `404`.

### 5b. Test edge — id sai định dạng UUID

`GET /admin/users/not-a-uuid`. **Kỳ vọng:** `400`.

### 5c. Test edge — RBAC, token CUSTOMER

Authorize bằng JWT_CUSTOMER1, gọi `GET /admin/users/{CUSTOMER1_ID}`. **Kỳ vọng:** `403`. Xong thì
Authorize lại bằng JWT_ADMIN.

## 6. Active/inactive user — `PATCH /admin/users/:id/status`

Đang Authorize bằng JWT_ADMIN. Cần thêm **ADMIN_ID** (id của chính tài khoản `admin` — copy từ
response bước 1 hoặc từ `GET /admin/users?role=ADMIN`).

### 6a. Test edge — admin tự deactivate chính mình

`PATCH /admin/users/{ADMIN_ID}/status` với `{ "status": "INACTIVE" }`. **Kỳ vọng:** `409` — admin
không được tự đổi trạng thái tài khoản của mình.

### 6b. Test edge — tài khoản còn PENDING (chưa verify email)

`PATCH /admin/users/{PENDING_ID}/status` với `{ "status": "ACTIVE" }`. **Kỳ vọng:** `409` — không
kích hoạt tài khoản qua đường này, phải verify email đúng flow.

### 6c. Test edge — giá trị `status` không hợp lệ

`PATCH /admin/users/{CUSTOMER1_ID}/status` với `{ "status": "PENDING" }`. **Kỳ vọng:** `400` —
endpoint chỉ nhận `ACTIVE`/`INACTIVE`.

### Happy path — deactivate customer1

`PATCH /admin/users/{CUSTOMER1_ID}/status` với `{ "status": "INACTIVE" }`. **Kỳ vọng:** `200`,
`user.status = "INACTIVE"`.

### 6d. Test edge quan trọng nhất — JWT_CUSTOMER1 (cấp trước lúc deactivate) bị chặn ngay

Authorize Swagger bằng **JWT_CUSTOMER1** (JWT lấy từ bước 2, trước khi deactivate). Gọi
`GET /users/me`. **Kỳ vọng:** `401` — chứng minh deactivate tăng `tokenVersion`, JWT cũ mất hiệu
lực ngay lập tức dù còn hạn. Thử thêm `POST /auth/login` bằng `customer1`/`Demo@12345`. **Kỳ vọng:**
`401` (account không còn ACTIVE). Xong thì Authorize lại bằng JWT_ADMIN.

### 6e. Test edge — gửi lại đúng transition vừa áp dụng

`PATCH /admin/users/{CUSTOMER1_ID}/status` với `{ "status": "INACTIVE" }` (gửi lại lần 2).
**Kỳ vọng:** `409` — không cho lặp lại transition đã hoàn thành.

### Dọn dữ liệu demo — reactivate customer1

`PATCH /admin/users/{CUSTOMER1_ID}/status` với `{ "status": "ACTIVE" }`. **Kỳ vọng:** `200`,
`user.status = "ACTIVE"`. Xác nhận lại bằng `POST /auth/login` với `customer1`/`Demo@12345` →
**Kỳ vọng:** `200`.

### 6f. Test edge — RBAC, token CUSTOMER

Đăng nhập lại `customer1` (vì JWT_CUSTOMER1 cũ đã bị revoke ở 6d) lấy JWT mới, Authorize Swagger
bằng JWT đó, gọi `PATCH /admin/users/{customer2's id}/status` với `{ "status": "INACTIVE" }`.
**Kỳ vọng:** `403`. Xong thì Authorize lại bằng JWT_ADMIN.

### 6g. Test edge — không có token

Authorize → Logout, gọi `PATCH /admin/users/{CUSTOMER1_ID}/status` với `{ "status": "INACTIVE" }`.
**Kỳ vọng:** `401`.

## 7. Tổng hợp bằng chứng cho PR

Đặt tên file/thư mục evidence gợi ý (đính kèm vào PR hoặc Google Drive rồi dán link vào mô tả PR):

```
docs/testing/evidence/pr08/
├── 01-login-admin-200.png
├── 02-register-pending-201.png
├── 03-list-users-200.png
├── 04-list-users-filter-role-200.png
├── 05-list-users-filter-status-200.png
├── 06-list-users-filter-q-200.png
├── 07-list-users-limit-out-of-range-400.png
├── 08-list-users-rbac-403.png
├── 09-list-users-no-token-401.png
├── 10-get-user-detail-200.png
├── 11-get-user-not-found-404.png
├── 12-get-user-malformed-id-400.png
├── 13-status-self-deactivate-409.png
├── 14-status-pending-account-409.png
├── 15-status-invalid-value-400.png
├── 16-status-deactivate-200.png
├── 17-old-jwt-revoked-after-deactivate-401.png
├── 18-status-repeat-transition-409.png
├── 19-status-reactivate-200.png
├── 20-status-rbac-403.png
└── pr08-demo.mp4   (video quay liền mạch bước 1 → 6g)
```

Không bắt buộc đúng tên file này — quan trọng là mỗi ảnh/đoạn video thể hiện rõ **request +
response** (status code + body), đặc biệt case 6d (revoke token sau deactivate) vì đây là điều
kiện nghiệm thu cốt lõi của PR08 ("deactivated token bị chặn request sau").
