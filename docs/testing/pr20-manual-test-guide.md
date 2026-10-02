# PR20 — Hướng dẫn test thủ công rate limit đăng nhập và helmet (bằng chứng cho reviewer)

Test end-to-end thật trên môi trường local (không mock): app + Postgres + Redis qua
`docker-compose`. Kết quả `429` và Swagger UI thao tác qua `http://localhost:3001/api-docs`; phần
cần đọc header hoặc giả `X-Forwarded-For` dùng `curl` vì Swagger UI không đặt được header tùy ý.
PR không thêm endpoint mới — thay đổi hành vi của 5 route auth công khai (`register`,
`verify-email`, `login`, `forgot-password`, `reset-password`) và thêm security header cho mọi
response.

Phạm vi: rate limit theo IP và theo email (AUTH-03, AUTH-04 `429 vượt rate limit`), `Retry-After`,
message i18n, `TRUST_PROXY_HOPS`, fail-open khi Redis lỗi, và header của `helmet`.

## 0. Chuẩn bị

1. `docker compose up -d` (nếu chưa chạy) — kiểm tra `postgres`/`redis` `healthy`: `docker ps`.
2. `.env` cần đủ biến bắt buộc như các PR trước. **Để thử được `429` nhanh, hạ giới hạn trong
   `.env`** (mặc định 20 request/60s theo IP và 10 request/900s theo email quá cao để bấm tay):

   ```text
   THROTTLE_AUTH_IP_LIMIT=5
   THROTTLE_AUTH_IP_TTL_SECONDS=60
   THROTTLE_AUTH_ACCOUNT_LIMIT=3
   THROTTLE_AUTH_ACCOUNT_TTL_SECONDS=60
   TRUST_PROXY_HOPS=0
   ```

   Xong guide thì khôi phục về giá trị trong `.env.example` (mục 9).

3. `npm run migration:run` rồi `npm run seed -- --profile=demo` — tài khoản demo
   `customer1@mini-shop.example.com` và `customer2@mini-shop.example.com`, cùng mật khẩu
   `Demo@12345`.
4. `npm run start:dev` — app chạy ở `http://localhost:3001`. **Giữ nguyên cửa sổ console**: nhiều
   bước cần đọc log của app.
5. Mở Swagger UI: `http://localhost:3001/api-docs`.

**Bộ đếm nằm ở Redis và sống qua các lần gọi.** Giữa các mục dưới đây, dọn bộ đếm (hoặc chờ 60 giây)
để mục này không dính số lần gọi của mục trước:

```bash
docker compose exec -T redis sh -c "redis-cli --scan --pattern '{*:ip}:*' | xargs -r redis-cli del; redis-cli --scan --pattern '{*:account}:*' | xargs -r redis-cli del"
```

**Ghi hình/chụp:** bắt đầu quay từ bước `docker ps`.

## 1. Security header — `GET /health`

```bash
curl -i http://localhost:3001/api/v1/health
```

**Kỳ vọng:** `200` và các header sau có mặt: `Content-Security-Policy` (chứa `default-src 'self'`),
`X-Content-Type-Options: nosniff`, `X-Frame-Options: SAMEORIGIN`, `Strict-Transport-Security`,
`Referrer-Policy: no-referrer`, `Cross-Origin-Resource-Policy: cross-origin`. **Không có** header
`X-Powered-By` (trước PR này response có `X-Powered-By: Express`).

### 1a. Test edge — response lỗi cũng có header

```bash
curl -i http://localhost:3001/api/v1/khong-ton-tai
```

**Kỳ vọng:** `404`, vẫn có `X-Content-Type-Options: nosniff`, vẫn không có `X-Powered-By`.

### 1b. Test edge quan trọng — Swagger UI vẫn hiển thị dưới CSP của helmet

Mở `http://localhost:3001/api-docs` bằng Chrome hoặc Edge. **Kỳ vọng:** trang tải đầy đủ, thấy danh
sách endpoint theo nhóm và nút **Authorize**; mở Console của trình duyệt không có lỗi
`Content Security Policy`. (Safari trên `http://localhost` chưa được kiểm, xem phần rủi ro trong
PR.)

### 1c. Test edge — `X-Request-ID` do client gửi không được tin nguyên văn

```bash
curl -s -o /dev/null -D - -H 'X-Request-ID: upstream-trace.42' http://localhost:3001/api/v1/health | grep -i x-request-id
curl -s -o /dev/null -D - -H 'X-Request-ID: x] ip=10.0.0.1, route=Fake.login, [y' http://localhost:3001/api/v1/health | grep -i x-request-id
```

**Kỳ vọng:** lần 1 response trả lại đúng `upstream-trace.42` (ID hợp lệ: chữ, số, `_.:-`, tối đa 64
ký tự). Lần 2 response trả một **UUID mới** thay vì chuỗi giả — ID này đi thẳng vào log, nếu tin
nguyên văn thì client tự giả được các trường khác trong dòng log (`ip=`, `route=`).

## 2. Chống brute-force — `POST /auth/login` theo email

Ngân sách theo email là **3 request/60s** (đã hạ ở mục 0). Dọn bộ đếm trước khi bắt đầu.

### Happy path

Trong Swagger UI, `POST /auth/login` với `{ "email": "customer1@mini-shop.example.com",
"password": "Wrong@12345" }` **3 lần liên tiếp**. **Kỳ vọng:** cả 3 lần `401` (sai mật khẩu, chưa bị
chặn).

### 2a. Test edge quan trọng — lần thứ 4 bị chặn, kể cả khi đúng mật khẩu

Gọi lần 4 với **mật khẩu đúng** `Demo@12345`. **Kỳ vọng:** `429`, body
`{ "errors": { "body": ["Too many requests, please try again later"] } }`. Trong khung **Response
headers** của Swagger có `retry-after` (số giây, ≤ 60) cùng `retry-after-account`. Kẻ tấn công đoán trúng
mật khẩu trong lúc đang bị chặn cũng không vào được.

### 2b. Test edge — email viết hoa và có khoảng trắng vẫn tính chung một tài khoản

Dọn bộ đếm, rồi gọi `POST /auth/login` với `" CUSTOMER1@mini-shop.example.com "` (có khoảng trắng
hai đầu, viết hoa), `"customer1@mini-shop.example.com"`, `"Customer1@Mini-Shop.example.com"` (mỗi
lần mật khẩu sai). Lần thứ 4 với email viết thường **Kỳ vọng:** `429` — không né được bằng cách đổi
cách viết email.

### 2c. Test edge — email khác không bị ảnh hưởng

Ngay sau 2b (customer1 đang bị chặn), `POST /auth/login` với `customer2@mini-shop.example.com` /
`Demo@12345`. **Kỳ vọng:** `200` — chỉ email bị vượt ngưỡng mới bị chặn.

### 2d. Test edge — message tiếng Việt

Dọn bộ đếm, gọi sai mật khẩu 3 lần cho customer1 rồi:

```bash
curl -s -i -X POST 'http://localhost:3001/api/v1/auth/login?lang=vi' \
  -H 'Content-Type: application/json' \
  -d '{"email":"customer1@mini-shop.example.com","password":"Wrong@12345"}'
```

**Kỳ vọng:** `429`, message `Bạn thao tác quá nhiều lần, vui lòng thử lại sau`.

### 2e. Test edge — log của app khi bị chặn

Nhìn console của `npm run start:dev` sau mục 2a/2d. **Kỳ vọng:** đúng **một** dòng `WARN`
dạng `Rate limit exceeded [route=AuthController.login, ip=..., limit=3, windowSeconds=60,
retryAfterSeconds=..., requestId=...]` cho mỗi lần vượt ngưỡng đầu tiên của cửa sổ, các lần bị chặn
sau đó **không** sinh thêm dòng log. Dòng log **không chứa email** của người dùng.

### 2f. Test edge — hết cửa sổ thì được đăng nhập lại

Chờ hết 60 giây kể từ lần bị chặn rồi gọi `POST /auth/login` đúng mật khẩu cho customer1.
**Kỳ vọng:** `200` — không bị khoá vĩnh viễn.

## 3. Giới hạn theo IP — nhiều email từ một máy

Ngân sách theo IP là **5 request/60s**. Dọn bộ đếm trước.

Trong Swagger UI gọi `POST /auth/login` **6 lần**, mỗi lần một email khác nhau (`a1@example.test`,
`a2@example.test`, …) và mật khẩu bất kỳ. **Kỳ vọng:** 5 lần đầu `401`, lần thứ 6 `429` — vượt
ngưỡng dù không email nào bị đếm quá 1 lần, tức là giới hạn theo IP hoạt động độc lập với giới hạn
theo email.

## 4. Quên mật khẩu — `POST /auth/forgot-password` (AUTH-04)

Dọn bộ đếm trước.

### Happy path

`POST /auth/forgot-password` với `{ "email": "customer1@mini-shop.example.com" }` **3 lần**.
**Kỳ vọng:** cả 3 lần `202` với cùng message chung.

### 4a. Test edge — lần thứ 4 trả `429`

Gọi lần 4 cùng email. **Kỳ vọng:** `429` (yêu cầu AUTH-04 trong `api-requirements.csv`: "429 vượt rate
limit"). Mở Mailpit (`http://localhost:8026`): chỉ có thêm 3 mail reset mới cho customer1, không có mail
thứ 4 — chặn mail dồn vào hộp thư người khác.

### 4b. Test edge — ngân sách riêng theo từng route

Dọn bộ đếm. Gọi `POST /auth/login` sai mật khẩu 4 lần cho customer2 để lần thứ 4 bị `429`. Ngay sau
đó `POST /auth/forgot-password` với email của customer2. **Kỳ vọng:** `202` — hết ngân sách đăng
nhập không khoá luôn chức năng quên mật khẩu.

## 5. Route không có email trong body — chỉ giới hạn theo IP

Dọn bộ đếm. Gọi `POST /auth/verify-email` **6 lần** với cùng body
`{ "token": "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" }`. **Kỳ vọng:** 5 lần
đầu `400` (token sai), lần thứ 6 `429`. Ngân sách theo email là 3 nhưng lần thứ 4 và 5 vẫn `400`
chứ không phải `429` — bộ đếm theo email tự bỏ qua route không mang email.

## 6. `TRUST_PROXY_HOPS` — chống giả `X-Forwarded-For`

Giữ `TRUST_PROXY_HOPS=0` trong `.env` (mặc định), khởi động lại app, dọn bộ đếm.

```bash
for i in 1 2 3 4 5 6; do
  curl -s -o /dev/null -w "%{http_code}\n" -X POST http://localhost:3001/api/v1/auth/login \
    -H 'Content-Type: application/json' -H "X-Forwarded-For: 10.0.0.$i" \
    -d "{\"email\":\"spoof$i@example.test\",\"password\":\"Wrong@12345\"}"
done
```

**Kỳ vọng:** `401 401 401 401 401 429` — mỗi request tự xưng một IP khác nhau nhưng app bỏ qua
header giả nên vẫn tính chung một IP và bị chặn ở lần thứ 6.

### 6a. Test edge — sau proxy tin cậy thì đọc đúng IP client

Đặt `TRUST_PROXY_HOPS=1`, khởi động lại app, dọn bộ đếm, chạy lại đúng vòng lặp trên. **Kỳ vọng:**
cả 6 dòng đều `401` — lúc này `X-Forwarded-For` được tin, mỗi giá trị là một client riêng. Gửi 6 lần
với **cùng** một `X-Forwarded-For` thì lần thứ 6 vẫn `429`.

## 7. Redis lỗi — rate limit fail-open

Đặt lại `TRUST_PROXY_HOPS=0`, khởi động lại app. Dừng Redis:

```bash
docker compose stop redis
curl -s -o /dev/null -w "%{http_code}\n" -X POST http://localhost:3001/api/v1/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"customer1@mini-shop.example.com","password":"Wrong@12345"}'
```

**Kỳ vọng:** `401` (không phải `500`) — đăng nhập vẫn hoạt động khi Redis chết, mỗi request có thể
chậm vài giây do ioredis thử kết nối lại. Console của app có dòng `WARN` chứa
`Rate-limit store unavailable, allowing request`. Bật lại Redis: `docker compose start redis`.

## 8. Kiểm tra bằng test tự động

```bash
npm run test:e2e -- test/rate-limit test/security-headers
```

**Kỳ vọng:** 4 file `PASS`, 16 test pass (10 ở `rate-limit.e2e-spec.ts`, 1 ở
`rate-limit-window`, 1 ở `rate-limit-untrusted-proxy`, 4 ở `security-headers`).

## 9. Dọn dẹp

Đưa `THROTTLE_AUTH_*` và `TRUST_PROXY_HOPS` trong `.env` về giá trị của `.env.example` (20 / 60 /
10 / 900 / 0), khởi động lại app, dọn bộ đếm Redis bằng lệnh ở mục 0.

## 10. Tổng hợp bằng chứng cho PR

Đặt tên file/thư mục evidence gợi ý (đính kèm vào PR hoặc Google Drive rồi dán link vào mô tả PR):

```
docs/testing/evidence/pr20/
├── 01-health-security-headers.png
├── 01a-404-security-headers.png
├── 01b-swagger-ui-loads-under-csp.png
├── 01c-forged-request-id-replaced.png
├── 02-login-wrong-password-401-x3.png
├── 02a-login-correct-password-blocked-429-retry-after.png
├── 02b-login-email-case-space-same-account-429.png
├── 02c-login-other-email-200.png
├── 02d-login-429-vi-message.png
├── 02e-console-warn-rate-limit-exceeded-once.png
├── 02f-login-200-after-window.png
├── 03-login-ip-limit-6th-429.png
├── 04-forgot-password-202-x3.png
├── 04a-forgot-password-4th-429-mailpit-3-mails.png
├── 04b-forgot-password-separate-budget-202.png
├── 05-verify-email-ip-only-429-at-6th.png
├── 06-xff-spoof-hops0-401x5-429.png
├── 06a-xff-hops1-per-client-401x6.png
├── 07-redis-down-login-401-fail-open-warn.png
├── 08-e2e-rate-limit-security-headers-16-pass.png
└── pr20-demo.mp4   (video quay liền mạch bước 1 → 7)
```

Không bắt buộc đúng tên file này — quan trọng là mỗi ảnh/đoạn video thể hiện rõ **request +
response** (status code + body + header) hoặc **dòng log** tương ứng, đặc biệt 4 điều kiện nghiệm
thu cốt lõi của PR20: **đúng mật khẩu vẫn bị chặn khi vượt ngưỡng** (2a), **không né được bằng
`X-Forwarded-For` giả** (6), **log đúng một dòng và không lộ email** (2e), và **Redis chết không làm
sập đăng nhập** (7).
