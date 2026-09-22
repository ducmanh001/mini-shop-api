# PR18 — Hướng dẫn test thủ công build/run Docker image (bằng chứng cho reviewer)

PR này không đổi API/business logic — chỉ thêm `Dockerfile`, `.dockerignore` và workflow
`.github/workflows/cd.yml` (build & push image lên GHCR khi merge `main`). Không có endpoint mới
để test qua Swagger — bằng chứng là **build image thật + chạy container thật** nối vào đúng
Postgres/Redis/Mailpit của `docker-compose`, verify bằng request thật + Docker healthcheck. Toàn
bộ các bước dưới đây đã tự chạy tay trong lúc làm PR, không phải suy đoán lý thuyết.

## 0. Chuẩn bị

1. `docker compose up -d` (nếu chưa chạy) — kiểm tra `postgres`/`redis`/`mailpit` healthy:
   `docker ps`.
2. Xác định tên network của docker-compose: `docker network ls` → tìm dòng có tên project (vd
   `mini-shop-api_default`).

## 1. Build image

```bash
docker build -t mini-shop-api:test .
```

**Kỳ vọng:** build qua đủ 3 stage (`deps` → `build` → `runtime`), kết thúc bằng
`naming to docker.io/library/mini-shop-api:test`, không lỗi.

## 2. Chạy container nối vào network của docker-compose

```bash
SECRET=$(node -e "console.log(require('crypto').randomBytes(32).toString('base64'))")
docker run -d --name mini-shop-api-smoke --network mini-shop-api_default -p 3005:3000 \
  -e NODE_ENV=production -e PORT=3000 -e API_PREFIX=api/v1 \
  -e PUBLIC_WEB_URL=http://localhost:3005 -e APP_TIMEZONE=Asia/Bangkok \
  -e DB_HOST=postgres -e DB_PORT=5432 -e DB_USERNAME=mini_shop -e DB_PASSWORD=mini_shop -e DB_NAME=mini_shop \
  -e REDIS_HOST=redis -e REDIS_PORT=6379 \
  -e JWT_SECRET=docker-smoke-test-secret-at-least-32-chars -e JWT_EXPIRES_IN=86400 \
  -e MAIL_HOST=mailpit -e MAIL_PORT=1025 -e MAIL_FROM=no-reply@mini-shop.example.com \
  -e NOTIFICATION_SECRET_KEY="$SECRET" \
  mini-shop-api:test
```

Đổi `postgres`/`redis`/`mailpit` thành đúng tên service container hiện có nếu khác (`docker ps` để
xem tên thật).

## 3. Kiểm tra app khởi động và trả lời request thật

```bash
sleep 5
docker logs mini-shop-api-smoke | tail -5
curl -s -w "\nHTTP_STATUS:%{http_code}\n" http://localhost:3005/api/v1/products
```

**Kỳ vọng:** log có dòng `Nest application successfully started`; curl trả `HTTP_STATUS:200` kèm
danh sách sản phẩm demo thật (không rỗng nếu đã seed).

## 4. Kiểm tra Docker HEALTHCHECK

```bash
sleep 10
docker inspect --format='{{json .State.Health}}' mini-shop-api-smoke
```

**Kỳ vọng:** `"Status":"healthy"`, `Log` cuối cùng có `ExitCode:0` và `Output` chứa
`{"status":"ok","service":"mini-shop-api",...}` — đúng response thật của `GET /health`.

## 5. Dọn dẹp

```bash
docker stop mini-shop-api-smoke && docker rm mini-shop-api-smoke && docker rmi mini-shop-api:test
```

## 6. Tổng hợp bằng chứng cho PR

- Output đầy đủ của bước 1 (build qua 3 stage, không lỗi).
- Output bước 3 (log "successfully started" + `HTTP_STATUS:200` + body sản phẩm thật).
- Output bước 4 (`"Status":"healthy"`).
- Sau khi merge PR này vào `main`: link tới run của workflow `CD` trên GitHub Actions
  (`.github/workflows/cd.yml`) cho thấy job `build-and-push` xanh và image thật đã lên
  `ghcr.io/<owner>/<repo>` (tab **Packages** của repo).

**Việc chưa làm ở PR này (nêu rõ để không gây hiểu nhầm là "đã deploy xong"):** đây mới dừng ở
build & push image lên registry. Chưa có bước chạy image đó trên một môi trường cloud thật (Railway/
Render/VPS...) — cần chọn nền tảng và cấu hình riêng, ngoài phạm vi PR này.
