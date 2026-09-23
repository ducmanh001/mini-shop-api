# PR17 — Hướng dẫn test thủ công bằng Swagger UI (bằng chứng cho reviewer)

Test end-to-end thật trên môi trường local (không mock): app + Postgres qua `docker-compose`, thao
tác qua Swagger UI (`http://localhost:3001/api-docs`). PR17 không phát sinh email nào nên không cần
mở Mailpit — đây là task tự học kỹ thuật xuất Excel (`exceljs`), không nằm trong 27 chức năng gốc,
chọn "export danh sách đơn hàng cho admin" làm dữ liệu demo.

Phạm vi: `GET /admin/orders/export` (mới).

## 0. Chuẩn bị

1. `docker compose up -d` (nếu chưa chạy) — kiểm tra `postgres` `healthy`: `docker ps`.
2. Có file `.env` ở root repo. PR17 không có migration mới.
3. `npm run seed -- --profile=demo` — có sẵn `admin@mini-shop.example.com` / `Demo@12345`, chưa có
   order nào — tạo vài đơn ở mục 1 dưới đây trước khi export.
4. `npm run start:dev` — app chạy ở `http://localhost:3001`.
5. Mở Swagger UI: `http://localhost:3001/api-docs`.

**Cách gắn JWT vào Swagger UI:** bấm **Authorize** → dán raw JWT (không thêm `Bearer`) → **Authorize**
→ **Close**.

## 1. Đăng nhập và tạo vài order để có dữ liệu xuất

`POST /auth/login` với `{ "email": "admin@mini-shop.example.com", "password": "Demo@12345" }`.
**Copy JWT** → **JWT_ADMIN**. Authorize Swagger bằng JWT_ADMIN.

`POST /auth/login` với 1 tài khoản customer bất kỳ đã seed (hoặc tự `POST /auth/register` 1 tài
khoản mới rồi kích hoạt) để có **JWT_CUSTOMER**. Dùng JWT_CUSTOMER: thêm sản phẩm vào giỏ (`PUT
/cart/items/:productId`) rồi `POST /orders` (Idempotency-Key bất kỳ) 2-3 lần với sản phẩm/giỏ khác
nhau để có vài order **PENDING**.

Authorize lại JWT_ADMIN. `PATCH /admin/orders/:id/status` với `{ "status": "CONFIRMED" }` cho 1
trong các order vừa tạo, để có ít nhất 1 order **không phải PENDING** (dùng test filter ở mục 2c).

## 2. Xuất file Excel — `GET /admin/orders/export`

### Happy path

`GET /admin/orders/export` (Authorize JWT_ADMIN, không query param). **Kỳ vọng:** `200`,
`Content-Type: application/vnd.openxmlformats-officedocument.spreadsheetml.sheet`,
`Content-Disposition: attachment; filename="orders-export.xlsx"`. Swagger UI hiện nút **Download
file** thay vì hiển thị JSON — tải về, mở bằng Excel/LibreOffice/Google Sheets.

**Kỳ vọng nội dung file:** 1 sheet "Orders", dòng đầu là header (`Order ID`, `Status`, `Total
(VND)`, `Recipient`, `Phone`, `Created At`, `Completed At`), các dòng sau đúng số order đã tạo ở
mục 1, sắp xếp mới nhất trước (`Created At` giảm dần).

### 2a. Test edge — RBAC

Authorize JWT_CUSTOMER, gọi `GET /admin/orders/export`. **Kỳ vọng:** `403`. Authorize → Logout, gọi
lại. **Kỳ vọng:** `401`. Xong thì Authorize lại JWT_ADMIN.

### 2b. Test edge — filter theo `status`

`GET /admin/orders/export?status=PENDING`. **Kỳ vọng:** `200`, file tải về **chỉ chứa** các order
đang PENDING — order đã chuyển CONFIRMED ở mục 1 **không xuất hiện** trong file này.

### 2c. Test edge — không có order nào khớp filter

`GET /admin/orders/export?status=REJECTED` (giả sử chưa có order nào REJECTED). **Kỳ vọng:** vẫn
`200`, file tải về hợp lệ, chỉ có duy nhất dòng header, không có dòng dữ liệu nào (không lỗi 404,
export rỗng vẫn là 1 file Excel hợp lệ).

## 3. Tổng hợp bằng chứng cho PR

- Screenshot response header (Content-Type/Content-Disposition) ở mục Happy path.
- Screenshot mở file `.xlsx` đã tải bằng Excel/LibreOffice/Google Sheets, thấy rõ header + dữ liệu
  đúng số order đã tạo.
- Screenshot file mục 2b (chỉ còn order PENDING) so sánh với file Happy path (đủ cả PENDING lẫn
  CONFIRMED) để chứng minh filter hoạt động đúng.
- Screenshot 401/403 ở mục 2a.

Không cần quay video liền mạch — đính kèm trực tiếp file `.xlsx` đã tải về (cùng với screenshot mở
file) là bằng chứng trực quan nhất cho loại tính năng này.
