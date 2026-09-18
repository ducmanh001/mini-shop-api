# PR11 — Hướng dẫn test thủ công bằng Swagger UI (bằng chứng cho reviewer)

Test end-to-end thật trên môi trường local (không mock): app + Postgres qua `docker-compose`,
thao tác hoàn toàn qua Swagger UI (`http://localhost:3001/api-docs`). PR11 không phát sinh email
nào nên không cần mở Mailpit.

Phạm vi: `GET /cart`, `PUT /cart/items/:productId`, `DELETE /cart/items/:productId` (CART-01,
CART-02, CART-03).

## 0. Chuẩn bị

1. `docker compose up -d` (nếu chưa chạy) — kiểm tra container `postgres` `healthy`: `docker ps`.
2. Có file `.env` ở root repo (copy từ `.env.example`, điền `JWT_SECRET`/`NOTIFICATION_SECRET_KEY`
   như PR06). PR11 không thêm entity/migration mới nên `npm run migration:run` chỉ cần khớp
   migration hiện có (từ PR04 trở đi).
3. `npm run seed -- --profile=demo` — tạo/giữ nguyên (idempotent) 1 admin + **2 customer**
   (`customer1`, `customer2` — cần cả hai cho case ownership bên dưới), cùng mật khẩu demo
   `Demo@12345`, cộng 3 category và 16 product demo sẵn. Chú ý các sản phẩm dùng trong guide này:
   `DT-001` (Aurora X1, tồn 25, active), `DT-004` (Nova Max, **tồn 0**, active), `DT-005` (Orbit
   Mini, **tồn 1**, active), `DT-006` (Orbit Classic, **archived**, `isActive=false`).
4. `npm run start:dev` — app chạy ở `http://localhost:3001`.
5. Mở Swagger UI: `http://localhost:3001/api-docs`.

**Ghi hình/chụp:** bắt đầu quay từ bước `docker ps`.

**Cách gắn JWT vào Swagger UI:** bấm **Authorize** (biểu tượng ổ khoá) → dán **chỉ raw JWT** (không
thêm chữ `Bearer`) vào ô `Value` → **Authorize** → **Close**. Muốn đổi JWT thì **Authorize** →
**Logout** → dán JWT mới → **Authorize** lại. Test case "không có token" thì **Authorize** →
**Logout** (không dán gì) trước khi gọi endpoint đó.

## 1. Đăng nhập — lấy JWT_ADMIN, JWT_CUSTOMER1, JWT_CUSTOMER2

`POST /auth/login` với `{ "email": "admin@mini-shop.example.com", "password": "Demo@12345" }`.
**Kỳ vọng:** `200`, `user.role = "ADMIN"`. **Copy JWT** → gọi là **JWT_ADMIN**.

`POST /auth/login` với `{ "email": "customer1@mini-shop.example.com", "password": "Demo@12345" }`.
**Kỳ vọng:** `200`. **Copy JWT** → gọi là **JWT_CUSTOMER1**.

`POST /auth/login` với `{ "email": "customer2@mini-shop.example.com", "password": "Demo@12345" }`.
**Kỳ vọng:** `200`. **Copy JWT** → gọi là **JWT_CUSTOMER2** (chỉ dùng ở case ownership, mục 6).

`GET /products` (không cần Authorize) để xác nhận id các sản phẩm dùng trong guide khớp seed —
copy sẵn id của `DT-001`, `DT-004`, `DT-005` → gọi lần lượt là **DT001_ID**, **DT004_ID**,
**DT005_ID**. Copy id của `DT-006` qua `GET /admin/products?q=Orbit+Classic` (đã Authorize
JWT_ADMIN) → **DT006_ID**.

Authorize Swagger bằng **JWT_CUSTOMER1** cho các mục 2-5 bên dưới.

## 2. Xem giỏ hàng — `GET /cart`

### Happy path — giỏ rỗng

`GET /cart`. **Kỳ vọng:** `200`, `{"cart":{"items":[],"totalVnd":"0"}}` — customer1 chưa từng thêm
gì (DB được truncate/seed lại mỗi lần chạy migration/seed sạch; nếu đã chạy case khác trước đó thì
giỏ có thể không rỗng, chỉ cần xác nhận response đúng shape).

### 2a. Test edge — không có token

Authorize → Logout, gọi lại `GET /cart`. **Kỳ vọng:** `401`. Xong thì Authorize lại JWT_CUSTOMER1.

### 2b. Test edge — RBAC, token ADMIN

Authorize JWT_ADMIN, gọi `GET /cart`. **Kỳ vọng:** `403` — cart chỉ dành cho `CUSTOMER`, admin
không có giỏ hàng riêng. Xong thì Authorize lại JWT_CUSTOMER1.

## 3. Đặt số lượng sản phẩm trong giỏ — `PUT /cart/items/:productId`

### Happy path — thêm dòng mới

`PUT /cart/items/{DT001_ID}` với body `{ "quantity": 2 }`. **Kỳ vọng:** `200`, `cart.items` có đúng
1 phần tử: `productId = DT001_ID`, `quantity = 2`, `unitPriceVnd` = giá hiện tại của DT-001,
`lineTotalVnd = unitPriceVnd * 2`, `available = true`. `cart.totalVnd` bằng đúng `lineTotalVnd` này.

### 3a. Test edge quan trọng — PUT là absolute set, không cộng dồn

`PUT /cart/items/{DT001_ID}` lần nữa với `{ "quantity": 5 }`. **Kỳ vọng:** `200`, `cart.items` vẫn
chỉ **1 phần tử** (không tạo dòng trùng), `quantity = 5` (không phải `2 + 5 = 7`).

### 3b. Test edge — quantity = 0

`PUT /cart/items/{DT004_ID}` với `{ "quantity": 0 }`. **Kỳ vọng:** `400`.

### 3c. Test edge — quantity = 100 (vượt cận 1..99)

`PUT /cart/items/{DT004_ID}` với `{ "quantity": 100 }`. **Kỳ vọng:** `400`.

### 3d. Test edge — productId sai định dạng UUID

`PUT /cart/items/not-a-uuid` với `{ "quantity": 1 }`. **Kỳ vọng:** `400`.

### 3e. Test edge — sản phẩm không tồn tại

`PUT /cart/items/00000000-0000-4000-8000-000000000000` với `{ "quantity": 1 }`. **Kỳ vọng:** `404`.

### 3f. Test edge — sản phẩm đã archived (không visible)

`PUT /cart/items/{DT006_ID}` với `{ "quantity": 1 }`. **Kỳ vọng:** `404` — cùng rule visibility với
PROD-02, dù id có thật trong DB.

### 3g. Test edge — vượt tồn kho

`PUT /cart/items/{DT005_ID}` (Orbit Mini, tồn `1`) với `{ "quantity": 2 }`. **Kỳ vọng:** `409`.

### 3h. Test edge — RBAC/không token

Authorize JWT_ADMIN, gọi lại "Happy path" (`DT001_ID`, `quantity: 1`). **Kỳ vọng:** `403`.
Authorize → Logout, gọi lại. **Kỳ vọng:** `401`. Xong thì Authorize lại JWT_CUSTOMER1.

### 3i. Test edge — giới hạn tối đa 20 sản phẩm khác nhau/user

Bước này cần 21 sản phẩm active khác nhau nên hơi dài — Authorize JWT_ADMIN trước:

1. Tạo nhanh 20 sản phẩm test qua `POST /admin/products`, mỗi lần chỉ đổi `sku`/`name` (giữ
   nguyên `categoryId` = id của `phu-kien`, `priceVnd: "50000"`, `stock: 10`):
   `sku: "CART-LIMIT-01"` .. `"CART-LIMIT-20"`, `name: "Cart Limit 01"` .. `"Cart Limit 20"`. Copy
   20 id → **CART_LIMIT_IDS[1..20]**.
2. Tạo thêm 1 sản phẩm nữa cùng cách (`sku: "CART-LIMIT-21"`) → **CART_LIMIT_21_ID**.
3. Authorize lại JWT_CUSTOMER1. `PUT /cart/items/{id}` với `{ "quantity": 1 }` cho **từng id** ở
   `CART_LIMIT_IDS[1..20]` — 20 lần liên tiếp (Swagger UI giữ nguyên body, chỉ cần sửa `productId`
   trên URL mỗi lần). **Kỳ vọng mỗi lần:** `200`.
4. `PUT /cart/items/{CART_LIMIT_21_ID}` với `{ "quantity": 1 }`. **Kỳ vọng:** `409` — giỏ đã đủ 20
   sản phẩm khác nhau (cộng cả `DT001_ID` ở "Happy path" thì thực tế đã hơn 20, nhưng rule chỉ
   quan tâm giỏ có `>= 20` dòng khi thêm dòng MỚI, số chính xác không quan trọng bằng việc chốt
   chặn đúng ngưỡng).
5. `DELETE /cart/items/{CART_LIMIT_IDS[1]}`. **Kỳ vọng:** `204`.
6. Gọi lại bước 4 y hệt (`PUT /cart/items/{CART_LIMIT_21_ID}`, `{ "quantity": 1 }`). **Kỳ vọng:**
   `200` — vừa xóa bớt 1 dòng nên chèn được dòng mới; chứng minh giới hạn tính theo số dòng **hiện
   tại**, không phải tổng số lần PUT đã gọi.

## 4. Dòng giỏ vẫn hiển thị khi product bị archived, nhưng `available=false`

Authorize JWT_ADMIN. Chọn 1 sản phẩm còn active trong giỏ hiện tại của customer1 (vd `DT001_ID`).
`DELETE /admin/products/{DT001_ID}`. **Kỳ vọng:** `204`.

Authorize lại JWT_CUSTOMER1. `GET /cart`. **Kỳ vọng:** `200`, dòng `productId = DT001_ID` **vẫn còn
trong `cart.items`** (không tự biến mất), nhưng `available = false`. `cart.totalVnd` vẫn cộng dòng
này vào tổng (chỉ tham khảo, không phải giá đã chốt — api-contract.md dòng 311).

## 5. Xóa sản phẩm khỏi giỏ — `DELETE /cart/items/:productId`

Authorize JWT_CUSTOMER1.

### Happy path

`DELETE /cart/items/{DT005_ID}` (đã thêm ở mục 3g nếu case đó chạy trước, hoặc `PUT` lại với
quantity hợp lệ trước — vd `{ "quantity": 1 }` — rồi mới xóa). **Kỳ vọng:** `204`. `GET /cart`.
**Kỳ vọng:** không còn `productId = DT005_ID` trong `cart.items`.

### 5a. Test edge — idempotent, gọi lại lần nữa

`DELETE /cart/items/{DT005_ID}` (dòng đã bị xóa ở trên). **Kỳ vọng:** vẫn `204` (không lỗi, không
`404`).

### 5b. Test edge — productId sai định dạng UUID

`DELETE /cart/items/not-a-uuid`. **Kỳ vọng:** `400`.

### 5c. Test edge — RBAC/không token

Authorize JWT_ADMIN, gọi `DELETE /cart/items/{DT004_ID}`. **Kỳ vọng:** `403`. Authorize → Logout,
gọi lại. **Kỳ vọng:** `401`. Xong thì Authorize lại JWT_CUSTOMER1.

## 6. Ownership — không thấy/đụng được giỏ của customer khác

Authorize JWT_CUSTOMER2. `GET /cart`. **Kỳ vọng:** `200`, `cart.items` **không chứa** bất kỳ dòng
nào của customer1 (vd không có `CART_LIMIT_IDS`/`DT004_ID` nếu customer1 đang có các dòng đó).

`PUT /cart/items/{DT004_ID}` với `{ "quantity": 3 }` (dùng `DT004_ID` dù tồn `0` sẽ `409` — đổi
sang 1 sản phẩm còn tồn nếu cần, vd `DT005_ID` sau khi đã bị customer1 xóa ở mục 5). **Kỳ vọng:**
`200` — giỏ của customer2 độc lập hoàn toàn.

Authorize lại JWT_CUSTOMER1. `GET /cart`. **Kỳ vọng:** dòng vừa customer2 thêm **không xuất hiện**
trong giỏ của customer1 — 2 giỏ tách biệt dù cùng thao tác trên cùng 1 `productId`.

## 7. Concurrency (không demo thủ công — xem evidence tự động)

Khóa row `users` trước khi ghi giỏ (database.md mục 6) và test "2 request cùng lúc không mất write
/ không tạo trùng dòng" (CODING_STANDARD.md mục 22) cần độ chính xác thời gian mà việc bấm tay 2
tab Swagger không đảm bảo được. Bằng chứng cho case này là **kết quả chạy `test/cart.e2e-spec.ts`**
(dùng `Promise.all` bắn 2 request thật cùng lúc), không phải thao tác thủ công — đính kèm output
console của `npm run test:e2e -- cart.e2e-spec.ts` (24/24 pass) làm evidence thay cho screenshot
Swagger ở mục này.

## 8. Tổng hợp bằng chứng cho PR

Đặt tên file/thư mục evidence gợi ý (đính kèm vào PR hoặc Google Drive rồi dán link vào mô tả PR):

```
docs/testing/evidence/pr11/
├── 01-login-admin-200.png
├── 02-login-customer1-200.png
├── 03-login-customer2-200.png
├── 04-cart-empty-200.png
├── 05-cart-get-no-token-401.png
├── 06-cart-get-rbac-403.png
├── 07-cart-put-add-200.png
├── 08-cart-put-absolute-set-200-qty5.png
├── 09-cart-put-quantity-zero-400.png
├── 10-cart-put-quantity-100-400.png
├── 11-cart-put-bad-uuid-400.png
├── 12-cart-put-not-found-404.png
├── 13-cart-put-archived-product-404.png
├── 14-cart-put-exceeds-stock-409.png
├── 15-cart-put-rbac-403.png
├── 16-cart-put-no-token-401.png
├── 17-cart-put-20-lines-ok.png
├── 18-cart-put-21st-line-409.png
├── 19-cart-delete-one-line-204.png
├── 20-cart-put-21st-line-after-delete-200.png
├── 21-cart-line-unavailable-after-archive-200.png
├── 22-cart-delete-204.png
├── 23-cart-delete-idempotent-204.png
├── 24-cart-delete-bad-uuid-400.png
├── 25-cart-delete-rbac-403.png
├── 26-cart-customer2-does-not-see-customer1-200.png
├── 27-cart-customer1-does-not-see-customer2-200.png
├── 28-cart-e2e-console-24-passed.png
└── pr11-demo.mp4   (video quay liền mạch mục 1 → 6)
```

Không bắt buộc đúng tên file này — quan trọng là mỗi ảnh/đoạn video thể hiện rõ **request +
response** (status code + body), đặc biệt mục 3a (absolute set, không cộng dồn), mục 3i (giới hạn
20 dòng) và mục 4 (dòng vẫn hiển thị `available=false` sau khi product bị archive) vì đây là 3
điều kiện nghiệm thu cốt lõi của PR11.
