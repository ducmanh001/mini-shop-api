# Mini Shop — hợp đồng API để mentor duyệt ở ngày 1

Đây là **đề xuất MVP trong 80 giờ**, gồm 40 endpoint HTTP và 3 công việc hệ thống. Với năng lực 5,2 giờ/ngày, khối lượng này cần 16 ngày làm việc. Chưa phải báo cáo các API đã implement; cần mentor chốt trước khi coi phạm vi bài tập đã được đáp ứng.

`api-requirements.csv` là bản một dòng cho mỗi endpoint/trigger để nhập vào Google Sheets. File này giữ bốn cột đầu theo mẫu trong ảnh và bổ sung params, body, response, lỗi, điều kiện nghiệm thu và PR. Không có thay đổi nào được thực hiện trên Google Sheet nguồn.

## Quy ước chung

| Mục            | Quyết định                                                                                                                                                                           |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Base path      | `/api/v1`                                                                                                                                                                            |
| Role           | `CUSTOMER`, `ADMIN`; tài khoản đăng ký luôn là `CUSTOMER`; admin tạo bằng seed CLI                                                                                                   |
| Xác thực       | `Authorization: Bearer <access-token>`; JWT mang `tokenVersion`; strategy kiểm blacklist + version và lấy user/role/status từ DB ở mỗi request; chỉ ACTIVE được đi tiếp              |
| Quyền customer | `/users/me` cho mọi tài khoản đăng nhập; cart và các route `/orders` dành cho `CUSTOMER`; `/admin/*` chỉ `ADMIN`                                                                     |
| Ownership      | Query order customer theo cả `order.id` và `user.id`; order của người khác trả `404`, không chỉ kiểm role                                                                            |
| ID             | Path ID và `Idempotency-Key` phải là UUID; lỗi định dạng trả `400`                                                                                                                   |
| Body           | JSON camelCase, chỉ field được khai báo; đề xuất `whitelist: true, forbidNonWhitelisted: true, transform: true`; gửi `role`, `userId`, `totalVnd`, `items` vào checkout đều bị `400` |
| Tiền           | VND nguyên, JSON dùng chuỗi chữ số chuẩn như `"150000"`; không số thập phân, không số âm, không dấu phân cách, không leading zero trừ `"0"`; `priceVnd` từ `"1"` đến `"1000000000"`  |
| Tổng tiền      | Server tính; tối đa 20 dòng × 99 × 1.000.000.000 = 1.980.000.000.000 VND, nhỏ hơn `Number.MAX_SAFE_INTEGER`; chỉ convert sau validation và serialize về string                       |
| Thời gian      | ISO 8601 UTC; ví dụ `2026-09-09T03:00:00.000Z`                                                                                                                                       |
| Phân trang     | `limit=20` mặc định, integer `1..50`; `offset=0` mặc định, integer `>=0`; áp dụng mọi list trong CSV; `*Count` là tổng theo filter trước limit/offset                                |
| Thứ tự list    | Cố định `createdAt DESC, id DESC`; không nhận sort SQL hoặc tên cột tự do từ client                                                                                                  |
| i18n           | Giữ resolver tutorial: `?lang=vi`, `x-lang: vi`, rồi `Accept-Language`; mặc định `en`; message dịch nhưng shape/status giữ nguyên                                                    |
| Success        | Envelope theo tài nguyên; `204` không có body; GET ảnh trả binary thay vì JSON                                                                                                       |
| Lỗi            | Giữ envelope tutorial `{"errors":{"body":["..."]}}`; không trả stack, SQL, password/hash, JWT secret hoặc đường dẫn storage                                                          |
| Không tìm thấy | ID hợp lệ nhưng không có dữ liệu, không công khai hoặc không thuộc user: `404`                                                                                                       |
| Xung đột       | Unique, tồn kho, trạng thái, giới hạn giỏ, category còn product, reuse key khác body: `409`                                                                                          |

`400` là đầu vào sai; `401` thiếu/sai/hết hạn/đã revoke token; `403` đã xác thực nhưng role không phù hợp. Lỗi bất ngờ dùng `500` với message chung và log phía server. CSV ghi các lỗi nghiệp vụ dự kiến, không lặp `500` vào mọi dòng. `413` cho upload quá lớn, `415` cho loại nội dung file không hỗ trợ; cần map lỗi Multer/validator đúng status này khi implement.

## Request DTO và validation

| Tên DTO                 | Field và ràng buộc                                                                                                                                                                                                                                                                                                                                         |
| ----------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `RegisterRequest`       | `username`: 3..30 ký tự `[A-Za-z0-9_]`, trim và lưu lowercase; `email`: email hợp lệ, tối đa 254 ký tự, trim/lowercase; `password`: tối thiểu 8 ký tự và tối đa 72 byte UTF-8 vì tái dùng bcrypt, không trim password; không nhận role                                                                                                                     |
| `VerifyEmailRequest`    | `token`: opaque token từ email, 32..512 ký tự; server chỉ lưu SHA-256 hash; token hết hạn và dùng một lần                                                                                                                                                                                                                                                  |
| `LoginRequest`          | `email`, `password`; normalize email giống đăng ký; message sai email/password dùng chung                                                                                                                                                                                                                                                                  |
| `ForgotPasswordRequest` | `email`: validate/normalize giống register; response luôn giống nhau dù email không tồn tại                                                                                                                                                                                                                                                                |
| `ResetPasswordRequest`  | `token`; `newPassword`: cùng rule password đăng ký; `confirmPassword` phải khớp; token hết hạn/dùng một lần                                                                                                                                                                                                                                                |
| `UpdateProfileRequest`  | `username` tùy chọn theo rule đăng ký; ít nhất một field; MVP không cho đổi email vì cần một vòng verify riêng                                                                                                                                                                                                                                             |
| `ChangePasswordRequest` | `currentPassword`, `newPassword`, `confirmPassword`; mật khẩu mới khác mật khẩu cũ; đổi thành công revoke các access token cũ                                                                                                                                                                                                                              |
| `UserStatusRequest`     | `status`: chỉ `ACTIVE` hoặc `INACTIVE`; không đổi role; không cho admin tự deactivate; account PENDING phải verify email                                                                                                                                                                                                                                   |
| `CategoryCreateRequest` | `name`: chuỗi không chỉ whitespace, tối đa 100; `slug`: lowercase `[a-z0-9]+(?:-[a-z0-9]+)*`, tối đa 120, unique; `isActive`: boolean tùy chọn, mặc định true                                                                                                                                                                                              |
| `CategoryPatchRequest`  | Một hoặc nhiều field từ `CategoryCreateRequest`; body rỗng bị `400`; `null` không hợp lệ                                                                                                                                                                                                                                                                   |
| `ProductCreateRequest`  | `categoryId`: UUID tồn tại, category active; `name`: 1..200 ký tự không blank; `description`: chuỗi tối đa 5000, mặc định rỗng; `sku`: 1..64 ký tự, trim + uppercase, unique; `priceVnd`: chuỗi VND theo quy ước; `stock`: integer `0..2147483647`; `isActive`: boolean mặc định true; `isFeatured`: boolean mặc định false; ảnh qua endpoint upload riêng |
| `ProductPatchRequest`   | Một hoặc nhiều field của `ProductCreateRequest`; giá trị `stock` là tồn khả dụng tuyệt đối; khóa product giống checkout trước khi ghi stock; admin cần hiểu đây là thay tồn hiện tại, không cộng stock; không nhận ID/ảnh trong JSON; body rỗng hoặc `null` bị `400`                                                                                       |
| `SetCartItemRequest`    | `quantity`: integer `1..99`; đây là số lượng cuối cùng, không phải số tăng thêm; muốn bỏ dòng dùng DELETE, không gửi 0                                                                                                                                                                                                                                     |
| `CheckoutRequest`       | `recipientName`: 1..100 ký tự không blank; `phone`: 8..20 ký tự, chỉ chữ số và dấu `+` ở đầu nếu có; `address`: 1..500 ký tự không blank; `customerNote`: tùy chọn, tối đa 500 ký tự; không nhận cart items, giá, tổng hoặc user ID                                                                                                                        |
| `OrderStatusRequest`    | `status`: `CONFIRMED`, `REJECTED` hoặc `COMPLETED`; `reason`: bắt buộc 1..500 ký tự không blank khi REJECTED; không được gửi khi CONFIRMED/COMPLETED                                                                                                                                                                                                       |
| `ProductImageUpload`    | `multipart/form-data`, đúng một field `file`, tối đa 2 MiB; JPEG/PNG/WebP; kiểm MIME và chữ ký nội dung, server sinh tên lưu; không nhận path từ client                                                                                                                                                                                                    |
| `ReviewCreateRequest`   | `rating`: integer `1..5`; `comment`: chuỗi không blank, tối đa 2000; customer phải có order COMPLETED chứa product và chưa review product đó                                                                                                                                                                                                               |
| `ReviewPatchRequest`    | Một hoặc cả hai field `rating`, `comment` theo rule tạo; body rỗng bị `400`; chỉ owner được sửa                                                                                                                                                                                                                                                            |

Điều kiện visibility của shop: product phải `isActive=true` **và** category phải `isActive=true`. Category inactive vẫn tồn tại trong admin; việc ẩn category làm các product bên dưới không thể xem/đưa vào giỏ/checkout. GET chi tiết public, GET ảnh và checkout đều áp dụng cùng điều kiện này. Khi visibility đổi sau lúc thêm vào giỏ, GET cart vẫn hiển thị dòng đã có với `available=false`; checkout trả `409`, khách xóa dòng rồi thử lại bằng key mới.

Filter `GET /products`: `q` tùy chọn, trim, tối đa 100 ký tự, tìm tên/description không phân biệt hoa thường **và không phân biệt dấu tiếng Việt** (`unaccent`, vd "chuot khong day" khớp "Chuột không dây"); kết quả khớp `name` xếp trước kết quả chỉ khớp `description`; `categoryId` UUID; `minPrice`, `maxPrice` là chuỗi VND không âm, tối đa `"1000000000"`, min không vượt max; `featured` chỉ nhận chuỗi `true` hoặc `false`; cộng `limit`, `offset`. Query SQL phải parameterize; `%` và `_` trong `q` được xử lý như ký tự literal để tránh nghĩa wildcard ngoài ý muốn. Phiên bản MVP chấp nhận tìm kiếm `ILIKE` trên dữ liệu demo; index B-tree thông thường không làm `%keyword%` thành truy vấn index hiệu quả. List admin categories nhận `q` cùng cơ chế không phân biệt dấu, không có ranking (chỉ 1 field `name`).

List admin users nhận `q` tìm username/email, `role`, `status`, `limit`, `offset`; không nhận sort tự do. List admin categories nhận `q`, `isActive`, `limit`, `offset`; list public categories chỉ nhận `limit`, `offset` và luôn lọc active. List admin products nhận các filter public cộng `isActive`, bao gồm product/category inactive. List review nhận `limit`, `offset`, trả count và aggregate rating theo toàn bộ review của product. List orders customer nhận `status`, `limit`, `offset`; admin nhận thêm `userId`. Order status phải thuộc tập năm trạng thái; không nhận `userId` trên route customer. Các boolean query chỉ nhận `true`/`false`, không dùng ép kiểu JavaScript khiến chuỗi `"false"` thành true.

Các body ví dụ dùng trong CSV:

`RegisterRequest`:

```json
{
  "username": "customer_a",
  "email": "customer.a@example.test",
  "password": "DemoPass123!"
}
```

`LoginRequest`:

```json
{
  "email": "customer.a@example.test",
  "password": "DemoPass123!"
}
```

`VerifyEmailRequest`:

```json
{
  "token": "OPAQUE_TOKEN_FROM_EMAIL"
}
```

`ForgotPasswordRequest`:

```json
{
  "email": "customer.a@example.test"
}
```

`ResetPasswordRequest`:

```json
{
  "token": "OPAQUE_TOKEN_FROM_EMAIL",
  "newPassword": "NewDemoPass456!",
  "confirmPassword": "NewDemoPass456!"
}
```

`UpdateProfileRequest`, `ChangePasswordRequest` và `UserStatusRequest`:

```json
{
  "username": "customer_new"
}
```

```json
{
  "currentPassword": "DemoPass123!",
  "newPassword": "NewDemoPass456!",
  "confirmPassword": "NewDemoPass456!"
}
```

```json
{
  "status": "INACTIVE"
}
```

`CategoryCreateRequest`:

```json
{
  "name": "Sách",
  "slug": "sach",
  "isActive": true
}
```

`CategoryPatchRequest`:

```json
{
  "name": "Sách lập trình"
}
```

`ProductCreateRequest`:

```json
{
  "categoryId": "20000000-0000-4000-8000-000000000001",
  "name": "Sổ tay NestJS",
  "description": "Sổ ghi chú thực hành backend.",
  "sku": "NOTE-NEST-001",
  "priceVnd": "150000",
  "stock": 10,
  "isActive": true,
  "isFeatured": true
}
```

`ProductPatchRequest`:

```json
{
  "priceVnd": "160000",
  "isFeatured": false
}
```

`ReviewCreateRequest` và `ReviewPatchRequest`:

```json
{
  "rating": 5,
  "comment": "Sản phẩm đúng mô tả."
}
```

```json
{
  "comment": "Cập nhật sau một tuần sử dụng."
}
```

`SetCartItemRequest`:

```json
{
  "quantity": 2
}
```

`CheckoutRequest`, cùng header `Idempotency-Key: 60000000-0000-4000-8000-000000000001`:

```json
{
  "recipientName": "Nguyễn An",
  "phone": "+84901234567",
  "address": "123 Đường Mẫu, Hà Nội",
  "customerNote": "Gọi trước khi giao."
}
```

`OrderStatusRequest`:

```json
{
  "status": "REJECTED",
  "reason": "Không thể phục vụ địa chỉ nhận hàng."
}
```

Request cancel và logout không có body. Request CONFIRMED hoặc COMPLETED chỉ có field `status`. Multipart upload không biểu diễn bằng JSON; dùng file binary ở field `file` trong Swagger/Postman.

## Response DTO và ví dụ JSON

Các DTO dưới đây là contract đề xuất. Tên field trong API có thể map sang snake_case ở DB; không trả thẳng TypeORM entity. Những UUID, email, token và thời gian trong ví dụ chỉ là dữ liệu minh họa.

`UserResponse` dùng cho đăng ký, GET/PATCH me; đăng ký trả account `PENDING` và chưa cấp access token. `AuthResponse` của login là cùng object `user` có thêm field `token`. Không có password/hash hoặc token xác minh/reset trong response. GET me không echo bearer token:

```json
{
  "user": {
    "id": "10000000-0000-4000-8000-000000000001",
    "username": "customer_a",
    "email": "customer.a@example.test",
    "role": "CUSTOMER",
    "status": "ACTIVE",
    "emailVerifiedAt": "2026-09-09T03:00:00.000Z"
  }
}
```

```json
{
  "user": {
    "id": "10000000-0000-4000-8000-000000000001",
    "username": "customer_a",
    "email": "customer.a@example.test",
    "role": "CUSTOMER",
    "status": "ACTIVE",
    "emailVerifiedAt": "2026-09-09T03:00:00.000Z",
    "token": "TOKEN_MINH_HOA_KHONG_SU_DUNG_DUOC"
  }
}
```

`CategoryResponse`:

```json
{
  "category": {
    "id": "20000000-0000-4000-8000-000000000001",
    "name": "Sách",
    "slug": "sach",
    "isActive": true,
    "createdAt": "2026-09-09T03:00:00.000Z",
    "updatedAt": "2026-09-09T03:00:00.000Z"
  }
}
```

`CategoriesResponse`: `categories` là array có đúng shape của object `category` phía trên; `categoriesCount` là number. Ví dụ list rỗng hợp lệ:

```json
{
  "categories": [],
  "categoriesCount": 0
}
```

`ProductResponse`; ảnh chưa có là `null`. `image` chỉ chứa metadata công khai, không có storage path. Public chỉ trả product visible; admin dùng cùng shape để xem `isActive=false` và category inactive:

```json
{
  "product": {
    "id": "30000000-0000-4000-8000-000000000001",
    "name": "Sổ tay NestJS",
    "description": "Sổ ghi chú thực hành backend.",
    "category": {
      "id": "20000000-0000-4000-8000-000000000001",
      "name": "Sách",
      "isActive": true
    },
    "priceVnd": "150000",
    "stock": 10,
    "isActive": true,
    "isFeatured": true,
    "image": {
      "id": "70000000-0000-4000-8000-000000000001",
      "url": "/api/v1/attachments/70000000-0000-4000-8000-000000000001",
      "mimeType": "image/png",
      "sizeBytes": 10240
    },
    "createdAt": "2026-09-09T03:00:00.000Z",
    "updatedAt": "2026-09-09T03:00:00.000Z"
  }
}
```

`ProductsResponse`: `products` là array có shape của object `product`; `productsCount` là number:

```json
{
  "products": [],
  "productsCount": 0
}
```

`CartResponse`: item giá hiện tại, chưa giữ hàng và chưa phải giá đã chốt. `available` nghĩa là product/category active và stock đủ cho quantity; stock có thể đổi ngay sau GET. `totalVnd` là tổng tham khảo của mọi dòng theo giá hiện tại, kể cả dòng unavailable; chỉ checkout thành công mới chốt được giá/tồn. Giới hạn 20 dòng nên cart không phân trang. PUT trả toàn bộ cart mới để client có số lượng/tổng nhất quán:

```json
{
  "cart": {
    "items": [
      {
        "productId": "30000000-0000-4000-8000-000000000001",
        "productName": "Sổ tay NestJS",
        "unitPriceVnd": "150000",
        "quantity": 2,
        "stock": 10,
        "available": true,
        "lineTotalVnd": "300000"
      }
    ],
    "totalVnd": "300000"
  }
}
```

Giỏ rỗng trả `{"cart":{"items":[],"totalVnd":"0"}}`. PUT kiểm stock tại lúc ghi và trả `409` khi quantity vượt tồn; kiểm này không thay thế transaction checkout. DELETE dòng không có trong giỏ hiện tại vẫn `204`, không cho biết giỏ người khác.

`OrderResponse` dùng cho tạo đơn, detail, cancel và admin đổi trạng thái. `items` là snapshot bất biến, không đọc giá/tên mới từ product để render đơn cũ. `history` tăng dần theo `createdAt, id`; mỗi event chứa transition đã thành công. `reason` và `customerNote` có thể null. Admin/customer dùng cùng shape khi đã có quyền:

```json
{
  "order": {
    "id": "40000000-0000-4000-8000-000000000001",
    "userId": "10000000-0000-4000-8000-000000000001",
    "status": "PENDING",
    "paymentMethod": "COD",
    "recipientName": "Nguyễn An",
    "phone": "+84901234567",
    "address": "123 Đường Mẫu, Hà Nội",
    "customerNote": "Gọi trước khi giao.",
    "totalVnd": "300000",
    "items": [
      {
        "id": "50000000-0000-4000-8000-000000000001",
        "productId": "30000000-0000-4000-8000-000000000001",
        "productName": "Sổ tay NestJS",
        "unitPriceVnd": "150000",
        "quantity": 2,
        "lineTotalVnd": "300000"
      }
    ],
    "history": [
      {
        "id": "80000000-0000-4000-8000-000000000001",
        "fromStatus": null,
        "toStatus": "PENDING",
        "changedByUserId": "10000000-0000-4000-8000-000000000001",
        "reason": null,
        "createdAt": "2026-09-09T03:00:00.000Z"
      }
    ],
    "createdAt": "2026-09-09T03:00:00.000Z",
    "updatedAt": "2026-09-09T03:00:00.000Z"
  }
}
```

`OrdersResponse` list dùng summary có `id`, `userId`, `status`, `paymentMethod`, `totalVnd`, `createdAt`, `updatedAt`; không kéo items/history/address vào mọi list. Detail mới tải quan hệ cần thiết. `ordersCount` là number:

```json
{
  "orders": [
    {
      "id": "40000000-0000-4000-8000-000000000001",
      "userId": "10000000-0000-4000-8000-000000000001",
      "status": "PENDING",
      "paymentMethod": "COD",
      "totalVnd": "300000",
      "createdAt": "2026-09-09T03:00:00.000Z",
      "updatedAt": "2026-09-09T03:00:00.000Z"
    }
  ],
  "ordersCount": 1
}
```

`ReviewResponse` không trả email. `ReviewsResponse` dùng cùng item, thêm count và average rating dạng chuỗi một chữ số thập phân hoặc `null` nếu chưa có review:

```json
{
  "review": {
    "id": "91000000-0000-4000-8000-000000000001",
    "productId": "30000000-0000-4000-8000-000000000001",
    "rating": 5,
    "comment": "Sản phẩm đúng mô tả.",
    "author": {
      "id": "10000000-0000-4000-8000-000000000001",
      "username": "customer_a"
    },
    "createdAt": "2026-09-22T03:00:00.000Z",
    "updatedAt": "2026-09-22T03:00:00.000Z"
  }
}
```

```json
{
  "reviews": [],
  "reviewsCount": 0,
  "averageRating": null
}
```

`UsersResponse` và `AdminUserResponse` dùng cho admin, không có password/token. List chỉ trả `id`, `username`, `email`, `role`, `status`, `createdAt`; detail thêm `emailVerifiedAt` và `orderCount`. `MessageResponse` của forgot-password luôn là cùng message chung, ví dụ `{"message":"Nếu tài khoản hợp lệ, hướng dẫn sẽ được gửi qua email."}`.

`ErrorResponse`, ví dụ request checkout thiếu tồn trả `409`:

```json
{
  "errors": {
    "body": ["Sản phẩm không đủ tồn kho để đặt hàng."]
  }
}
```

`NoContent` trong CSV nghĩa là `204` và body rỗng. `BinaryImage` nghĩa là `200`, `Content-Type` tương ứng JPEG/PNG/WebP, stream bytes; metadata URL không đồng nghĩa ảnh vẫn public sau khi product bị ẩn hoặc đổi ảnh. `GET /attachments/:id` kiểm liên kết hiện tại tới product visible, không phục vụ mọi file chỉ vì đoán được UUID. Hạn chế cache public dài hạn cho MVP để việc ẩn sản phẩm không để lại ảnh cũ trong cache do API mới tạo.

## Các quy tắc phải test trước khi gọi checkout hoàn thành

Giỏ không đặt giữ tồn kho. Customer có tối đa 20 product khác nhau, mỗi dòng `quantity=1..99`. PUT cùng product là upsert theo unique `(user_id, product_id)`; PUT, DELETE và checkout đều khóa cùng user row trước khi đụng giỏ. Nhờ đó hai request cùng user không làm mất cập nhật hoặc vượt số dòng. Các thao tác cần product lock lấy khóa theo product ID tăng dần. Admin update product/stock và luồng trả tồn phải phối hợp cùng cơ chế khóa product.

Checkout nhận body giao hàng và một UUID `Idempotency-Key` bắt buộc. Sau khi khóa user, kiểm order theo `(user_id, idempotency_key)` **trước khi đọc giỏ**. Hash request được tính từ DTO giao hàng đã validate/canonicalize: sắp field cố định, trim tên/phone/address/note, coi note thiếu/rỗng là null; không hash cart hiện tại. Cùng key/cùng body trả order đã tạo với `200`, kể cả giỏ hiện đã rỗng hoặc có hàng mới; response có thể phản ánh trạng thái hiện tại của chính order đó. Cùng key/khác body trả `409`. Request mới thành công trả `201` và `Location: /api/v1/orders/<id>`; replay cũng trả Location của cùng order. Transaction thất bại không lưu key, không trừ tồn, không xóa giỏ.

Trong cùng một transaction DB: đọc và khóa giỏ, khóa product theo ID, kiểm product/category active, kiểm stock và quantity, tính tiền server, tạo order PENDING, tạo order items snapshot, trừ tồn, ghi history đầu tiên, tạo thông báo ORDER_PLACED bền vững, rồi xóa giỏ. Tất cả repository call phải dùng transaction manager. Nếu category có thể được admin ẩn đồng thời, cần lock/recheck category tại transaction và thống nhất thứ tự khóa; quyết định này phải được đối chiếu với tài liệu database trước implement. Không gọi SMTP hoặc chờ Redis bên trong transaction nghiệp vụ.

Những chuyển trạng thái được phép:

| Từ        | Sang      | Ai                | Tác động                                                                 |
| --------- | --------- | ----------------- | ------------------------------------------------------------------------ |
| Chưa có   | PENDING   | CUSTOMER checkout | Trừ tồn; tạo snapshot, history và ORDER_PLACED                           |
| PENDING   | CONFIRMED | ADMIN             | Giữ nguyên tồn đã trừ; thêm history và ORDER_CONFIRMED                   |
| PENDING   | REJECTED  | ADMIN             | Bắt buộc reason; trả tồn đúng một lần; history và ORDER_REJECTED         |
| PENDING   | CANCELLED | CUSTOMER sở hữu   | Trả tồn đúng một lần; thêm history; chưa có email cancellation trong MVP |
| CONFIRMED | COMPLETED | ADMIN             | Đã hoàn thành giao hàng và thu COD; giữ nguyên tồn; thêm history         |

Mọi chuyển khác, kể cả gửi lại transition đã hoàn thành, trả `409`; không ghi thêm history, notification hay trả tồn lần hai. Khóa order trước kiểm trạng thái, rồi khóa product tăng dần khi cần trả tồn. CANCELLED, REJECTED, COMPLETED là terminal. Không có luồng hoàn tiền, SHIPPED hay thanh toán gateway. COD chỉ được xem là thu tiền khi COMPLETED; tổng đơn PENDING/CONFIRMED chưa được gọi là tiền đã thu.

Acceptance test tối thiểu:

1. Hai customer cùng checkout product có stock=1: đúng một `201`, một `409`, tồn cuối bằng 0 và chỉ có một order/item set/notification hợp lệ.
2. Cùng user gửi đồng thời cùng key/body: một order; response `201` và `200`; tồn trừ một lần. Gửi lại sau khi giỏ bị xóa vẫn nhận cùng order.
3. Cùng key nhưng địa chỉ khác: `409`; không đụng order/giỏ/tồn. Key thiếu hoặc không UUID: `400`.
4. Thất bại giữa transaction: order/items/history/notification không còn, giỏ và stock giữ nguyên; lỗi thực tế có response chung, không lộ SQL.
5. Customer xem/hủy order của người khác: `404`; CUSTOMER gọi admin API: `403`; chưa đăng nhập gọi API bảo vệ: `401`.
6. Cancel chạy cùng lúc với admin confirm/reject: chỉ một transition thắng; transition còn lại `409`, stock được trả nhiều nhất một lần.
7. Product đổi giá sau checkout: order cũ vẫn dùng tên/giá/tổng snapshot. Archive product vẫn xem được order cũ; category còn product trả `409` khi DELETE.
8. Upload fail hoặc DB rollback: ảnh đang sử dụng vẫn đọc được; file mới chưa gắn không public. Ảnh cũ/ngắt liên kết trả `404`.
9. Lọc/phân trang không lặp/mất trang vì sort thiếu tie-breaker; qty=0, qty=100, limit=51, giá âm/thập phân, min lớn hơn max đều `400`.
10. Đăng ký tạo PENDING và email verification intent; token verify/reset lưu hash, hết hạn, chỉ dùng một lần; account chưa ACTIVE không login được.
11. Forgot-password trả cùng response cho email có/không tồn tại; đổi/reset password làm access token cũ mất hiệu lực.
12. Customer chưa có đơn COMPLETED không review được; mỗi customer chỉ có một review/product; user khác không sửa/xóa review.
13. Admin deactivate user làm request bảo vệ kế tiếp bị 401; admin không tự deactivate và không thể đổi role qua API status.

## File, queue, scheduler và seed

POST product image trả `200 ProductResponse`, thiết lập hoặc thay đúng một ảnh. DELETE image trả `204` cả khi product đã không có ảnh; product không tồn tại trả `404`. File cũ chỉ được dọn sau khi DB commit thay liên kết. Nếu transaction fail, giữ ảnh cũ và dọn file mới chưa gắn; file orphan có thể được dọn qua quy trình CLI/dev hoặc extension sau. Không gọi `fs.unlink` file đang dùng trước commit như code tutorial hiện tại. Ở MVP không có endpoint list/upload file tổng quát cho customer.

Dispatcher `@nestjs/schedule` chạy mỗi phút, đọc một batch `email_notifications` chưa gửi/đến hạn trong DB rồi enqueue `@nestjs/bull` dùng Redis. Dùng `notification.id` làm `jobId`. Worker kiểm `sent_at`, tải payload/recipient snapshot, giải mã token activation/reset khi cần, gửi SMTP qua Mailpit trong local, rồi ghi sent/error/retry state. Core có EMAIL_VERIFICATION, PASSWORD_RESET, ORDER_PLACED, ORDER_CONFIRMED và ORDER_REJECTED. Partial unique theo auth token hoặc `(order,event)` tránh tạo hai intent của cùng sự kiện; notification được tạo trong cùng transaction nghiệp vụ nên Redis tắt không làm mất ý định gửi mail. DB chỉ lưu token hash để verify; bản token cần đưa vào mail được mã hóa xác thực bằng khóa riêng trong `secret_ciphertext`, không nằm trong JSON/log và bị xóa sau SENT/hết hạn.

Cấu hình đề xuất: dispatcher batch 50; Bull thực hiện tối đa 3 lần với exponential backoff; `email_notifications.attempts` tăng atomic trước mỗi lần gửi và chuyển FAILED ở lần cuối. Redis chưa nhận được job thì record vẫn PENDING và scheduler thử enqueue ở phút sau mà không tăng mail attempt. Job failed/completed được dọn có chủ đích để deterministic jobId có thể được tạo lại khi record còn ngân sách gửi. Đây là queue giao ít nhất một lần: worker bỏ qua record SENT/FAILED, nhưng SMTP thành công rồi process chết trước DB mark SENT vẫn có thể làm mail trùng. Không khẳng định exactly-once. Chạy một instance app/worker cho bài mock; không triển khai scale nhiều replica trong 130 giờ.

Ba trigger system trong CSV đều là P0: `SYS-01` scheduler dispatcher, `SYS-02` Bull mail worker, `SYS-03` seed CLI. Chúng không phải HTTP endpoint, không có HTTP status. Seed chạy qua script mới dự kiến `npm run seed -- --profile=demo`, dùng application context, tìm/upsert theo key ổn định, chạy hai lần không sinh duplicate; tạo admin, ít nhất hai customer, category/product mẫu, product stock=0 và stock=1 phục vụ test. Không ghi token/password thật vào README/log; đóng DB/Redis trước exit; thành công exit=0, lỗi exit khác 0. CLI không truncate DB và không tự reset migration. Script này chưa có trong tutorial, cần implement PR-05.

Integration test queue dùng SMTP giả/Mailpit riêng và Redis test riêng hoặc prefix queue riêng. Tắt scheduler trong các e2e nghiệp vụ không liên quan queue; test dispatcher gọi method trực tiếp hoặc điều khiển thời gian, không chờ thật một phút. Có test SMTP fail → retry, Redis unavailable → notification còn DB → gửi sau phục hồi, rollback → không có notification gửi. Không gửi email tới người thật trong test/demo.

## Cách dùng CSV và đối chiếu PR

Google Sheet nguồn đang view-only theo ảnh. File CSV này là phương án để bạn nhập vào sheet/tab mình có quyền chỉnh sửa: chọn import file UTF-8, dấu phân cách comma, tạo tab mới; không chọn replace spreadsheet. Kiểm tra tiếng Việt và đủ 14 cột trước khi sử dụng. Không ghi đè tab mẫu. Tên tab gợi ý `Mini Shop - <ten-cua-ban>`; việc được tạo tab trong file nguồn phụ thuộc quyền editor, có thể dùng spreadsheet riêng rồi đưa mentor link khi cần.

CSV có **54 HTTP rows + 5 system/CLI/WebSocket rows**. `Priority=P0` là luồng core và `Priority=P2` là thứ tự làm Advance; trong bản full scope 130 giờ, cả P0 và P2 đều phải bàn giao. Priority chỉ điều khiển thứ tự và quyết định giữ gì khi phát sinh rủi ro, không có nghĩa mentor đã duyệt. Cột `PR` liên kết mỗi behavior với gói review trong [full-scope-plan.md](./full-scope-plan.md); kiểm thử tích hợp cuối không thay thế test trong feature PR.

## Hợp đồng cho các chức năng Advance

### Share link

`GET /products/:id/share-links` chỉ nhận product ID và locale. Server lấy `PUBLIC_WEB_URL` từ config đã validate, tạo canonical product URL rồi URL-encode URL/title vào share endpoints của Facebook/X. Không nhận base URL hoặc redirect URL từ client, không dùng OAuth và không đăng bài thay user. Product/category không public trả 404 giống product detail.

### Product suggestion

```text
CreateSuggestionRequest {
  name: string,             // trim, 2..200
  description?: string,     // trim, 1..2000 khi có
  categoryName?: string     // trim, 1..100 khi có
}

ReviewSuggestionRequest {
  status: "APPROVED" | "REJECTED",
  reason?: string           // bắt buộc khi REJECTED, tối đa 500
}
```

Create luôn đặt `PENDING`; client không truyền user, status, reviewer hoặc timestamps. Customer chỉ list suggestion của mình. Admin list/detail rồi chuyển đúng một lần từ `PENDING` sang `APPROVED` hoặc `REJECTED`; gọi lại trả 409. Approve chỉ ghi kết quả review, không tự tạo product thiếu SKU/giá/tồn/ảnh.

### Support chat

Mỗi customer có tối đa một conversation `OPEN`. `POST /chat/conversations` tạo mới hoặc trả conversation OPEN hiện có. Message body sau trim dài 1..2000; sender lấy từ JWT. Gửi message yêu cầu `Idempotency-Key` theo sender để retry sau timeout không tạo bản ghi trùng. Conversation `CLOSED` không nhận tin mới.

REST là nguồn dữ liệu chính: `GET .../messages` dùng cursor, sort `createdAt DESC,id DESC` và limit tối đa 50. WebSocket dùng namespace `/chat`; handshake phải xác thực JWT, mỗi lần join room phải kiểm tra customer owner hoặc ADMIN. Luồng gửi là validate → insert/commit DB → publish `chat.message.created`; không publish trước commit. Khi reconnect, client gọi REST để bù event có thể bị lỡ. Full scope chạy một app instance nên chưa dùng Redis adapter cho Socket.IO; Redis vẫn dùng cho Bull.

### Statistics và monthly revenue

Best-selling dùng `SUM(order_items.quantity)` và revenue dùng `SUM(orders.total_vnd)` hoặc tổng line snapshot tương ứng, nhưng chỉ lấy order `COMPLETED` theo `completed_at`. Khoảng thời gian dùng dạng `[from,to)` để không đếm trùng ở ranh giới. Nhóm month/year theo `Asia/Bangkok`; tiền vẫn serialize thành chuỗi số nguyên.

Cron chạy lúc 00:10 ngày đầu tháng theo `Asia/Bangkok`, tạo report cho tháng lịch vừa kết thúc và từng ADMIN ACTIVE. Nó ghi `MONTHLY_REVENUE` notification bền trong DB; dispatcher và Bull worker hiện có thực hiện gửi. Unique `(recipient_email,event_type,report_period)` cho report ngăn job cron chạy lại tạo hai intent. Test gọi method với clock cố định, không chờ cron thật.

### Điều mentor vẫn cần xác nhận

Mốc full scope là **130 giờ/25 ngày** và dùng COD. Payment gateway thật, webhook/refund/đối soát, product variants, nhiều ảnh, shipping integration, chat attachment/presence và scale nhiều app instances vẫn ngoài phạm vi vì tab không định nghĩa hợp đồng cho chúng. Nếu mentor yêu cầu payment online sandbox, estimate thành khoảng 145 giờ/28 ngày trước khi bắt đầu feature đó.

## Nguồn kỹ thuật chính thức để triển khai

- [NestJS authentication](https://docs.nestjs.com/security/authentication) và [authorization](https://docs.nestjs.com/security/authorization): JWT guard và role guard.
- [NestJS validation](https://docs.nestjs.com/techniques/validation) và [file upload](https://docs.nestjs.com/techniques/file-upload): DTO, giới hạn/kiểm file và HTTP behavior.
- [NestJS queues](https://docs.nestjs.com/techniques/queues) và [task scheduling](https://docs.nestjs.com/techniques/task-scheduling): chọn `@nestjs/bull` theo yêu cầu mentor; scheduler gọi dispatcher.
- [TypeORM transactions](https://typeorm.io/docs/advanced-topics/transactions/) và [PostgreSQL explicit locking](https://www.postgresql.org/docs/16/explicit-locking.html): transaction manager và row locks.
- [NestJS testing](https://docs.nestjs.com/fundamentals/testing): unit/e2e và override provider khi cần.
