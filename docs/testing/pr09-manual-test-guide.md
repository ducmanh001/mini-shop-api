# PR09 — Hướng dẫn test thủ công bằng Swagger UI (bằng chứng cho reviewer)

Test end-to-end thật trên môi trường local (không mock): app + Postgres qua `docker-compose`,
thao tác hoàn toàn qua Swagger UI (`http://localhost:3001/api-docs`) — kể cả upload file (đã thêm
`@ApiBody` schema binary cho endpoint ảnh nên Swagger UI hiển thị đúng ô chọn file, không cần
Postman). PR09 không phát sinh email nào nên không cần mở Mailpit.

Phạm vi: `GET /categories`, `GET/POST/PATCH/DELETE /admin/categories(/:id)`, `GET /products`,
`GET /products/:id`, `GET/POST/PATCH/DELETE /admin/products(/:id)`, `POST|DELETE
/admin/products/:id/image`, `GET /attachments/:id` (CAT-01..05, PROD-01..06, FILE-01..03).

## 0. Chuẩn bị

1. `docker compose up -d` (nếu chưa chạy) — kiểm tra container `postgres` `healthy`: `docker ps`.
2. Có file `.env` ở root repo (copy từ `.env.example`, điền `JWT_SECRET`/`NOTIFICATION_SECRET_KEY`
   như PR06). `UPLOAD_DIR` để mặc định (`storage/uploads`) là đủ.
3. `npm run migration:run` (DB dev cần khớp migration mới nhất; PR09 không thêm migration nào,
   entity/schema catalog đã có sẵn từ PR04).
4. `npm run seed -- --profile=demo` — tạo/giữ nguyên (idempotent) 1 admin (`admin` /
   `admin@mini-shop.example.com`) + 2 customer (`customer1`, `customer2`), cùng mật khẩu demo
   `Demo@12345`, **cộng thêm 3 category** (`dien-thoai`, `laptop`, `phu-kien`) **và 16 product** demo
   sẵn (bao gồm cố ý: `DT-004`/`PK-004` hết hàng, `DT-005` còn 1, `DT-006`/`LT-005` đã archived —
   dùng đúng các sản phẩm này cho case visibility bên dưới, không cần tự tạo lại).
5. `npm run start:dev` — app chạy ở `http://localhost:3001`.
6. Mở Swagger UI: `http://localhost:3001/api-docs`.
7. Chuẩn bị sẵn 2 file ảnh thật (JPEG hoặc PNG, <2 MiB) trên máy để dùng ở mục 11-12, và 1 file
   bất kỳ >2 MiB (nội dung gì cũng được — bị chặn ở bước kiểm kích thước trước khi đọc nội dung).

**Ghi hình/chụp:** bắt đầu quay từ bước `docker ps`.

**Cách gắn JWT vào Swagger UI:** bấm **Authorize** (biểu tượng ổ khoá) → dán **chỉ raw JWT** (không
thêm chữ `Bearer`) vào ô `Value` → **Authorize** → **Close**. Muốn đổi JWT thì **Authorize** →
**Logout** → dán JWT mới → **Authorize** lại. Test case "không có token" thì **Authorize** →
**Logout** (không dán gì) trước khi gọi endpoint đó.

## 1. Đăng nhập — lấy JWT_ADMIN và JWT_CUSTOMER1

`POST /auth/login` với `{ "email": "admin@mini-shop.example.com", "password": "Demo@12345" }`.
**Kỳ vọng:** `200`, `user.role = "ADMIN"`. **Copy JWT** → gọi là **JWT_ADMIN** → Authorize Swagger
bằng JWT_ADMIN (dùng cho hầu hết các bước sau).

`POST /auth/login` với `{ "email": "customer1@mini-shop.example.com", "password": "Demo@12345" }`.
**Kỳ vọng:** `200`. **Copy JWT** → gọi là **JWT_CUSTOMER1** (chỉ dùng ở các case RBAC 403 bên dưới,
không Authorize vội).

## 2. Danh mục công khai — `GET /categories`

Không cần Authorize (route public).

### Happy path

`GET /categories`. **Kỳ vọng:** `200`, `categoriesCount = 3`, có `dien-thoai`/`laptop`/`phu-kien`,
mỗi phần tử chỉ có `id`/`name`/`slug`/`isActive`/`createdAt`/`updatedAt`.

### 2a. Test edge — `limit` ngoài khoảng cho phép

`GET /categories?limit=51`. **Kỳ vọng:** `400`.

## 3. Tạo danh mục — `POST /admin/categories`

Đang Authorize bằng JWT_ADMIN.

### Happy path

Body: `{ "name": "Đồng hồ thông minh", "slug": "dong-ho" }`. **Kỳ vọng:** `201`, `category.isActive
= true` (mặc định). **Copy `category.id`** → gọi là **NEW_CATEGORY_ID**.

### 3a. Test edge — slug trùng

Gọi lại y hệt body trên. **Kỳ vọng:** `409`.

### 3b. Test edge — slug sai định dạng (có chữ hoa)

Body: `{ "name": "Test", "slug": "Dong-Ho" }`. **Kỳ vọng:** `400`.

### 3c. Test edge — RBAC, token CUSTOMER

Authorize bằng JWT_CUSTOMER1, gọi lại request ở "Happy path" (slug khác, vd `dong-ho-2`). **Kỳ
vọng:** `403`. Xong thì Authorize lại bằng JWT_ADMIN.

### 3d. Test edge — không có token

Authorize → Logout, gọi lại. **Kỳ vọng:** `401`. Xong thì Authorize lại bằng JWT_ADMIN.

## 4. Danh sách danh mục (admin) — `GET /admin/categories`

### Happy path

`GET /admin/categories`. **Kỳ vọng:** `200`, `categoriesCount = 4` (3 seed + NEW_CATEGORY_ID vừa
tạo) — chứng minh admin thấy được cả danh mục vừa tạo ngay.

### 4a. Test edge — filter `q`

`GET /admin/categories?q=dong+ho`. **Kỳ vọng:** `200`, chỉ có `NEW_CATEGORY_ID`.

## 5. Cập nhật danh mục — `PATCH /admin/categories/:id`

### 5a. Test edge — body rỗng

`PATCH /admin/categories/{NEW_CATEGORY_ID}` với body `{}`. **Kỳ vọng:** `400`.

### 5b. Test edge — id không tồn tại

`PATCH /admin/categories/00000000-0000-4000-8000-000000000000` với `{ "name": "x" }`. **Kỳ vọng:**
`404`.

### Happy path

`PATCH /admin/categories/{NEW_CATEGORY_ID}` với `{ "name": "Đồng hồ & phụ kiện" }`. **Kỳ vọng:**
`200`, `category.name` đổi đúng, `category.slug` giữ nguyên.

## 6. Tìm kiếm/lọc sản phẩm công khai — `GET /products`

Không cần Authorize. Trước tiên `GET /admin/categories` (đã Authorize JWT_ADMIN ở tab khác nếu
cần) để lấy **id của category `dien-thoai`** → gọi là **PHONE_CATEGORY_ID**.

### Happy path

`GET /products` (không query). **Kỳ vọng:** `200`, `productsCount = 14` — **không phải 16**: `DT-006`
và `LT-005` (archived, `isActive=false` trong seed) không xuất hiện dù category của chúng vẫn
active.

### 6a. Test edge — filter theo `categoryId`

`GET /products?categoryId={PHONE_CATEGORY_ID}`. **Kỳ vọng:** `200`, chỉ các sản phẩm `dien-thoai`
đang active (5 sản phẩm: DT-001..005, không có DT-006).

### 6b. Test edge — filter theo `q`

`GET /products?q=Aurora`. **Kỳ vọng:** `200`, đúng 2 sản phẩm (`Aurora X1`, `Aurora X1 Pro`).

### 6c. Test edge — filter theo khoảng giá

`GET /products?minPrice=5000000&maxPrice=10000000`. **Kỳ vọng:** `200`, `productsCount = 3` —
đúng `DT-001` (5.990.000), `DT-004` (6.490.000), `DT-002` (8.990.000); không có `DT-003`
(3.490.000, thấp hơn `minPrice`).

### 6d. Test edge — sản phẩm nổi bật

`GET /products?featured=true`. **Kỳ vọng:** `200`, đúng các sản phẩm có `isFeatured=true` trong
seed (Aurora X1, Aurora X1 Pro, Zenith 14, Zenith 16 Pro, Tai nghe Bluetooth Buds — 5 sản phẩm).

### 6e. Test edge — `minPrice` lớn hơn `maxPrice`

`GET /products?minPrice=9000000&maxPrice=1000000`. **Kỳ vọng:** `400`.

### 6f. Test edge — `minPrice` không phải chuỗi số

`GET /products?minPrice=abc`. **Kỳ vọng:** `400`.

## 7. Chi tiết sản phẩm công khai — `GET /products/:id`

Cần **id của `DT-001`** (từ bước 6, gọi là **DT001_ID**) và **id của `DT-006`** (sản phẩm archived,
gọi là **DT006_ID** — lấy qua `GET /admin/products?q=Orbit+Classic` đã Authorize JWT_ADMIN).

### Happy path

`GET /products/{DT001_ID}`. **Kỳ vọng:** `200`, có `category` lồng (`id`/`name`/`isActive`), `image
= null` (seed không kèm ảnh).

### 7a. Test edge — id sai định dạng UUID

`GET /products/not-a-uuid`. **Kỳ vọng:** `400`.

### 7b. Test edge — id không tồn tại

`GET /products/00000000-0000-4000-8000-000000000000`. **Kỳ vọng:** `404`.

### 7c. Test edge quan trọng — sản phẩm archived không public

`GET /products/{DT006_ID}`. **Kỳ vọng:** `404` — dù id có thật trong DB, `isActive=false` nên
không hiển thị công khai (đúng rule visibility PROD-02).

## 8. Danh sách sản phẩm (admin) — `GET /admin/products`

### Happy path

`GET /admin/products`. **Kỳ vọng:** `200`, `productsCount = 16` — thấy cả `DT-006`/`LT-005`
archived, khác hẳn `GET /products` công khai (14).

### 8a. Test edge — filter `isActive=false`

`GET /admin/products?isActive=false`. **Kỳ vọng:** `200`, đúng 2 phần tử (`DT-006`, `LT-005`).

## 9. Tạo sản phẩm — `POST /admin/products`

### Happy path

Body:

```json
{
  "categoryId": "{PHONE_CATEGORY_ID}",
  "name": "Điện thoại Test PR09",
  "description": "Sản phẩm test tay cho PR09.",
  "sku": "PR09-TEST-001",
  "priceVnd": "4990000",
  "stock": 10
}
```

**Kỳ vọng:** `201`, `isActive=true`/`isFeatured=false` mặc định, `image=null`. **Copy `product.id`**
→ gọi là **TEST_PRODUCT_ID**.

### 9a. Test edge — category không tồn tại

Body như trên nhưng `categoryId` là UUID ngẫu nhiên hợp lệ, `sku` khác (`PR09-TEST-002`). **Kỳ
vọng:** `404`.

### 9b. Test edge — category inactive

Trước tiên `PATCH /admin/categories/{NEW_CATEGORY_ID}` với `{ "isActive": false }` (category tự
tạo ở mục 3, hiện chưa có sản phẩm nào). Sau đó tạo product với `categoryId = NEW_CATEGORY_ID`,
`sku` khác (`PR09-TEST-003`). **Kỳ vọng:** `409`.

### 9c. Test edge — SKU trùng

Body như "Happy path" nhưng `sku = "DT-001"` (đã tồn tại trong seed). **Kỳ vọng:** `409`.

### 9d. Test edge — tên chỉ toàn khoảng trắng

Body như "Happy path" nhưng `name = "   "`, `sku` khác (`PR09-TEST-004`). **Kỳ vọng:** `400`.

### 9e. Test edge — RBAC/không token

Authorize JWT_CUSTOMER1 → gọi lại "Happy path" (sku khác) → **Kỳ vọng:** `403`. Authorize → Logout
→ gọi lại → **Kỳ vọng:** `401`. Xong thì Authorize lại JWT_ADMIN.

## 10. Cập nhật sản phẩm — `PATCH /admin/products/:id`

Dùng **TEST_PRODUCT_ID** (mục 9).

### 10a. Test edge — body rỗng

`PATCH /admin/products/{TEST_PRODUCT_ID}` với `{}`. **Kỳ vọng:** `400`.

### 10b. Test edge — id không tồn tại

`PATCH /admin/products/00000000-0000-4000-8000-000000000000` với `{ "stock": 5 }`. **Kỳ vọng:**
`404`.

### Happy path — `stock` là giá trị tuyệt đối, không cộng dồn

`PATCH /admin/products/{TEST_PRODUCT_ID}` với `{ "stock": 3 }`. **Kỳ vọng:** `200`, `product.stock
= 3`. Gọi lại lần 2 với `{ "stock": 7 }`. **Kỳ vọng:** `200`, `product.stock = 7` (không phải `10`
— chứng minh không cộng dồn 3+7).

### 10c. Test edge — đổi sang category inactive

`PATCH /admin/products/{TEST_PRODUCT_ID}` với `{ "categoryId": "{NEW_CATEGORY_ID}" }` (category đã
deactivate ở 9b). **Kỳ vọng:** `409`.

### 10d. Test edge — SKU trùng

`PATCH /admin/products/{TEST_PRODUCT_ID}` với `{ "sku": "DT-002" }`. **Kỳ vọng:** `409`.

## 11. Upload ảnh sản phẩm — `POST /admin/products/:id/image`

Swagger UI: mở endpoint này, **Try it out**, ô `file` sẽ hiện nút chọn file (nhờ `@ApiBody` schema
`binary` vừa thêm).

### 11a. Test edge — thiếu file

Bấm **Execute** mà không chọn file. **Kỳ vọng:** `400`.

### Happy path — upload ảnh đầu tiên

Chọn 1 file ảnh JPEG/PNG thật (<2 MiB) đã chuẩn bị ở mục 0. **Kỳ vọng:** `200`, `product.image`
khác `null`, có `id`/`url`/`mimeType`/`sizeBytes`. **Copy `image.url`** → gọi là **IMAGE_URL_1**.

### 11b. Xem ảnh vừa upload — `GET /attachments/:id`

Mở tab mới, truy cập `http://localhost:3001{IMAGE_URL_1}` (hoặc gọi qua Swagger UI endpoint `GET
/attachments/{id}` với id lấy từ `image.id`). **Kỳ vọng:** `200`, đúng ảnh vừa upload,
`Content-Type` khớp `mimeType`, header `Cache-Control: no-store`.

### 11c. Test edge — sai MIME khai báo

Đổi tên 1 file `.pdf`/`.txt` bất kỳ thành `.png` rồi chọn file đó để upload (trình duyệt tự khai
`Content-Type` theo đuôi file). **Kỳ vọng:** `415` — chữ ký byte thật không khớp PNG.

### 11d. Test edge — file quá 2 MiB

Chọn file >2 MiB đã chuẩn bị ở mục 0. **Kỳ vọng:** `413`.

### 11e. Test edge — id sản phẩm không tồn tại

`POST /admin/products/00000000-0000-4000-8000-000000000000/image` kèm 1 ảnh hợp lệ. **Kỳ vọng:**
`404`.

### 11f. Test edge quan trọng nhất — thay ảnh, ảnh cũ hết public

Upload ảnh thứ 2 (khác file) lên **cùng TEST_PRODUCT_ID**. **Kỳ vọng:** `200`, `image.id` **khác**
lần upload đầu. **Copy `image.url` mới** → gọi là **IMAGE_URL_2**. Mở lại **IMAGE_URL_1** (ảnh cũ).
**Kỳ vọng:** `404` — ảnh cũ không còn là ảnh hiện tại của product nên không public nữa. Mở
**IMAGE_URL_2** → **Kỳ vọng:** `200`.

## 12. Gỡ ảnh sản phẩm — `DELETE /admin/products/:id/image`

### Happy path

`DELETE /admin/products/{TEST_PRODUCT_ID}/image`. **Kỳ vọng:** `204`. Mở lại **IMAGE_URL_2** →
**Kỳ vọng:** `404`.

### 12a. Test edge — gọi lại khi đã không còn ảnh

Gọi lại y hệt lần nữa. **Kỳ vọng:** vẫn `204` (no-op, không lỗi).

### 12b. Test edge — id sản phẩm không tồn tại

`DELETE /admin/products/00000000-0000-4000-8000-000000000000/image`. **Kỳ vọng:** `404`.

## 13. Archive sản phẩm — `DELETE /admin/products/:id`

### Happy path

`DELETE /admin/products/{TEST_PRODUCT_ID}`. **Kỳ vọng:** `204`.

### 13a. Test edge — sản phẩm archived biến mất khỏi public nhưng admin vẫn thấy

`GET /products/{TEST_PRODUCT_ID}` (public). **Kỳ vọng:** `404`. `GET
/admin/products?isActive=false` (admin). **Kỳ vọng:** `200`, vẫn thấy `TEST_PRODUCT_ID` trong danh
sách — chứng minh archive không xóa dữ liệu.

### 13b. Test edge — id không tồn tại

`DELETE /admin/products/00000000-0000-4000-8000-000000000000`. **Kỳ vọng:** `404`.

## 14. Ẩn category kéo theo ẩn sản phẩm bên dưới

`PATCH /admin/categories/{PHONE_CATEGORY_ID}` với `{ "isActive": false }`. **Kỳ vọng:** `200`.
`GET /products?categoryId={PHONE_CATEGORY_ID}` (public). **Kỳ vọng:** `200`, `productsCount = 0` —
dù các sản phẩm `dien-thoai` vẫn `isActive=true`, category cha inactive nên toàn bộ ẩn theo. Xong
**đổi lại** `{ "isActive": true }` để không ảnh hưởng phần còn lại của guide.

## 15. Xóa category — `DELETE /admin/categories/:id`

### 15a. Test edge — category còn sản phẩm (kể cả archived)

`DELETE /admin/categories/{PHONE_CATEGORY_ID}`. **Kỳ vọng:** `409` — `dien-thoai` vẫn còn nhiều
sản phẩm, kể cả `DT-006` đã archived.

### Happy path — xóa category rỗng

`DELETE /admin/categories/{NEW_CATEGORY_ID}` (category tự tạo ở mục 3 — ở 9b request tạo product
gắn category này bị từ chối `409` ngay từ đầu nên chưa từng có product nào gắn vào, vẫn rỗng).
**Kỳ vọng:** `204`.

### 15b. Test edge — id không tồn tại

`DELETE /admin/categories/00000000-0000-4000-8000-000000000000`. **Kỳ vọng:** `404`.

### 15c. Test edge — RBAC/không token

Authorize JWT_CUSTOMER1 → gọi `DELETE /admin/categories/{PHONE_CATEGORY_ID}` → **Kỳ vọng:** `403`.
Authorize → Logout → gọi lại → **Kỳ vọng:** `401`.

## 16. Tổng hợp bằng chứng cho PR

Đặt tên file/thư mục evidence gợi ý (đính kèm vào PR hoặc Google Drive rồi dán link vào mô tả PR):

```
docs/testing/evidence/pr09/
├── 01-login-admin-200.png
├── 02-categories-public-200.png
├── 03-categories-limit-400.png
├── 04-category-create-201.png
├── 05-category-create-duplicate-slug-409.png
├── 06-category-create-invalid-slug-400.png
├── 07-category-create-rbac-403.png
├── 08-category-create-no-token-401.png
├── 09-admin-categories-list-200.png
├── 10-admin-categories-filter-q-200.png
├── 11-category-patch-empty-body-400.png
├── 12-category-patch-not-found-404.png
├── 13-category-patch-200.png
├── 14-products-public-200-count14.png
├── 15-products-filter-category-200.png
├── 16-products-filter-q-200.png
├── 17-products-filter-price-range-200.png
├── 18-products-featured-200.png
├── 19-products-minmax-invalid-400.png
├── 20-products-minprice-nan-400.png
├── 21-product-detail-200.png
├── 22-product-detail-bad-uuid-400.png
├── 23-product-detail-not-found-404.png
├── 24-product-detail-archived-404.png
├── 25-admin-products-list-200-count16.png
├── 26-admin-products-filter-inactive-200.png
├── 27-product-create-201.png
├── 28-product-create-category-not-found-404.png
├── 29-product-create-category-inactive-409.png
├── 30-product-create-duplicate-sku-409.png
├── 31-product-create-blank-name-400.png
├── 32-product-create-rbac-403.png
├── 33-product-create-no-token-401.png
├── 34-product-patch-empty-body-400.png
├── 35-product-patch-not-found-404.png
├── 36-product-patch-stock-absolute-200-x2.png
├── 37-product-patch-category-inactive-409.png
├── 38-product-patch-duplicate-sku-409.png
├── 39-image-upload-missing-file-400.png
├── 40-image-upload-200.png
├── 41-attachment-get-200.png
├── 42-image-upload-wrong-signature-415.png
├── 43-image-upload-too-large-413.png
├── 44-image-upload-product-not-found-404.png
├── 45-image-replace-200-new-id.png
├── 46-old-image-404-after-replace.png
├── 47-image-delete-204.png
├── 48-image-delete-noop-204.png
├── 49-image-delete-product-not-found-404.png
├── 50-product-archive-204.png
├── 51-archived-product-hidden-public-404.png
├── 52-archived-product-visible-admin-200.png
├── 53-product-archive-not-found-404.png
├── 54-category-deactivate-hides-products-200.png
├── 55-category-delete-in-use-409.png
├── 56-category-delete-empty-204.png
├── 57-category-delete-not-found-404.png
├── 58-category-delete-rbac-403.png
└── pr09-demo.mp4   (video quay liền mạch bước 1 → 15c)
```

Không bắt buộc đúng tên file này — quan trọng là mỗi ảnh/đoạn video thể hiện rõ **request +
response** (status code + body), đặc biệt case 11f (ảnh cũ hết public sau khi thay ảnh mới) và 14
(ẩn category kéo theo ẩn sản phẩm) vì đây là 2 điều kiện nghiệm thu cốt lõi của PR09 ("rollback
upload giữ ảnh cũ" / "Catalog public đúng visibility").
