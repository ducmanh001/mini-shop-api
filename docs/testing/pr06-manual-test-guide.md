# PR06 — Hướng dẫn test thủ công bằng Postman (bằng chứng cho reviewer)

Test end-to-end thật trên môi trường local (không mock): app + Postgres + Redis + Mailpit qua
`docker-compose`. Không cần sửa code hay đọc DB trực tiếp — token kích hoạt lấy từ email thật
trong Mailpit, đúng như user thật sẽ trải nghiệm.

## 0. Chuẩn bị

1. `docker compose up -d` (nếu chưa chạy) — kiểm tra 3 container `postgres`/`redis`/`mailpit` đều
   `healthy`: `docker ps`.
2. Có file `.env` ở root repo (copy từ `.env.example`, điền `JWT_SECRET` ≥32 ký tự và
   `NOTIFICATION_SECRET_KEY` sinh bằng lệnh ghi sẵn trong comment của `.env.example`).
3. `npm run migration:run` (chạy 1 lần nếu DB dev chưa có schema).
4. `npm run start:dev` — app chạy ở `http://localhost:3001`.
5. Mở sẵn 2 tab trình duyệt:
   - Swagger UI: `http://localhost:3001/api-docs` (xem toàn bộ API + response mẫu).
   - Mailpit UI: `http://localhost:8026` (hộp thư giả — nơi mail kích hoạt thật sự "đến").
6. Postman: tạo Environment mới, 1 biến `base_url = http://localhost:3001/api/v1`.

**Ghi hình/chụp:** bắt đầu quay từ bước `docker ps` (chứng minh chạy thật, không mock), giữ cả 2
tab Swagger + Mailpit trong khung hình xuyên suốt để reviewer thấy state đổi theo thời gian thực.

## 1. Đăng ký — `POST {{base_url}}/auth/register`

Body (raw JSON):

```json
{
  "username": "demo_user1",
  "email": "demo.user1@example.test",
  "password": "DemoPass123!"
}
```

**Kỳ vọng:** `201 Created`, body `user.status = "PENDING"`, **không có** field `token`.

Chụp lại response này — đây là bằng chứng "đăng ký không tự cấp token khi chưa verify".

### 1a. Test lỗi — trùng email

Gửi lại y hệt request trên (cùng email, đổi `username`).
**Kỳ vọng:** `409 Conflict`, message báo trùng email.

### 1b. Test lỗi — gửi thêm field lạ

Thêm `"role": "ADMIN"` vào body rồi gửi.
**Kỳ vọng:** `400 Bad Request` — chứng minh client không tự set được role/status.

## 2. Lấy token kích hoạt từ Mailpit

1. Mở tab Mailpit (`http://localhost:8026`), đợi tối đa ~1 phút (dispatcher `@nestjs/schedule`
   chạy mỗi phút) — email "Verify your Mini Shop account" sẽ xuất hiện, gửi tới
   `demo.user1@example.test`.
2. Mở email, bấm/copy link "Verify email" — dạng
   `http://localhost:3001/verify-email?token=<CHUỖI_HEX_DÀI>`.
3. Copy đúng phần `<CHUỖI_HEX_DÀI>` sau `token=`.

**Chụp lại email này trong Mailpit** — bằng chứng mail thật được gửi qua outbox + Bull queue + SMTP
(không phải giả lập).

## 3. Kích hoạt tài khoản — `POST {{base_url}}/auth/verify-email`

Body:

```json
{ "token": "<dán token vừa copy>" }
```

**Kỳ vọng:** `204 No Content`.

### 3a. Test lỗi — dùng lại đúng token đó lần 2

Gửi lại y hệt request.
**Kỳ vọng:** `400 Bad Request` — chứng minh token chỉ dùng được một lần.

### 3b. Test lỗi — token rác

Gửi `{ "token": "0000000000000000000000000000000000000000000000000000000000000000" }` (bất kỳ
chuỗi hex 64 ký tự nào không tồn tại).
**Kỳ vọng:** `400 Bad Request`.

## 4. Đăng nhập — `POST {{base_url}}/auth/login`

Body:

```json
{ "email": "demo.user1@example.test", "password": "DemoPass123!" }
```

**Kỳ vọng:** `200 OK`, body có `user.token` (JWT). **Copy JWT này** để dùng bước 6.

### 4a. Test lỗi — sai mật khẩu

Đổi `password` thành `"SaiMatKhau!"`.
**Kỳ vọng:** `401 Unauthorized`.

### 4b. Test lỗi — tài khoản chưa verify

Đăng ký thêm 1 user mới (bước 1, đổi email/username), **không** làm bước 2-3, thử login luôn.
**Kỳ vọng:** `401 Unauthorized` — chứng minh PENDING không login được (yêu cầu cốt lõi của PR06).

## 5. Xác nhận JWT không tự lộ role/status sai (tuỳ chọn, kiểm tra kỹ hơn)

Dán JWT từ bước 4 vào [jwt.io](https://jwt.io) (chỉ để đọc payload, không cần verify signature) —
payload chỉ có `sub`, `jti`, `tokenVersion`, không có `role`/`status`. Đây là bằng chứng
"server luôn đọc lại role/status từ DB mỗi request", không tin dữ liệu trong token.

## 6. Đăng xuất — `POST {{base_url}}/auth/logout`

Header: `Authorization: Bearer <JWT từ bước 4>`. Không cần body.

**Kỳ vọng:** `204 No Content`.

### 6a. Test lỗi — gọi logout lại với đúng token vừa revoke

Gửi lại y hệt request (cùng token cũ).
**Kỳ vọng:** `401 Unauthorized` — chứng minh token đã bị Redis blacklist, không dùng lại được.

### 6b. Test lỗi — gọi logout không có header Authorization

Xoá header `Authorization`, gửi lại.
**Kỳ vọng:** `401 Unauthorized`.

## 7. Tổng hợp bằng chứng cho PR

Đặt tên file/thư mục evidence gợi ý (đính kèm vào PR #5 hoặc Google Drive rồi dán link vào PR):

```
docs/testing/evidence/pr06/
├── 01-register-pending-no-token.png
├── 02-register-duplicate-email-409.png
├── 03-register-extra-field-400.png
├── 04-mailpit-verification-email.png
├── 05-verify-email-204.png
├── 06-verify-email-reuse-400.png
├── 07-login-success-with-token.png
├── 08-login-wrong-password-401.png
├── 09-login-pending-account-401.png
├── 10-logout-204.png
├── 11-logout-reused-token-401.png
└── pr06-demo.mp4   (video quay liền mạch bước 1 → 6b)
```

Không bắt buộc đúng tên file này — quan trọng là mỗi ảnh/đoạn video thể hiện rõ **request +
response** (status code + body), để reviewer đối chiếu được với bảng ở mục "Kiểm chứng" trong mô
tả PR #5.
