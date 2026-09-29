# PR10 — Hướng dẫn test thủ công bằng Swagger UI (bằng chứng cho reviewer)

Test end-to-end thật trên môi trường local (không mock): app + Postgres + Redis qua
`docker-compose`, thao tác hoàn toàn qua Swagger UI (`http://localhost:3001/api-docs`). PR10 không
phát sinh email riêng của review, nhưng **luồng chuẩn bị** (checkout, admin đổi trạng thái đơn) có
gửi mail nên vẫn cần Redis chạy; không cần mở Mailpit để nghiệm thu PR này.

Phạm vi: `GET /products/:id/reviews`, `POST /products/:id/reviews`, `PATCH /reviews/:id`,
`DELETE /reviews/:id` (REVIEW-01..04). Để chứng minh rule "chỉ review sản phẩm đã mua hoàn tất" cần
dùng thêm `PUT /cart/items/:productId`, `POST /orders`, `PATCH /admin/orders/:id/status` ở vai trò
**bước chuẩn bị dữ liệu** — các endpoint này không thuộc phạm vi nghiệm thu của PR10.

## 0. Chuẩn bị

1. `docker compose up -d` (nếu chưa chạy) — kiểm tra `postgres`/`redis` `healthy`: `docker ps`.
2. Có file `.env` ở root repo (copy từ `.env.example`, điền `JWT_SECRET`/`NOTIFICATION_SECRET_KEY`
   như PR06).
3. `npm run migration:run` — PR10 **không thêm migration**: bảng `reviews` (unique
   `uq_reviews_user_product`, CHECK rating 1..5, index `idx_reviews_product_created_id`) đã có sẵn
   từ PR04, chỉ cần DB khớp migration mới nhất.
4. `npm run seed -- --profile=demo` — 1 admin (`admin@mini-shop.example.com`) + 2 customer
   (`customer1@…`, `customer2@…`), mật khẩu chung `Demo@12345`, cùng 16 product demo. Seed **không**
   có đơn hàng nào nên mọi điều kiện "đã mua" phải tự tạo ở mục 2 và 4.
5. `npm run start:dev` — app chạy ở `http://localhost:3001`.
6. Mở Swagger UI: `http://localhost:3001/api-docs`.
7. Cần 2 sản phẩm demo còn hàng và đang active (id lấy qua `GET /products?q=Aurora`):
   - **PRODUCT_A** = `Điện thoại Aurora X1` (DT-001, tồn 25) — sản phẩm sẽ được mua và review.
   - **PRODUCT_B** = `Điện thoại Aurora X1 Pro` (DT-002, tồn 15) — sản phẩm **không** mua, dùng cho
     case 409 "chưa mua".
   - **PRODUCT_ARCHIVED** = `Orbit Classic` (DT-006, đã archived) — dùng cho case 404 visibility.

**Ghi hình/chụp:** bắt đầu quay từ bước `docker ps`.

**Cách gắn JWT vào Swagger UI:** bấm **Authorize** → dán **chỉ raw JWT** (không thêm chữ `Bearer`)
vào ô `Value` → **Authorize** → **Close**. Đổi JWT thì **Authorize** → **Logout** → dán JWT mới →
**Authorize** lại. Case "không có token" thì **Authorize** → **Logout** (không dán gì) trước khi gọi.

## 1. Đăng nhập — lấy 3 JWT

`POST /auth/login` lần lượt với `admin@…`, `customer1@…`, `customer2@…` (cùng mật khẩu
`Demo@12345`). **Kỳ vọng:** `200` cả 3. **Copy** thành **JWT_ADMIN**, **JWT_CUSTOMER1**,
**JWT_CUSTOMER2**. Ghi lại `user.id` của customer1 (**CUSTOMER1_ID**) để so với `author.id` ở
các bước sau.

## 2. Chuẩn bị — customer1 đặt đơn PRODUCT_A (chưa hoàn tất)

Authorize bằng JWT_CUSTOMER1.

1. `PUT /cart/items/{PRODUCT_A_ID}` với `{ "quantity": 1 }`. **Kỳ vọng:** `200`.
2. `POST /orders` với header `Idempotency-Key` = 1 UUID bất kỳ và body:

   ```json
   {
     "recipientName": "Nguyen An",
     "phone": "+84901234567",
     "address": "123 Sample Street, Hanoi"
   }
   ```

   **Kỳ vọng:** `201`, `order.status = "PENDING"`. **Copy `order.id`** → **ORDER_1_ID**.

## 3. Tạo review khi chưa đủ điều kiện — `POST /products/:id/reviews`

Đang Authorize bằng JWT_CUSTOMER1. Body dùng chung cho mục này: `{ "rating": 5, "comment": "Sản phẩm
tốt." }`.

### 3a. Test edge — đơn mới chỉ PENDING, chưa COMPLETED

`POST /products/{PRODUCT_A_ID}/reviews`. **Kỳ vọng:** `409` (message `reviewRequiresCompletedPurchase`)
— có đơn chứa sản phẩm nhưng chưa hoàn tất thì chưa được review.

### 3b. Test edge — sản phẩm chưa từng mua

`POST /products/{PRODUCT_B_ID}/reviews`. **Kỳ vọng:** `409`, cùng message như 3a.

### 3c. Test edge — sản phẩm không visible

`POST /products/{PRODUCT_ARCHIVED_ID}/reviews`. **Kỳ vọng:** `404` (product archived không còn
public). Thứ tự kiểm tra là visibility trước, mua hàng sau.

### 3d. Test edge — id không tồn tại / sai định dạng

`POST /products/00000000-0000-4000-8000-000000000000/reviews` → **Kỳ vọng:** `404`.
`POST /products/not-a-uuid/reviews` → **Kỳ vọng:** `400`.

### 3e. Test edge — không có token / sai role

Authorize → Logout, gọi lại 3a → **Kỳ vọng:** `401`. Authorize JWT_ADMIN, gọi lại 3a → **Kỳ vọng:**
`403` (admin không viết review thay customer). Xong thì Authorize lại JWT_CUSTOMER1.

## 4. Chuẩn bị — admin đưa ORDER_1 lên COMPLETED

Authorize bằng JWT_ADMIN.

1. `PATCH /admin/orders/{ORDER_1_ID}/status` với `{ "status": "CONFIRMED" }`. **Kỳ vọng:** `200`.
2. Authorize JWT_CUSTOMER1, gọi lại 3a. **Kỳ vọng:** vẫn `409` — CONFIRMED chưa đủ.
3. Authorize JWT_ADMIN, `PATCH …/status` với `{ "status": "COMPLETED" }`. **Kỳ vọng:** `200`,
   `order.status = "COMPLETED"`.

Authorize lại bằng JWT_CUSTOMER1.

## 5. Tạo review — `POST /products/:id/reviews`

### Happy path

`POST /products/{PRODUCT_A_ID}/reviews` với `{ "rating": 5, "comment": "  Sản phẩm đúng mô tả.  " }`.
**Kỳ vọng:** `201`, `review.rating = 5`, `review.comment = "Sản phẩm đúng mô tả."` (đã trim),
`review.author = { id: CUSTOMER1_ID, username: "customer1" }`, có `createdAt`/`updatedAt`,
**không có field `email` ở bất kỳ đâu** trong response. **Copy `review.id`** → **REVIEW_1_ID**.

### 5a. Test edge quan trọng — review lần hai cùng sản phẩm

Gọi lại y hệt happy path (đổi `rating` thành 1). **Kỳ vọng:** `409` (message
`reviewAlreadyExists`) — unique `(user_id, product_id)`.

### 5b. Test edge — validation body

Mỗi body dưới đây gọi `POST /products/{PRODUCT_A_ID}/reviews`. **Kỳ vọng:** `400` cho tất cả:

| Body                                                   | Lý do                          |
| ------------------------------------------------------ | ------------------------------ |
| `{ "rating": 0, "comment": "ok" }`                     | rating dưới 1                  |
| `{ "rating": 6, "comment": "ok" }`                     | rating trên 5                  |
| `{ "rating": 4.5, "comment": "ok" }`                   | rating không phải số nguyên    |
| `{ "rating": "5", "comment": "ok" }`                   | rating là chuỗi                |
| `{ "comment": "ok" }`                                  | thiếu rating                   |
| `{ "rating": 5 }`                                      | thiếu comment                  |
| `{ "rating": 5, "comment": "   " }`                    | comment toàn khoảng trắng      |
| `{ "rating": 5, "comment": "<chuỗi 2001 ký tự 'a'>" }` | comment vượt 2000 ký tự        |
| `{ "rating": 5, "comment": "ok", "userId": "<uuid>" }` | field lạ (không nhận `userId`) |

> Validation chạy trước khi tới service nên các case này trả `400` kể cả với user chưa đủ điều kiện.

## 6. Danh sách review công khai — `GET /products/:id/reviews`

Không cần Authorize (route public) — **Authorize → Logout** trước khi gọi.

### 6a. Chuẩn bị thêm review thứ hai (customer2) để có aggregate

Lặp lại mục 2 → 4 và 5 cho **customer2** với **cùng PRODUCT_A**: Authorize JWT_CUSTOMER2 →
`PUT /cart/items/{PRODUCT_A_ID}` `{ "quantity": 1 }` → `POST /orders` (Idempotency-Key mới) → Authorize
JWT_ADMIN → `PATCH …/status` CONFIRMED rồi COMPLETED → Authorize JWT_CUSTOMER2 →
`POST /products/{PRODUCT_A_ID}/reviews` với `{ "rating": 4, "comment": "Dùng ổn." }` (**Kỳ vọng:**
`201`). **Copy `review.id`** → **REVIEW_2_ID**. Xong thì **Authorize → Logout**.

### Happy path

`GET /products/{PRODUCT_A_ID}/reviews`. **Kỳ vọng:** `200`, `reviewsCount = 2`,
`averageRating = "4.5"` (chuỗi một chữ số thập phân), `reviews[0]` là review của customer2 (mới nhất
trước), `reviews[1]` là của customer1, mỗi phần tử chỉ có `author.id` + `author.username`.

### 6b. Test edge quan trọng — phân trang không làm sai count/average

`GET /products/{PRODUCT_A_ID}/reviews?limit=1&offset=0`. **Kỳ vọng:** `200`, `reviews` chỉ 1 phần
tử (customer2) nhưng `reviewsCount` vẫn `2` và `averageRating` vẫn `"4.5"` — aggregate tính trên
**toàn bộ** review của sản phẩm, không phải trang hiện tại. Đổi sang `offset=1` → **Kỳ vọng:** đúng
review của customer1.

### 6c. Test edge — sản phẩm chưa có review

`GET /products/{PRODUCT_B_ID}/reviews`. **Kỳ vọng:** `200`,
`{ "reviews": [], "reviewsCount": 0, "averageRating": null }`.

### 6d. Test edge — sản phẩm không visible / không tồn tại

`GET /products/{PRODUCT_ARCHIVED_ID}/reviews` → **Kỳ vọng:** `404`.
`GET /products/00000000-0000-4000-8000-000000000000/reviews` → **Kỳ vọng:** `404`.

### 6e. Test edge — pagination sai / id sai

`?limit=0`, `?limit=51`, `?offset=-1` → **Kỳ vọng:** `400` cả ba. `GET /products/not-a-uuid/reviews` →
**Kỳ vọng:** `400`.

## 7. Sửa review của mình — `PATCH /reviews/:id`

Authorize bằng JWT_CUSTOMER1.

### Happy path — sửa một field

`PATCH /reviews/{REVIEW_1_ID}` với `{ "comment": "Cập nhật sau một tuần sử dụng." }`. **Kỳ vọng:**
`200`, `comment` đổi, `rating` **giữ nguyên `5`**, `updatedAt` ≥ `createdAt`.

### Happy path — sửa cả hai field và ảnh hưởng aggregate

`PATCH /reviews/{REVIEW_1_ID}` với `{ "rating": 2, "comment": "Tệ hơn dự kiến." }`. **Kỳ vọng:**
`200`. Sau đó `GET /products/{PRODUCT_A_ID}/reviews` (public) → **Kỳ vọng:** `averageRating =
"3.0"` (customer1 = 2, customer2 = 4).

### 7a. Test edge — body rỗng

`PATCH /reviews/{REVIEW_1_ID}` với `{}`. **Kỳ vọng:** `400`.

### 7b. Test edge — giá trị không hợp lệ

`{ "rating": null }`, `{ "rating": 9 }`, `{ "comment": "  " }`, `{ "comment": null }`,
`{ "rating": 3, "productId": "<uuid>" }` (field lạ). **Kỳ vọng:** `400` cả năm — `null` không được
coi là "bỏ qua".

### 7c. Test edge quan trọng — sửa review của người khác

Authorize JWT_CUSTOMER1, `PATCH /reviews/{REVIEW_2_ID}` với `{ "rating": 1 }`. **Kỳ vọng:** `404` (không
phải `403`) — không lộ review đó có tồn tại hay không. Xác nhận review của customer2 không đổi:
`GET /products/{PRODUCT_A_ID}/reviews` vẫn thấy `rating = 4`.

### 7d. Test edge — id không tồn tại / sai định dạng

`PATCH /reviews/00000000-0000-4000-8000-000000000000` `{ "rating": 3 }` → **Kỳ vọng:** `404`.
`PATCH /reviews/not-a-uuid` → **Kỳ vọng:** `400`.

### 7e. Test edge — không có token / admin

Authorize → Logout → **Kỳ vọng:** `401`. Authorize JWT_ADMIN, `PATCH /reviews/{REVIEW_1_ID}`
`{ "rating": 3 }` → **Kỳ vọng:** `403` (admin không sửa nội dung thay customer).

## 8. Xóa review của mình — `DELETE /reviews/:id`

### 8a. Test edge quan trọng — xóa review của người khác

Authorize JWT_CUSTOMER1, `DELETE /reviews/{REVIEW_2_ID}`. **Kỳ vọng:** `404`. Review của customer2 vẫn
còn: `GET /products/{PRODUCT_A_ID}/reviews` → `reviewsCount = 2`.

### 8b. Test edge — không có token / admin

Authorize → Logout → `DELETE /reviews/{REVIEW_1_ID}` → **Kỳ vọng:** `401`. Authorize JWT_ADMIN, gọi
lại → **Kỳ vọng:** `403`. Xong thì Authorize lại JWT_CUSTOMER1.

### Happy path

`DELETE /reviews/{REVIEW_1_ID}`. **Kỳ vọng:** `204`. `GET /products/{PRODUCT_A_ID}/reviews` (public)
→ **Kỳ vọng:** `reviewsCount = 1`, `averageRating = "4.0"` (chỉ còn review 4 sao của customer2).

### 8c. Test edge — xóa lại lần hai

`DELETE /reviews/{REVIEW_1_ID}` lần nữa. **Kỳ vọng:** `404` (không idempotent 204 — khác cart, review
là tài nguyên có id riêng).

### 8d. Test edge — xóa xong review lại được lần nữa

`POST /products/{PRODUCT_A_ID}/reviews` bằng JWT_CUSTOMER1 với `{ "rating": 3, "comment": "Đánh giá
lại." }`. **Kỳ vọng:** `201` — unique constraint chỉ chặn khi review còn tồn tại.

### 8e. Test edge — id sai định dạng

`DELETE /reviews/not-a-uuid` → **Kỳ vọng:** `400`.

## 9. Sản phẩm bị ẩn sau khi đã có review

Authorize JWT_ADMIN, `DELETE /admin/products/{PRODUCT_A_ID}` (archive) → **Kỳ vọng:** `204`.

- `GET /products/{PRODUCT_A_ID}/reviews` (public) → **Kỳ vọng:** `404`.
- Authorize JWT_CUSTOMER2, `PATCH /reviews/{REVIEW_2_ID}` `{ "comment": "Sửa khi sản phẩm đã ẩn." }` →
  **Kỳ vọng:** `200` — chủ review vẫn sửa/xóa được review của mình dù sản phẩm không còn public,
  chỉ **tạo mới** và **xem list** mới đòi sản phẩm visible.

Xong thì khôi phục để không ảnh hưởng dữ liệu demo: `PATCH /admin/products/{PRODUCT_A_ID}` với
`{ "isActive": true }`.

## 10. Tổng hợp bằng chứng cho PR

Đặt tên file/thư mục evidence gợi ý (đính kèm vào PR hoặc Google Drive rồi dán link vào mô tả PR):

```
docs/testing/evidence/pr10/
├── 01-login-3-accounts-200.png
├── 02-cart-and-checkout-pending-201.png
├── 03a-review-order-pending-409.png
├── 03b-review-not-purchased-409.png
├── 03c-review-product-archived-404.png
├── 03d-review-unknown-and-bad-uuid-404-400.png
├── 03e-review-no-token-401-admin-403.png
├── 04-order-confirmed-completed-200.png
├── 04b-review-order-confirmed-409.png
├── 05-review-create-201-trimmed-no-email.png
├── 05a-review-duplicate-409.png
├── 05b-review-validation-400-x9.png
├── 06a-review-customer2-201.png
├── 06-reviews-list-200-count2-avg-4.5.png
├── 06b-reviews-list-paginated-count-unchanged.png
├── 06c-reviews-list-empty-null-average.png
├── 06d-reviews-list-not-visible-404.png
├── 06e-reviews-list-bad-pagination-400.png
├── 07-review-patch-one-field-200.png
├── 07-review-patch-both-fields-avg-3.0.png
├── 07a-review-patch-empty-body-400.png
├── 07b-review-patch-invalid-values-400-x5.png
├── 07c-review-patch-other-user-404.png
├── 07d-review-patch-unknown-and-bad-uuid.png
├── 07e-review-patch-no-token-401-admin-403.png
├── 08a-review-delete-other-user-404.png
├── 08b-review-delete-no-token-401-admin-403.png
├── 08-review-delete-204-avg-4.0.png
├── 08c-review-delete-twice-404.png
├── 08d-review-recreate-after-delete-201.png
├── 09-product-archived-list-404-owner-patch-200.png
└── pr10-demo.mp4   (video quay liền mạch bước 1 → 9)
```

Không bắt buộc đúng tên file này — quan trọng là mỗi ảnh/đoạn video thể hiện rõ **request +
response** (status code + body), đặc biệt 3 điều kiện nghiệm thu cốt lõi của PR10: **verified
purchase** (3a/3b/4b vs 5 — chỉ đơn COMPLETED mới được review), **unique user/product** (5a, 8d) và
**ownership trả 404** (7c, 8a — không lộ review của người khác).
