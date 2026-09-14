# PR07 — Hướng dẫn test thủ công bằng Swagger UI (bằng chứng cho reviewer)

Test end-to-end thật trên môi trường local (không mock): app + Postgres + Redis + Mailpit qua
`docker-compose`, thao tác hoàn toàn qua Swagger UI (`http://localhost:3001/api-docs`) — không cần
Postman, không cần đọc DB trực tiếp. Token reset mật khẩu lấy từ email thật trong Mailpit.

Phạm vi: `POST /auth/forgot-password`, `POST /auth/reset-password`, `GET /users/me`,
`PATCH /users/me`, `PATCH /users/me/password` (AUTH-04/05, USER-01/02/03).

## 0. Chuẩn bị

1. `docker compose up -d` (nếu chưa chạy) — kiểm tra 3 container `postgres`/`redis`/`mailpit` đều
   `healthy`: `docker ps`.
2. Có file `.env` ở root repo (copy từ `.env.example`, điền `JWT_SECRET`/`NOTIFICATION_SECRET_KEY`
   như PR06).
3. `npm run migration:run` (nếu DB dev chưa có schema).
4. `npm run seed -- --profile=demo` — tạo sẵn 1 admin (`admin`) + 2 customer (`customer1`,
   `customer2`) ACTIVE. Chỉ cần để có sẵn 1 username "đã tồn tại" dùng cho test 409 ở bước 7 —
   không dùng tài khoản seed này để test chính, vì flow bên dưới tự đăng ký tài khoản riêng.
5. `npm run start:dev` — app chạy ở `http://localhost:3001`.
6. Mở sẵn 2 tab trình duyệt:
   - Swagger UI: `http://localhost:3001/api-docs`.
   - Mailpit UI: `http://localhost:8026`.

**Ghi hình/chụp:** bắt đầu quay từ bước `docker ps`, giữ cả 2 tab Swagger + Mailpit trong khung
hình xuyên suốt.

**Cách gắn JWT vào Swagger UI:** bấm nút **Authorize** (biểu tượng ổ khoá, góc trên bên phải danh
sách endpoint) → dán **chỉ raw JWT** (không thêm chữ `Bearer`) vào ô `Value` → **Authorize** →
**Close**. Muốn đổi sang JWT khác (sau khi login lại) thì bấm **Authorize** → **Logout** → dán JWT
mới → **Authorize** lại. Muốn test case "không có token" thì bấm **Authorize** → **Logout** (không
dán gì) trước khi gọi endpoint đó.

## 1. Đăng ký + kích hoạt tài khoản demo cho PR07

Tái dùng nhanh flow PR06 (không lặp lại edge case cũ, xem `docs/testing/pr06-manual-test-guide.md`
nếu cần soát lại phần đó).

1. `POST /auth/register`, body:
   ```json
   {
     "username": "pr07_demo",
     "email": "pr07.demo@example.test",
     "password": "DemoPass123!"
   }
   ```
   **Kỳ vọng:** `201`, `user.status = "PENDING"`.
2. Mở Mailpit, đợi email "Verify your Mini Shop account" tới `pr07.demo@example.test`, copy phần
   `token=` trong link.
3. `POST /auth/verify-email` với `{ "token": "<vừa copy>" }`. **Kỳ vọng:** `204`.
4. `POST /auth/login` với `{ "email": "pr07.demo@example.test", "password": "DemoPass123!" }`.
   **Kỳ vọng:** `200`, có `user.token`. **Copy JWT này** → gọi là **JWT1** → Authorize Swagger
   bằng JWT1 (xem hướng dẫn ở mục 0).

## 2. Quên mật khẩu — `POST /auth/forgot-password`

### Happy path

Body: `{ "email": "pr07.demo@example.test" }`.
**Kỳ vọng:** `202`, body có `message` — một câu thông báo chung chung (không tiết lộ gì về việc
email có tồn tại hay không).

### 2a. Test edge — email không tồn tại

Gửi lại với `{ "email": "nobody@example.test" }`.
**Kỳ vọng:** `202`, và **`message` giống hệt** response ở trên (so sánh 2 response cạnh nhau) —
bằng chứng chống account enumeration: client không phân biệt được email có tồn tại hay không.

## 3. Lấy token reset từ Mailpit

1. Mở tab Mailpit, đợi email "Reset your Mini Shop password" tới `pr07.demo@example.test` (chỉ
   email ở bước 2 happy path mới thực sự phát sinh mail — bước 2a không tạo token/mail nào vì email
   không tồn tại).
2. Mở email, copy phần `token=` trong link `http://localhost:3001/reset-password?token=...`.

**Chụp lại email này trong Mailpit** — bằng chứng mail thật qua outbox + Bull queue + SMTP.

## 4. Đặt lại mật khẩu — `POST /auth/reset-password`

### Happy path

Body:

```json
{
  "token": "<dán token vừa copy>",
  "newPassword": "NewDemoPass456!",
  "confirmPassword": "NewDemoPass456!"
}
```

**Kỳ vọng:** `204`.

### 4a. Test edge — dùng lại đúng token đó lần 2

Gửi lại y hệt request trên. **Kỳ vọng:** `400` — token chỉ dùng được một lần.

### 4b. Test edge — token rác

Gửi `{ "token": "z00000000000000000000000000000000000000000000000000000000000000z", "newPassword": "NewDemoPass456!", "confirmPassword": "NewDemoPass456!" }`
(chuỗi 64 ký tự bất kỳ không tồn tại). **Kỳ vọng:** `400`.

### 4c. Test edge quan trọng nhất — JWT cũ (JWT1) bị revoke sau khi reset

Gọi `GET /users/me` **vẫn đang Authorize bằng JWT1** (lấy từ bước 1, trước khi đổi mật khẩu).
**Kỳ vọng:** `401` — chứng minh reset mật khẩu tăng `tokenVersion`, làm mọi access token cấp
trước đó (kể cả token còn hạn) hết hiệu lực ngay lập tức, không cần đợi JWT tự hết hạn.

## 5. Đăng nhập lại bằng mật khẩu mới — `POST /auth/login`

Body: `{ "email": "pr07.demo@example.test", "password": "NewDemoPass456!" }`.
**Kỳ vọng:** `200`, có `user.token`. **Copy JWT này** → gọi là **JWT2** → Authorize Swagger lại
bằng JWT2 (Authorize → Logout → dán JWT2 → Authorize).

(Tuỳ chọn) Thử login lại bằng mật khẩu **cũ** `DemoPass123!` → **Kỳ vọng:** `401`.

## 6. Xem hồ sơ — `GET /users/me`

### Happy path

Gọi trực tiếp (đang Authorize bằng JWT2).
**Kỳ vọng:** `200`, body `user.email = "pr07.demo@example.test"`, `user.username = "pr07_demo"`,
**không có** field `token`, không có field liên quan mật khẩu nào.

### 6a. Test edge — không có token

Authorize → Logout (bỏ token), gọi lại `GET /users/me`.
**Kỳ vọng:** `401`. Xong thì Authorize lại bằng JWT2 để tiếp tục.

## 7. Sửa hồ sơ — `PATCH /users/me`

### Happy path

Body: `{ "username": "pr07_demo_renamed" }`.
**Kỳ vọng:** `200`, `user.username = "pr07_demo_renamed"`. Gọi lại `GET /users/me` để xác nhận đã
lưu thật (không chỉ trả về đúng ở response tức thời).

### 7a. Test edge — body rỗng

Body: `{}`. **Kỳ vọng:** `400` — ít nhất phải có 1 field.

### 7b. Test edge — username đã bị người khác dùng

Body: `{ "username": "admin" }` (username của tài khoản seed ở bước 0.4).
**Kỳ vọng:** `409`.

### 7c. Test edge — không có token

Authorize → Logout, gọi lại `PATCH /users/me` với `{ "username": "someone_else" }`.
**Kỳ vọng:** `401`. Xong thì Authorize lại bằng JWT2.

## 8. Đổi mật khẩu — `PATCH /users/me/password`

Test hết các case lỗi **trước** happy path, để chưa đổi mật khẩu thật sự lúc còn đang thử case sai.

### 8a. Test edge — sai `currentPassword`

Body:

```json
{
  "currentPassword": "SaiMatKhau!",
  "newPassword": "FinalDemoPass789!",
  "confirmPassword": "FinalDemoPass789!"
}
```

**Kỳ vọng:** `401`.

### 8b. Test edge — `newPassword` trùng `currentPassword`

Body dùng `NewDemoPass456!` (mật khẩu hiện tại) cho cả 3 field.
**Kỳ vọng:** `400` — mật khẩu mới phải khác mật khẩu cũ.

### 8c. Test edge — `confirmPassword` không khớp `newPassword`

Body:

```json
{
  "currentPassword": "NewDemoPass456!",
  "newPassword": "FinalDemoPass789!",
  "confirmPassword": "KhongKhopGiCa!"
}
```

**Kỳ vọng:** `400`.

### Happy path

Body:

```json
{
  "currentPassword": "NewDemoPass456!",
  "newPassword": "FinalDemoPass789!",
  "confirmPassword": "FinalDemoPass789!"
}
```

**Kỳ vọng:** `204`.

### 8d. Test edge quan trọng nhất — JWT2 (đang dùng để đổi mật khẩu) cũng bị revoke

Gọi `GET /users/me` **vẫn đang Authorize bằng JWT2** (token vừa dùng để gọi chính request đổi mật
khẩu ở trên). **Kỳ vọng:** `401` — chứng minh đổi mật khẩu qua `/users/me/password` cũng revoke
toàn bộ session cũ giống hệt reset-password, không chỉ riêng flow quên mật khẩu.

### 8e. Xác nhận đăng nhập lại bình thường bằng mật khẩu mới nhất

`POST /auth/login` với `{ "email": "pr07.demo@example.test", "password": "FinalDemoPass789!" }`.
**Kỳ vọng:** `200`.

### 8f. Test edge — không có token

Authorize → Logout, gọi `PATCH /users/me/password` với body bất kỳ hợp lệ.
**Kỳ vọng:** `401`.

## 9. Tổng hợp bằng chứng cho PR

Đặt tên file/thư mục evidence gợi ý (đính kèm vào PR hoặc Google Drive rồi dán link vào mô tả PR):

```
docs/testing/evidence/pr07/
├── 01-forgot-password-202.png
├── 02-forgot-password-unknown-email-same-message.png
├── 03-mailpit-reset-password-email.png
├── 04-reset-password-204.png
├── 05-reset-password-reuse-token-400.png
├── 06-reset-password-garbage-token-400.png
├── 07-old-jwt-revoked-after-reset-401.png
├── 08-login-with-new-password-200.png
├── 09-get-users-me-200.png
├── 10-get-users-me-no-token-401.png
├── 11-patch-users-me-200.png
├── 12-patch-users-me-empty-body-400.png
├── 13-patch-users-me-duplicate-username-409.png
├── 14-change-password-wrong-current-401.png
├── 15-change-password-same-as-current-400.png
├── 16-change-password-confirm-mismatch-400.png
├── 17-change-password-204.png
├── 18-jwt-revoked-after-change-password-401.png
└── pr07-demo.mp4   (video quay liền mạch bước 1 → 8f)
```

Không bắt buộc đúng tên file này — quan trọng là mỗi ảnh/đoạn video thể hiện rõ **request +
response** (status code + body), đặc biệt 2 case revoke token (4c và 8d) vì đây là điều kiện
nghiệm thu cốt lõi của PR07 ("token cũ bị revoke").
