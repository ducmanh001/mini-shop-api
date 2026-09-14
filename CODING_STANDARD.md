# Coding Standard

Quy chuẩn code cho **Mini Shop API** (dự án Ecommerce). Các RULE trong tài liệu này đúc kết từ review comment thật của mentor trên PR của dự án tham khảo `nestjs-tutorial` (một RealWorld-clone dùng domain Articles/Follows/Favorites/Comments/Profiles) mà Mini Shop được khởi tạo dựa theo (xem [README.md](./README.md)) — các nguyên tắc (module boundary, transaction, N+1, response envelope, bootstrap, TS strict...) áp dụng nguyên vẹn cho Mini Shop, nhưng phần lớn **code minh hoạ, tên file cụ thể và số liệu đo (query count, coverage %) trong các mục 3–9 và 14–21 vẫn là ví dụ lấy từ `nestjs-tutorial`**, không phải code đã tồn tại trong repo `mini-shop-api` này. Domain đó (Articles/Follows/Favorites/Comments/Profiles) **không** được mang sang Mini Shop. Khi triển khai entity/module thật của Mini Shop (`users`, `auth`, `categories`, `products`, `cart`, `orders`, `reviews`, `chat`, `product_suggestions`, `email_notifications`) theo [database.md](./docs/planning/database.md), áp dụng đúng RULE nhưng thay ví dụ/tên file bằng module Mini Shop tương ứng — không copy nguyên code minh hoạ.

---

## 1. Module Boundary — Single Responsibility

Mỗi module chỉ chịu trách nhiệm cho **một domain**. Không gộp nhiều nghiệp vụ khác nhau vào chung một module.

| Module                | Trách nhiệm                                                                    | KHÔNG chứa                                                                    |
| --------------------- | ------------------------------------------------------------------------------ | ----------------------------------------------------------------------------- |
| `users`               | Hồ sơ user, đổi mật khẩu, admin active/inactive                                | Logic đăng nhập/JWT (thuộc `auth`)                                            |
| `auth`                | Đăng ký, activation, login/logout, forgot/reset password, JWT, blacklist token | Thông tin hồ sơ user (phải gọi qua `UsersService`)                            |
| `attachments`         | Lưu trữ & phục vụ file upload (ảnh sản phẩm)                                   | Business logic của module sở hữu file (`products`)                            |
| `categories`          | CRUD danh mục sản phẩm                                                         | Truy vấn/sửa product trực tiếp (phải gọi qua `ProductsService`)               |
| `products`            | CRUD sản phẩm, tồn kho, ảnh, ghép category + featured                          | Quan hệ giỏ hàng/đơn hàng thô (phải gọi qua `CartService`/`OrdersService`)    |
| `cart`                | Thêm/sửa/xóa dòng trong giỏ của 1 user                                         | Giá/tồn hiện tại của product (phải gọi qua `ProductsService`)                 |
| `orders`              | Checkout, lịch sử/chi tiết đơn, state machine, order_status_history            | Truy vấn product trực tiếp (phải gọi qua `ProductsService`/`CartService`)     |
| `reviews`             | CRUD review/rating 1 cấp cho sản phẩm đã mua                                   | Truy vấn order trực tiếp (chỉ dùng `EXISTS` qua service order khi tạo review) |
| `chat`                | Conversation + message support giữa customer và admin                          | Thông tin user (phải gọi qua `UsersService`)                                  |
| `product-suggestions` | Workflow gợi ý sản phẩm PENDING→APPROVED/REJECTED                              | Tạo product tự động (approve không auto-create product)                       |
| `notifications`       | Outbox `email_notifications`, dispatcher/worker Bull, monthly report           | Business logic của module phát sinh sự kiện (auth/orders/...)                 |

**Vì sao:** gộp chung khiến module phình to, khó test độc lập, và một thay đổi ở follow có thể vô tình ảnh hưởng user. Tách riêng giúp mỗi module có thể export đúng những gì module khác cần qua `exports` của `@Module`.

**Áp dụng:** khi thêm tính năng mới, tự hỏi "cái này thuộc domain nào?" trước khi thêm code vào module có sẵn. Nếu không khớp domain nào, tạo module mới.

---

## 2. Folder Structure

### 2.1 Cấu trúc cấp `src/` — tầng base/core

```
src/
├── main.ts                 # Chỉ bootstrap: create app → configureApp() → Swagger → listen. Không khai business logic.
├── app.module.ts           # Root module: ConfigModule/TypeOrmModule/I18nModule + import các feature module
├── common/                 # Dùng chung, KHÔNG thuộc domain nào
│   ├── bootstrap/          # configure-app.ts — pipe/interceptor/filter toàn cục, dùng chung cho main.ts và e2e
│   ├── decorators/         # Param decorator dùng chung (vd: @CurrentUser)
│   ├── entities/           # Base entity dùng chung (vd UuidBaseEntity — sinh UUID tại app)
│   ├── enums/              # Enum cross-cutting nhiều module cùng cần ở runtime (vd UserRole — mục 10)
│   ├── filters/            # Exception filter toàn cục (all-exceptions.filter.ts)
│   └── utils/              # Helper thuần, không state — hậu tố `.util.ts`
├── config/                 # env.validation.ts (Joi schema) + typeorm.config.ts (registerAs factory)
├── database/
│   ├── migrations/         # Migration TypeORM — KHÔNG dùng synchronize
│   └── seeds/              # Seed CLI (npm run seed) — script ngoài Nest, không phải feature module
├── i18n/{lang}/*.json      # File dịch (common/errors/validation), copy sang dist qua nest-cli assets
├── redis/                  # Infra module (@Global) — cung cấp RedisService cho toàn app
└── modules/{feature}/      # Feature module theo domain (mục 1)
```

**Rule:**

- `common/` là tầng **thấp nhất**: chỉ chứa thứ không thuộc domain nào. File helper thuần đặt hậu tố `.util.ts` cho đồng nhất (`extract-bearer-token.util.ts`, `postgres-unique-violation.util.ts`).
- Infra module (`redis/`) đặt ngay dưới `src/`, **không** nằm trong `modules/` — `modules/` chỉ dành cho domain nghiệp vụ. Vì mỗi vai trò trong infra module chỉ có đúng 1 file nên để phẳng (`redis.module.ts`, `redis.service.ts`, `redis.constants.ts`), đúng nguyên tắc "một-module-một-cái thì để phẳng" ở mục 2.2; khi nào phát sinh nhiều file constant mới tách `constants/`.
- `main.ts` không được tự khai pipe/filter/interceptor toàn cục — tất cả nằm trong `common/bootstrap/configure-app.ts` để e2e (`test/utils/create-test-app.ts`) boot app **giống production**. Khai ở `main.ts` thì e2e chạy thiếu pipe/filter đó và test xanh giả.

### 2.2 Cấu trúc trong một Module

Nguyên tắc: **file nào một-module-một-cái** (controller, service, module) thì để phẳng ngay ở root module — tên file đã có hậu tố `.controller.ts`/`.service.ts` nên không cần bọc thêm folder. **File nào một module có thể có nhiều cái** (DTO, entity, guard, constant, interface...) thì mới tách subfolder theo vai trò.

```
src/modules/{feature}/
├── {feature}.controller.ts    # Route handler(s) — chỉ định tuyến. Nếu module có nhiều controller (vd: public + admin), đặt tên phân biệt rõ, KHÔNG cần bọc folder controllers/ cho 1-2 file.
├── {feature}.service.ts       # Business logic, transaction, xử lý lỗi
├── {feature}.module.ts
├── {feature}.service.spec.ts  # Unit test đặt cạnh file được test
├── entities/                  # TypeORM entity (DB model) — thường có thể phát sinh nhiều entity/module
├── dto/                       # Request/response DTOs — luôn có nhiều hơn 1 file
├── guards/                    # Auth guards riêng của module (nếu có)
├── strategies/                # Passport strategies (nếu có)
├── interceptors/              # Interceptor factory (vd: FileInterceptor config)
├── constants/                 # Hằng số của module (UPPER_SNAKE_CASE)
├── enums/                     # Enum chỉ module này dùng (vd OrderStatus) — cross-cutting thì lên common/enums/ (mục 10)
└── interfaces/                # Type/interface dùng chung trong module
```

**Enum của cột trạng thái (`OrderStatus`, `UserStatus`, `ChatConversationStatus`...) luôn tách ra `enums/<ten>.enum.ts`, không khai `export enum` ngay trong file entity dùng nó** — dù enum đó chỉ dùng trong đúng 1 module (không đủ điều kiện lên `common/enums/` theo mục 10). Lý do: cùng một logic với việc tách interface ra `interfaces/` (mục 4) — file entity chỉ nên chứa đúng 1 thứ (định nghĩa bảng), còn enum là một khái niệm nghiệp vụ độc lập mà DTO/service/entity khác trong module đều cần import; để enum trong entity buộc mọi nơi khác phải `import { OrderStatus } from '../entities/order.entity'`, kéo theo cả file entity chỉ để lấy 1 enum. Đây từng là lỗ hổng thật trong repo: `UserRole` được tách ra `common/enums/` (vì lý do cross-module ở mục 10), nhưng 6 enum còn lại (`AuthTokenType`, `UserStatus`, `OrderStatus`, `EmailNotificationEventType`, `EmailNotificationStatus`, `ChatConversationStatus`, `ProductSuggestionStatus`) vẫn nằm trong entity — không nhất quán dù không có lý do kỹ thuật nào biện minh cho sự khác biệt đó.

Ví dụ áp dụng cho domain Mini Shop (chưa có trong repo — minh hoạ cách đặt file khi triển khai PR04 `feat/schema-seed` trở đi, theo đúng 14 bảng ở [database.md](./docs/planning/database.md)):

```
src/modules/products/
├── products.controller.ts       # public + admin, tách 2 method rõ tên nếu cần; xem mục 2.2 khi nào tách controllers/
├── products.service.ts
├── products.service.spec.ts
├── products.module.ts
├── entities/product.entity.ts
├── dto/create-product.dto.ts
├── dto/product-response.dto.ts
├── constants/products.constants.ts
└── interceptors/product-image-upload.interceptor.ts

src/modules/cart/
├── cart.controller.ts
├── cart.service.ts
├── cart.service.spec.ts
├── cart.module.ts
└── entities/cart-item.entity.ts

src/modules/orders/
├── orders.controller.ts
├── orders.service.ts
├── orders.service.spec.ts
├── orders.module.ts
├── entities/order.entity.ts
├── entities/order-item.entity.ts
├── entities/order-status-history.entity.ts
└── dto/order-response.dto.ts
```

**Vì sao:** bọc `controllers/`/`services/` quanh đúng 1 file/module không thêm giá trị tra cứu — tên file `.controller.ts`/`.service.ts` đã tự nói vai trò, còn thêm 1 cấp thư mục chỉ làm sâu path không cần thiết. Ngược lại, `dto/`, `entities/`... thực sự có nhiều file nên tách riêng mới giúp tìm nhanh.

**Áp dụng:** mặc định để `{feature}.controller.ts`, `{feature}.service.ts`, `{feature}.module.ts` phẳng ở root. Chỉ tạo `controllers/`/`services/` subfolder khi module **thật sự** có từ 2 controller hoặc 2 service trở lên (vd: cần tách controller public và controller admin).

---

## 3. Controller — Chỉ là tầng định tuyến

**Rule:** Controller **không** chứa business logic, không tự query DB, không tự xử lý điều kiện nghiệp vụ. Controller chỉ nhận request, gọi đúng 1 hàm service, trả response.

**Vì sao:** Mentor review trực tiếp: _"Ở controller mình làm tầng định tuyến, nên chỉ gọi lại hàm xử lý ở service thôi chứ không xử lý nhiều."_

**Sai (logic nằm trong controller):**

```typescript
@Get(':username')
async getProfile(@Param('username') username: string, @CurrentUser() currentUser: User | null) {
  const profileUser = await this.usersService.findByUsername(username);
  if (!profileUser) throw new NotFoundException(...);
  const following = currentUser
    ? await this.followsService.isFollowing(currentUser.id, profileUser.id)
    : false;
  return ProfileResponseDto.fromEntity(profileUser, following);
}
```

**Đúng (controller mỏng, service xử lý hết):**

```typescript
@Get(':username')
async getProfile(@Param('username') username: string, @CurrentUser() currentUser: User | null) {
  return this.profilesService.getProfile(username, currentUser?.id);
}
```

**Việc dựng response DTO cũng tính là "xử lý", phải nằm trong service — kể cả khi không cần query DB thêm.** Bug thật đã có trong repo: `AuthController.getCurrentUser()` và `UsersController.updateCurrentUser()` tự gọi `UserResponseDto.fromEntity(user, token)` ngay trong controller, trong khi `AuthService.register()`/`login()` (cùng file, cùng trả `UserResponseDto`) đã làm đúng — dựng DTO trong service. Lý do sai không rõ ràng như "gọi thẳng DB": không có query nào bị lộ ra controller, chỉ là 1 lệnh gọi factory thuần — nhưng vẫn phá vỡ ranh giới trách nhiệm và không nhất quán với chính 2 hàm khác trong cùng class. Đã fix bằng cách thêm `UsersService.toResponseDto(user, token)` / `AuthService.getCurrentUser(user, token)`, controller chỉ còn gọi lại.

**Áp dụng:** kể cả khi dựng response chỉ là 1 lệnh gọi static factory không cần `await`/query gì thêm, vẫn đặt trong service, không gọi `XxxResponseDto.fromEntity()` trực tiếp từ controller.

---

## 4. Type Extraction — Không dùng inline union type

**Rule:** Khi một type lặp lại ở nhiều chỗ (function signature, DTO field...), tách ra `interface`/`type` riêng trong `interfaces/`.

**Vì sao:** Mentor review: _"em tạo 1 type riêng cho gọn nhé"_ — inline object type lặp lại ở controller, service khiến code dài dòng, khó đồng bộ khi sửa.

**Sai:**

```typescript
async updateWithAvatar(
  userId: string,
  data: Partial<{ username: string; email: string; password: string; bio: string; image: string }>,
  avatar?: { originalname: string; mimetype: string; size: number; buffer: Buffer },
): Promise<User> { ... }
```

**Đúng:**

```typescript
// interfaces/avatar-file.interface.ts
export interface AvatarFile {
  originalname: string;
  mimetype: string;
  size: number;
  buffer: Buffer;
}

// interfaces/update-user-data.interface.ts
export interface UpdateUserData {
  username?: string;
  email?: string;
  password?: string;
  bio?: string;
  image?: string;
}
```

---

## 5. Extract cấu hình lặp lại thành hàm riêng

**Rule:** Khi một khối option (interceptor config, validation rule...) dài và có thể tái sử dụng, tách thành hàm/factory riêng rồi gọi lại.

**Vì sao:** Mentor review: _"Các option này, em tạo 1 hàm riêng rồi call thôi cho gọn nha."_

**Sai (khai báo inline trong decorator):**

```typescript
@UseInterceptors(
  FileInterceptor('avatar', {
    limits: { fileSize: 10 * 1024 * 1024 },
    fileFilter: (_req, file, callback) => {
      if (!ALLOWED_AVATAR_MIME_TYPES.includes(file.mimetype)) {
        callback(new BadRequestException(...), false);
        return;
      }
      callback(null, true);
    },
  }),
)
```

**Đúng (tách factory function):**

```typescript
// constants/users.constants.ts
export const ALLOWED_AVATAR_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
export const MAX_AVATAR_SIZE = 10 * 1024 * 1024;

// interceptors/avatar-upload.interceptor.ts
export function createAvatarUploadInterceptor() {
  return FileInterceptor('avatar', {
    limits: { fileSize: MAX_AVATAR_SIZE },
    fileFilter: (_req, file, callback) => {
      if (!ALLOWED_AVATAR_MIME_TYPES.includes(file.mimetype)) {
        callback(new BadRequestException(`Avatar must be one of: ${ALLOWED_AVATAR_MIME_TYPES.join(', ')}`), false);
        return;
      }
      callback(null, true);
    },
  });
}

// controller
@UseInterceptors(createAvatarUploadInterceptor())
```

Ví dụ trên là code thật trong repo — `src/modules/users/interceptors/avatar-upload.interceptor.ts` — không phải minh hoạ. Chú ý tên thư mục là `interceptors/` (đúng mục 2.2, đặt cạnh vai trò NestJS thật của nó), **không phải** `helpers/`: repo này không có khái niệm "helper" chung chung nào cả, xem thêm bảng vai trò file bên dưới.

---

## 6. Transaction — Toàn vẹn dữ liệu khi thao tác nhiều bảng

**Rule:** Khi một nghiệp vụ ghi vào nhiều bảng (vd: xóa attachment cũ + lưu attachment mới + update user), phải bọc trong transaction. Nếu bước nào lỗi, toàn bộ rollback.

**Vì sao:** Mentor review: _"Chỗ này em dùng transaction để toàn vẹn dữ liệu trong trường hợp fails."_

**CẢNH BÁO — lỗi dễ mắc nhất khi dùng `dataSource.transaction()`:** `dataSource.transaction(async (manager) => {...})` chỉ tạo ra 1 connection/transaction _có sẵn_ trong tham số `manager` của callback. Nếu code bên trong callback gọi service khác mà service đó dùng `Repository` inject qua `@InjectRepository` (connection mặc định) thay vì `manager` được truyền vào, thì các câu lệnh đó **chạy ngoài transaction, tự commit ngay lập tức** — `transaction()` lúc này chỉ là cái vỏ rỗng, không rollback được gì. Đây là lỗi từng thực sự xảy ra trong repo này (`updateWithAvatar` gọi `attachmentsService.saveFile`/`deleteAllForOwner` không truyền `manager`) và bị 10 agent review độc lập phát hiện cùng lúc.

**Sai (transaction rỗng — nhìn giống đúng nhưng không atomic):**

```typescript
async updateWithAvatar(userId: string, dto: UpdateUserDto, avatar?: Express.Multer.File): Promise<User> {
  const data = await this.buildUpdateData(dto);
  return this.dataSource.transaction(async () => {          // (manager) không được khai báo/dùng
    if (avatar) {
      await this.attachmentsService.deleteAllForOwner(AttachmentOwnerType.USER_AVATAR, userId); // chạy trên connection mặc định
      const attachment = await this.attachmentsService.saveFile(AttachmentOwnerType.USER_AVATAR, userId, avatar); // tự commit ngay
      data.image = `/attachments/${attachment.id}`;
    }
    return this.updateById(userId, data); // usersRepository cũng dùng connection mặc định — không rollback được
  });
}
```

Nếu `updateById` fail (vd trùng username) sau khi avatar đã đổi: file/row avatar mới đã **commit thật**, avatar cũ đã bị xóa thật — không gì rollback lại được, dù code "trông có transaction".

**Đúng (truyền `manager` xuyên suốt mọi Repository call bên trong transaction):**

```typescript
// users.service.ts
async updateWithAvatar(userId: string, dto: UpdateUserDto, avatar?: Express.Multer.File): Promise<User> {
  const data = await this.buildUpdateData(dto);
  return this.dataSource.transaction(async (manager) => {   // lấy đúng EntityManager của transaction
    if (avatar) {
      await this.attachmentsService.deleteAllForOwner(AttachmentOwnerType.USER_AVATAR, userId, manager);
      const attachment = await this.attachmentsService.saveFile(AttachmentOwnerType.USER_AVATAR, userId, avatar, manager);
      data.image = `/attachments/${attachment.id}`;
    }
    return this.updateById(userId, data, manager);           // truyền tiếp xuống updateById
  });
}

async updateById(id: string, data: UpdateUserData, manager?: EntityManager): Promise<User> {
  const repository = manager ? manager.getRepository(User) : this.usersRepository;
  // ... dùng `repository` thay vì `this.usersRepository` từ đây trở xuống
}
```

```typescript
// attachments.service.ts — method của service khác được gọi bên trong transaction cũng phải nhận & dùng manager
async saveFile(ownerType: AttachmentOwnerType, ownerId: string, file: Express.Multer.File, manager?: EntityManager): Promise<Attachment> {
  const repository = manager ? manager.getRepository(Attachment) : this.attachmentsRepository;
  // ...
}
```

**Áp dụng:** bất kỳ method nào có thể được gọi _bên trong_ một `dataSource.transaction()` của service khác đều phải nhận thêm tham số `manager?: EntityManager` tuỳ chọn, và tự chọn `manager.getRepository(Entity)` thay vì Repository đã inject khi `manager` được truyền vào. Test phải mock `DataSource.transaction` trả về một `manager` giả có `getRepository` (không phải `undefined`), và assert rằng `manager` đó thực sự được truyền xuống các service con — nếu không, test vẫn xanh dù transaction bị rỗng như ví dụ Sai ở trên (xem `users.service.spec.ts`, test `updateWithAvatar` và `test/users.e2e-spec.ts` test _"rolls back the avatar swap when the rest of the update fails"_ — test e2e này insert thật vào Postgres và assert đúng row nào sống sót sau rollback, phát hiện được lỗi mà test unit mock không thể).

**Lưu ý theo mentor:** xóa row attachment trong DB là bắt buộc trong transaction; xóa **file vật lý trên đĩa có thể để lại**, dọn dẹp sau bằng cron job hàng tháng — không cần chặn transaction chính vì thao tác I/O đĩa không rollback được (transaction DB chỉ bảo vệ được các bảng, không bảo vệ được filesystem).

---

## 7. Error Handling — Bắt lỗi cụ thể, trả message rõ ràng

**Rule:**

- Luôn guard trường hợp input rỗng trước khi gọi TypeORM update (`Object.keys(data).length === 0`).
- Bắt `QueryFailedError` mã `23505` (unique violation) → convert thành `ConflictException` với message theo đúng constraint bị vi phạm (phân biệt username/email).
- Race condition (double-click follow) → dựa vào DB constraint bắt lỗi, không chỉ dựa vào check-then-act.

```typescript
async updateById(id: string, data: Partial<UpdateUserData>): Promise<User> {
  if (Object.keys(data).length === 0) {
    return (await this.findById(id))!;
  }
  try {
    await this.usersRepository.update(id, data);
  } catch (error) {
    throw this.toConflictOrRethrow(error);
  }
  const user = await this.findById(id);
  if (!user) throw new NotFoundException(this.i18n.t('errors.userNotFound'));
  return user;
}

private toConflictOrRethrow(error: unknown): unknown {
  if (!(error instanceof QueryFailedError) || (error.driverError as { code?: string })?.code !== POSTGRES_UNIQUE_VIOLATION) {
    return error;
  }
  const constraint = (error.driverError as { constraint?: string })?.constraint;
  if (constraint === 'UQ_users_username') return new ConflictException(this.i18n.t('errors.usernameAlreadyTaken'));
  if (constraint === 'UQ_users_email') return new ConflictException(this.i18n.t('errors.emailAlreadyRegistered'));
  return new ConflictException(this.i18n.t('errors.usernameOrEmailAlreadyRegistered'));
}
```

---

## 8. Upload File — Luôn validate MIME type

**Rule:** `FileInterceptor` phải có `fileFilter` với allow-list MIME type rõ ràng, không chỉ dựa vào `limits.fileSize`.

**Vì sao:** không validate MIME type mở ra lỗ hổng stored-content-type spoofing (upload `.html` giả làm avatar rồi server trả về đúng Content-Type gốc → XSS).

---

## 9. Response Envelope — Format thống nhất

**Rule:** Mọi response thành công phải bọc trong 1 object có key là tên resource số ít (`user`, `profile`); mọi lỗi trả về `{ errors: { body: string[] } }`. Không tự chế format khác trong controller/service.

**Vì sao:** API theo chuẩn RealWorld — client (frontend) parse cố định theo envelope này. Một module trả sai format sẽ vỡ hợp đồng API mà không lỗi compile-time.

**Response thành công — luôn qua static factory `fromEntity` của DTO:**

```typescript
// dto/user-response.dto.ts
export class UserResponseDto {
  user: {
    email: string;
    token: string;
    username: string;
    bio: string | null;
    image: string | null;
  };

  static fromEntity(user: User, token: string): UserResponseDto {
    const dto = new UserResponseDto();
    dto.user = {
      email: user.email,
      token,
      username: user.username,
      bio: user.bio,
      image: user.image,
    };
    return dto;
  }
}
// → { "user": { "email": "...", "token": "...", ... } }
```

```typescript
// dto/profile-response.dto.ts theo cùng pattern, key là "profile"
// → { "profile": { "username": "...", "bio": "...", "image": "...", "following": true } }
```

**Response lỗi — xử lý tập trung ở `AllExceptionsFilter`, controller/service KHÔNG tự build response lỗi:**

```typescript
// src/common/filters/all-exceptions.filter.ts — đã xử lý sẵn, chỉ cần throw đúng HttpException
throw new ConflictException(this.i18n.t('errors.usernameAlreadyTaken'));
// → filter tự convert thành { "errors": { "body": ["Username already taken"] } }
```

**Filter phải là catch-all (`@Catch()`), không chỉ `@Catch(HttpException)`.** Nếu chỉ bắt `HttpException`, mọi lỗi không phải HTTP (Redis down, `QueryFailedError` chưa được convert, TypeError...) sẽ rơi xuống filter mặc định của Nest và trả `{ "statusCode": 500, "message": "Internal server error" }` — **vỡ envelope** mà không có lỗi compile-time nào báo, đúng loại bug mà rule này sinh ra để chặn. Với lỗi không phải `HttpException`, filter log lại bằng `Logger` (để debug) nhưng chỉ trả message chung `Internal server error` cho client — không leak message gốc (có thể chứa connection string, query, secret).

**Áp dụng:** khi tạo resource mới, luôn tạo `XxxResponseDto` với static `fromEntity()`, không trả entity thô hoặc object tự chế từ controller.

---

## 10. Chiều phụ thuộc giữa Module

**Rule:** Import giữa các module phải theo **một chiều duy nhất**, không được vòng (circular). Chiều phụ thuộc hiện tại:

```
auth ──depends on──▶ users
users ──depends on──▶ attachments
categories ──depends on──▶ (module lá, không phụ thuộc module nghiệp vụ khác)
products ──depends on──▶ categories, attachments
cart ──depends on──▶ products (chỉ entity, qua TypeORM relation)
orders ──depends on──▶ users, cart, products
reviews ──depends on──▶ users, products, orders (chỉ EXISTS query, không import OrdersModule)
chat ──depends on──▶ users
product-suggestions ──depends on──▶ users
notifications ──depends on──▶ users, orders, auth (chỉ entity, qua TypeORM relation)
attachments ◀── không phụ thuộc module nghiệp vụ nào khác (module lá)

redis (@Global) ──▶ không import module nghiệp vụ nào; được inject ở bất kỳ đâu, không cần import RedisModule
common/, config/ ◀── tầng thấp nhất: KHÔNG được import giá trị từ modules/
```

**Lưu ý về `reviews`/`orders`:** review chỉ được tạo khi customer có order COMPLETED chứa product (mục 3 của [database.md](./docs/planning/database.md)) — đây là rule xuyên bảng, kiểm tra bằng `EXISTS` trong query builder của `ReviewsService`, KHÔNG import `OrdersModule` để gọi `OrdersService`. Cùng nguyên tắc với cặp `articles`/`favorites` ở dự án tham khảo: phụ thuộc dữ liệu (entity-level, qua FK) khác với phụ thuộc module (qua `imports`/`exports` của `@Module`) — chỉ loại thứ hai mới tính là import vòng nếu đi ngược chiều.

**Rule cụ thể:**

- Module ở lớp dưới (`users`, `attachments`) **không được import** từ module ở lớp trên (`profiles`, `auth`).
- Muốn dùng logic của module khác → import qua `exports` của `XxxModule`, không import thẳng file service/controller của module chưa export nó (kiểm tra `exports: [...]` trong `XxxModule` trước khi import).
- Nếu 2 module cần dữ liệu của nhau (A cần B, B cần A) → dấu hiệu cần tách thêm 1 module thứ 3 chứa phần dùng chung, không phá lệ để import vòng.
- `common/` chỉ được phụ thuộc `modules/` ở **mức type**, bằng `import type` — không import giá trị (class, service, constant runtime). Ví dụ `common/decorators/current-user.decorator.ts` cần shape của `User`: `import type { User } from '../../modules/users/entities/user.entity'`. `import type` bị xoá hoàn toàn khi compile (kiểm chứng: `dist/common/decorators/current-user.decorator.js` không có `require` nào tới users) nên tầng thấp nhất vẫn không có runtime coupling ngược chiều. Import thường (không có `type`) sẽ tạo coupling thật và phải sửa.
- Không đặt decorator/util dùng chung vào một feature module chỉ vì "nó liên quan domain đó": `@CurrentUser` được cả `users`, `profiles`, `auth` dùng — chuyển nó vào `modules/auth/` sẽ khiến `users → auth` trong khi `auth → users` đã tồn tại, tức là **import vòng**. Thứ nhiều module cùng dùng thuộc `common/`.
- **Cùng nguyên tắc áp dụng cho enum/type, không chỉ decorator/util.** Câu hỏi để quyết định một enum thuộc `common/` hay thuộc module sở hữu cột DB: enum đó có bị **nhiều module không liên quan trực tiếp tới nhau** cùng cần dùng ở **runtime** (so sánh giá trị, không chỉ khai kiểu) không? Ví dụ thật trong repo: `UserRole` (`CUSTOMER|ADMIN`) tưởng như thuộc `users` (đúng là cột `users.role`), nhưng `RolesGuard`/`@Roles()` cần so sánh giá trị này ở **controller của gần như mọi module** có route admin-only (`categories`, `products`, `orders`, `chat`, `product-suggestions`...) — những module này **không** nằm trong chiều phụ thuộc `→ users` ở trên. Nếu để `UserRole` trong `users/entities/user.entity.ts`, mỗi module đó phải tự thêm dependency `→ users` chỉ để lấy 1 enum, và `common/` (nếu có `RolesGuard` chung) còn vi phạm thẳng rule "chỉ `import type` từ `modules/`" vì enum TypeScript **không bị xoá khi compile** (khác `interface`/`type`) — so sánh giá trị bắt buộc phải import giá trị thật. Giải pháp: đặt `UserRole` ở `common/enums/user-role.enum.ts`, `user.entity.ts` import lại từ đó để khai cột `role` — không định nghĩa hai nơi. `UserStatus` thì khác: chỉ `auth` (đã có sẵn `auth → users`) cần so sánh giá trị này, nên giữ nguyên trong module `users`, không cần chuyển lên `common/` — nhưng vẫn tách file riêng `users/enums/user-status.enum.ts` thay vì khai trong `user.entity.ts`, theo rule ở mục 2.2 (tách file là vấn đề tổ chức code trong module, khác với câu hỏi "có lên `common/` hay không").
- **Áp dụng:** trước khi đặt một enum/type mới vào entity hay service của module, tự hỏi "route/guard/decorator ở module KHÁC (không có quan hệ `→` với module này) có cần so sánh giá trị này không?" — nếu có và số module cần dùng nhiều hơn 1-2 (không phải quan hệ 1-1 rõ ràng), đặt ở `common/enums/` (hoặc `common/constants/` nếu là hằng số, không phải enum) ngay từ đầu, đừng đợi phát hiện xung đột dependency mới chuyển.

**Vì sao:** import vòng giữa module gây lỗi khởi tạo DI khó debug (`Nest can't resolve dependencies`), và làm mất khả năng test module độc lập.

**Áp dụng:** trước khi thêm import cross-module, kiểm tra ngược lại xem module đích có import lại module nguồn không. Nếu có, dừng lại và tách logic dùng chung ra module riêng.

---

## 11. Testing Convention

**Rule:**

- Unit test (`*.spec.ts`) đặt cạnh file được test, cùng thư mục (vd: `users.service.spec.ts` cạnh `users.service.ts` ở root module).
- Mock tất cả dependency ở boundary của service đang test (Repository, `I18nService`, service của module khác) — **không mock chính class đang test**.
- Không cần DB thật cho unit test — dùng `getRepositoryToken` + mock object cho `Repository`.
- Test tối thiểu phải phủ: happy path, lỗi validate (unique violation → đúng exception), race condition nếu có (follow trùng), trường hợp rỗng/null.
- Không viết test cho code chỉ gọi lại thư viện (vd: không cần test lại chính TypeORM).

**Vì sao:** giữ test nhanh, độc lập, không phụ thuộc DB/network khi chạy CI.

**Áp dụng:** khi thêm method mới vào service có xử lý lỗi/điều kiện nghiệp vụ, bắt buộc thêm test case tương ứng trước khi coi PR hoàn thành.

**E2E test (`test/*.e2e-spec.ts`):**

- Bắt buộc thêm e2e cho một flow khi thoả **một trong hai** điều kiện: (1) flow đi xuyên ≥2 module (vd: register ở `auth` → dùng ở `users`/`profiles`), hoặc (2) flow phụ thuộc hành vi DB thật mà unit test mock `Repository` không kiểm chứng được (unique constraint, transaction rollback).
- Dùng DB/Redis thật qua docker-compose (`test/utils/create-test-app.ts` boot cả `AppModule`), không mock — mục đích của e2e là xác nhận toàn bộ pipeline (guard, pipe, filter, DB constraint) hoạt động đúng với nhau, khác với unit test.
- Dùng chung `createTestApp()` và `registerUser()` trong `test/utils/` cho mọi file e2e, không copy lại logic bootstrap/tạo user ở từng file (xem mục 5 — extract cấu hình lặp lại).
- Hiện có trong repo này: chỉ `test/app.e2e-spec.ts` (health check của foundation). Chưa có e2e nghiệp vụ nào vì chưa có module nghiệp vụ nào được viết (xem README — foundation-only). Khi thêm module theo lộ trình PR ([full-scope-plan.md](./docs/planning/full-scope-plan.md)), thêm e2e tương ứng (vd `test/auth.e2e-spec.ts` ở PR06, `test/checkout.e2e-spec.ts` ở PR12...) và cập nhật lại danh sách này — không để mục này lạc hậu so với `test/` thật.

**E2E dùng database riêng, tự seed/truncate mỗi test case:**

- `.env.test` (khai commit trong repo, khác `.env` chỉ ở `DB_NAME=mini_shop_test`) — e2e **không bao giờ** chạy trên DB dev. Trước PR6, e2e chạy chung `.env`/DB dev nên mỗi lần chạy tích luỹ rác (697 user/102 article rác từng thấy trong DB dev khi audit lại) — tách DB riêng để triệt để.
- `test/utils/setup-env.ts` nạp `.env.test` qua `dotenv.config()` ở `setupFiles` (chạy **trước** khi `AppModule`/`ConfigModule.forRoot()` được import) — dotenv mặc định không override biến đã có sẵn trong `process.env`, nên trên CI (đã set `DB_NAME` thật ở job `env:`) file `.env.test` bị bỏ qua tự nhiên, không cần sửa `ci.yml`.
- `test/utils/db-reset.ts` (`truncateAllTables`) + `test/utils/seed-database.ts` (`seedDatabase`, 2 user cố định `seed_alice`/`seed_bob`) được gắn vào `beforeEach`/`afterEach` **toàn cục** qua `test/utils/reset-database.setup.ts` (khai ở `setupFilesAfterEnv`) — mọi file `*.e2e-spec.ts` tự động seed trước và truncate sau **mỗi** test case, không cần từng file tự gọi. `createTestApp()` lưu `DataSource` của app đang chạy vào biến module-scope (`getActiveDataSource()`) để hook toàn cục lấy được đúng connection.
- **Bắt buộc `--runInBand`** (`npm run test:e2e`) vì truncate là thao tác toàn DB — nếu Jest chạy nhiều file e2e song song (nhiều worker) trên cùng 1 DB test, file này truncate sẽ xoá luôn dữ liệu file kia đang test giữa chừng, gây flaky. Chạy tuần tự loại bỏ hoàn toàn rủi ro này.
- Migration cho DB test: `npm run migration:run:test` (dùng `data-source.test.ts`, đọc `.env.test`) — chạy 1 lần khi tạo DB test mới hoặc sau khi thêm migration mới, tương tự `migration:run` cho DB dev.
- Dữ liệu seed (`seed_alice`/`seed_bob`) dùng username/email cố định, tách biệt hẳn với `registerUser()` (luôn sinh `user_<uuid>` ngẫu nhiên) — test hiện tại không assert danh sách toàn bộ user/article nên seed không phá assertion nào, chỉ đảm bảo DB không rỗng trước mỗi test như yêu cầu.

**Coverage sâu (C2 — condition coverage) cho ít nhất 1 controller:** `comments` module (`CommentsController` + `CommentsService`) được chọn làm ví dụ — `test/comments.e2e-spec.ts` phủ cả 2 nhánh của mọi điều kiện đơn trong 2 file này (có/không token; article tồn tại/không; comment tồn tại/không; đúng/sai tác giả; viewer ẩn danh/đã đăng nhập; follow/không follow tác giả comment; body hợp lệ/rỗng).

Đo bằng `npm run test:e2e:cov` (config `collectCoverageFrom` trong `test/jest-e2e.json` giới hạn vào `src/modules/comments/**/*.ts`). Kết quả đo thực tế: `comments.service.ts` và `comments.controller.ts` đều 100% statement / 100% function. Branch coverage báo 75-82% ở cả 2 file, nhưng khi soi từng nhánh cụ thể (`coverage-e2e/coverage-final.json`, field `branchMap`+`b`):

- **`CommentsController`: toàn bộ nhánh "chưa phủ" nằm ở dòng `constructor(...)` và chữ ký method (`create`/`list`/`delete`)** — đây là code do TypeScript compiler tự sinh cho decorator metadata (`emitDecoratorMetadata`, cần cho Nest DI/reflection: `@Param`, `@Body`, `@CurrentUser`, `@Post`/`@Get`/`@Delete`...), không phải logic nghiệp vụ. Thân method của `CommentsController` hoàn toàn tuyến tính (gọi service → return), không có `if`/ternary nào — 0 nhánh nghiệp vụ thật để thiếu.
- **`CommentsService`: chỉ 1 nhánh nghiệp vụ thật chưa phủ** — ternary tính `authorFollowing` trong `toResponseDto` (`currentUserId && currentUserId !== comment.authorId ? isFollowing(...) : false`). Nhánh `true` (gọi `isFollowing`) không có đường nào chạm tới qua e2e vì `toResponseDto` chỉ được gọi từ `create()`, nơi `currentUserId` luôn chính là tác giả comment vừa tạo — về cấu trúc không thể khác `comment.authorId` qua bất kỳ route hiện có nào. Đã test ở `comments.service.spec.ts` (unit, gọi thẳng `toResponseDto(comment, 'viewer-id')` với `isFollowing` mock trả `true`). Nhánh `if (!comment)` (`NotFoundException`) trong `deleteByIdForArticle` — tưởng chưa phủ ở lần đo trước — thực ra **đã** được e2e phủ (`returns 404 when deleting an unknown comment id`). Mọi ternary/`if` nghiệp vụ khác (`toListResponseDto`, nhánh `ForbiddenException` của `deleteByIdForArticle`) đều phủ cả 2 chiều qua e2e.

**Áp dụng:** khi đo C2 coverage cho 1 controller/service khác, luôn soi `branchMap`/`b` trong `coverage-final.json` thay vì chỉ đọc % tổng — % branch trên file có nhiều decorator luôn bị kéo thấp giả tạo bởi code compiler sinh ra, không phản ánh đúng coverage logic thật.

**i18n key parity giữa các ngôn ngữ được test tự động, không dựa vào soát tay:** `src/i18n/i18n-key-parity.spec.ts` đọc danh sách file trong `src/i18n/en/` làm chuẩn, rồi assert mọi ngôn ngữ khác (`vi/`, ...) có **đúng cùng bộ file** và mỗi file có **đúng cùng bộ key** (so path dạng `parent.child` cho JSON lồng nhau, dù hiện tại `errors.json`/`validation.json`/`common.json` đều phẳng 1 cấp). Trước đây việc này chỉ được kiểm bằng cách reviewer tự đếm key thủ công trên PR — không có gì chặn một module mới thêm key ở `en/errors.json` mà quên thêm ở `vi/errors.json`, lỗi chỉ lộ ra khi có người thật sự test bằng tiếng Việt. **Áp dụng:** khi thêm ngôn ngữ mới hoặc file i18n mới, không cần sửa gì thêm ở test này — nó tự đọc `en/` làm chuẩn và tự soát mọi ngôn ngữ còn lại.

---

## 12. Naming Conventions

| Đối tượng            | Quy tắc                          | Ví dụ                                                           |
| -------------------- | -------------------------------- | --------------------------------------------------------------- |
| Function/method      | camelCase, verb hoặc verb-noun   | `saveFile`, `deleteAllForOwner`, `isFollowing`                  |
| Constant             | UPPER_SNAKE_CASE                 | `SALT_ROUNDS`, `ALLOWED_AVATAR_MIME_TYPES`                      |
| Class                | PascalCase                       | `UsersService`, `ProfileResponseDto`                            |
| Interface            | PascalCase                       | `AvatarFile`, `UpdateUserData`                                  |
| Boolean method/field | bắt đầu bằng `is`/`has`/`should` | `isFollowing`, `hasAvatar`                                      |
| File                 | kebab-case + hậu tố vai trò      | `users.controller.ts`, `follow.entity.ts`, `update-user.dto.ts` |

**Vai trò các loại file phụ trợ — không phải "cứ tách ra là gọi `helper`":** câu hỏi để chọn đúng loại không phải "đặt tên gì cho hay" mà là **file đó có cần DI (inject dependency qua constructor) không**.

| Loại               | Có DI? | Vai trò                                                            | Ví dụ thật trong repo                                                               |
| ------------------ | ------ | ------------------------------------------------------------------ | ----------------------------------------------------------------------------------- |
| `*.service.ts`     | Có     | Business logic, gọi service khác, transaction                      | `ArticlesService`, `FollowsService`                                                 |
| `*.guard.ts`       | Có     | `CanActivate` — chặn/cho qua request trước khi tới handler         | `jwt-auth.guard.ts`, `optional-jwt-auth.guard.ts`                                   |
| `*.strategy.ts`    | Có     | Passport strategy — xác thực credential, trả `user` hoặc throw     | `jwt.strategy.ts`                                                                   |
| `*.interceptor.ts` | Không  | Factory function trả về 1 NestJS interceptor **đã cấu hình sẵn**   | `avatar-upload.interceptor.ts` → `createAvatarUploadInterceptor()` (mục 5)          |
| `*.util.ts`        | Không  | Hàm thuần, input→output, không side-effect, không cấu hình gì thêm | `postgres-unique-violation.util.ts`, `extract-bearer-token.util.ts`, `slug.util.ts` |

Repo này **không có** file nào tên `*.helper.ts` hay thư mục `helpers/` — nếu thấy nhu cầu "tách 1 hàm cấu hình ra cho gọn" (mục 5), dùng đúng hậu tố theo **NestJS đang gọi khái niệm đó là gì** (`interceptor`, `guard`...), không tự chế thêm khái niệm "helper" chung chung. `composer` (vd `articles-response.composer.ts` reviewer từng đề xuất trên PR4) cũng không phải khái niệm riêng — nếu tách, nó vẫn là 1 `*.service.ts` có DI, chỉ là chưa được tạo ra trong repo này (xem mục 18, lý do chưa tách).

Repo cũng không cần khái niệm "mapper" riêng để convert entity → DTO: logic đó nằm ngay trong static method `fromEntity()` của chính DTO class (mục 9) — `ArticleResponseFields.fromEntity()`, không phải 1 file `*.mapper.ts` tách biệt.

---

## 13. Comment

- Mặc định **không viết comment**.
- Chỉ viết khi giải thích **WHY** (constraint ẩn, workaround, invariant không rõ ràng) — không giải thích **WHAT** vì tên biến/hàm đã tự nói.
- Không tham chiếu ticket/PR/issue trong comment.

---

## 14. Ngoại lệ đã biết với Sunlint (heuristic engine)

Sunlint là **heuristic**, một số cảnh báo không phản ánh đúng thực tế kiến trúc. Các ngoại lệ sau đã được xem xét và **chấp nhận có chủ đích**, không cần sửa mỗi lần gặp lại:

| Rule                                            | Cảnh báo                                                                                                                                                                                                                  | Vì sao chấp nhận                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| ----------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `C033`                                          | _"Service vừa dùng Repository vừa dùng DataSource — pattern không nhất quán"_, và _"method gọi trực tiếp `manager.getRepository()`"_                                                                                      | `UsersService`/`AttachmentsService` dùng `Repository` inject cho query đơn, và `manager.getRepository(Entity)` bên trong `dataSource.transaction()` khi cần ghi nhiều bảng atomic trong 1 transaction (xem mục 6). `manager.getRepository()` là cách chuẩn của TypeORM để lấy Repository _đúng transaction đang chạy_ — không dùng nó thì transaction rỗng (bug thật đã xảy ra, xem mục 6). Không phải lỗi kiến trúc.                                                                                                                                                                                                                                                                                                                          |
| `C030` (đã hết áp dụng)                         | _"Dùng custom error class thay vì throw Error thường"_ trong `jwt.strategy.ts`                                                                                                                                            | Cảnh báo này đã được xử lý thật, không phải bỏ qua: `throw new Error('JWT_SECRET is not configured')` đã bị xoá và thay bằng `config.getOrThrow<string>('JWT_SECRET')` (mục 17.3) — `ConfigService` tự throw ngay tại boot với đúng tên key nên không cần guard tay, và không còn `Error` thường nào trong strategy.                                                                                                                                                                                                                                                                                                                                                                                                                           |
| `C018`                                          | _"Error logging should use structured format / should explain what happened / should provide guidance"_ ở các block `catch` trong `users.service.ts`, `follows.service.ts`, `favorites.service.ts`, `articles.service.ts` | Các block này **rethrow chứ không log**: `catch (error) { throw this.toConflictOrRethrow(error) }` (hoặc `if (isUniqueViolation(error)) { throw new ConflictException(...) } throw error;`) chuyển lỗi unique-violation thành `ConflictException`, còn lỗi khác thì rethrow nguyên trạng (mục 7, mục 16 áp dụng tương tự cho `follows`/`favorites`/`articles`). Log ở đây là sai chỗ theo 2 lý do: (1) `ConflictException` là kết quả nghiệp vụ mong đợi (user follow/favorite trùng), không phải sự cố cần log; (2) lỗi thật sự bất thường đã được `AllExceptionsFilter` log tập trung một lần (mục 9) — log thêm ở service tạo log trùng, cùng 1 lỗi xuất hiện 2 dòng. Sunlint chỉ thấy từ khoá `catch` + `error` nên tưởng là điểm logging. |
| `C030` (rethrow biến lỗi gốc)                   | _"Use custom error classes instead of throwing variables"_ ở dòng `throw error;` trong `follows.service.ts`/`favorites.service.ts`                                                                                        | Đây **không phải** throw một biến string/object tuỳ tiện — `error` ở đây là chính exception đã bắt được từ `catch (error)`, được rethrow nguyên trạng khi nó **không phải** trường hợp unique-violation đang xử lý (xem mục 6, "Race Condition Prevention" trong `mentor_coding_convention`). Heuristic chỉ thấy cú pháp `throw <identifier>` nên hiểu nhầm là throw giá trị thô, không phân biệt được `identifier` đó đã là một `Error` instance hợp lệ từ catch clause hay chưa.                                                                                                                                                                                                                                                             |
| `S037`, `S041`, `S045`, `S025` (một số vị trí)  | Thiếu anti-cache header / brute-force protection / v.v.                                                                                                                                                                   | Đã note trong PR#3: _"style/logging suggestions, not required to fix"_ — đây là gợi ý bảo mật tổng quát cho tương lai (rate limiting, cache header), không phải lỗi chặn merge của pull hiện tại. Cân nhắc làm ở pull riêng về hardening.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| `C041`                                          | _"Variable 'NOTIFICATION_SECRET_KEY_PROVIDER' appears to contain hardcoded sensitive information"_ trong `notification-secret/notification-secret.constants.ts` (chuyển từ `notifications.constants.ts` ở PR06)           | Đây là DI token (chuỗi định danh provider, giống `REDIS_CLIENT` đã có sẵn), không phải secret thật — giá trị chuỗi trùng tên biến chỉ để làm token duy nhất cho `@Inject()`. Heuristic thấy cụm `SECRET_KEY` trong tên biến nên tưởng là credential bị hardcode.                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| `S004`                                          | _"Sensitive data logging... may expose sensitive field 'email'"_ ở `mail.processor.ts` dòng `Sent ${notification.eventType} email for notification ${notificationId}`                                                     | Log chỉ nội suy `eventType` và `notificationId` — không có địa chỉ email nào trong chuỗi. Heuristic thấy từ "email" xuất hiện trong văn bản log (mô tả hành động "sent ... email") nên tưởng nhầm là đang log giá trị email thật.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| `C024`                                          | _"Magic string 'NODE_ENV'/'utf8' should be extracted as named constant"_ ở `notification-dispatcher.service.ts` và `notification-secret-cipher.util.ts`                                                                   | `'NODE_ENV'` là tên biến môi trường chuẩn của Node.js, `'utf8'` là tham số encoding chuẩn của `Buffer`/`string` API — cả hai là hằng số ngôn ngữ/nền tảng, không phải magic value nghiệp vụ cần gom vào `constants/` (khác với vd `MAX_EMAIL_NOTIFICATION_ATTEMPTS`).                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| `C041`                                          | _"Variable 'DUMMY_PASSWORD_HASH' appears to contain hardcoded sensitive information"_ ở `auth/constants/auth.constants.ts`                                                                                                | Không phải password/hash của tài khoản thật — đây là bcrypt hash cố định của một chuỗi không ai dùng làm mật khẩu thật, chỉ để `bcrypt.compare()` trong `AuthService.login()` luôn chạy đủ thời gian kể cả khi email không tồn tại (chống timing attack dò email đã đăng ký). Heuristic thấy hậu tố `_HASH`/tiền tố `PASSWORD` trong tên biến nên tưởng là secret bị lộ.                                                                                                                                                                                                                                                                                                                                                                       |
| `S042` (PR06)                                   | _"JWT token created without expiration configuration. Add expiresIn option"_ ở `auth.service.ts`, dòng `this.jwtService.sign(payload)`                                                                                    | `expiresIn` đã khai một lần duy nhất trong `AuthModule`'s `JwtModule.registerAsync({ signOptions: { expiresIn: config.getOrThrow('JWT_EXPIRES_IN') } })` — mọi `JwtService.sign()` tiêm từ module này tự động kế thừa TTL đó. Heuristic chỉ đọc được call site `sign(payload)` đơn lẻ, không thấy cấu hình global của module nên tưởng token không có hạn.                                                                                                                                                                                                                                                                                                                                                                                     |
| `S011` (PR06)                                   | _"Variable 'authToken' uses weak random generation for security purposes"_ ở `auth.service.ts`, dòng `authTokenRepository.create({...})` trong `createAuthToken()`                                                        | Random generation thật sự nằm ngay phía trên, `randomBytes(EMAIL_VERIFICATION_TOKEN_BYTES)` từ Node `crypto` — đã là CSPRNG đúng chuẩn, không phải `Math.random()`. Heuristic thấy tên biến `authToken` chứa chữ "token" nằm gần lệnh sinh ngẫu nhiên nên gán nhầm cảnh báo vào dòng khai báo entity thay vì dòng gọi `randomBytes()`.                                                                                                                                                                                                                                                                                                                                                                                                         |
| `S004` (PR06)                                   | _"Sensitive data logging... may expose sensitive field 'email'/'authtoken'/'password'/'token'"_ ở nhiều dòng `this.logger.*()` mới trong `auth.service.ts` (`register`/`verifyEmail`/`login`/`logout`)                    | Cùng nguyên nhân với dòng `mail.processor.ts` ở trên: log chỉ nội suy `user.id`/`authToken.id`/`authToken.userId` (UUID định danh row, không phải giá trị nhạy cảm) — heuristic khớp theo **từ** xuất hiện trong câu mô tả tiếng Anh ("wrong **password**", "verified **email**", "**token** revoked"), không phải giá trị thật được log. Không có raw token, password hay email nào lọt vào log.                                                                                                                                                                                                                                                                                                                                              |
| `C014` (PR06, áp dụng chung mọi service có sẵn) | _"Direct instantiation of 'Logger'"_ ở `auth.service.ts` (và đã có sẵn trước đó ở `mail.processor.ts`, `notification-dispatcher.service.ts`, `all-exceptions.filter.ts`)                                                  | `new Logger(ClassName.name)` là pattern chính thức NestJS khuyến nghị cho field logger riêng của từng class — không phải service dependency cần qua DI như `Repository`/`ConfigService`. Bắt buộc DI ở đây sẽ phá vỡ context name tự động (`ClassName.name`) mà `Logger` dùng để gắn nhãn log.                                                                                                                                                                                                                                                                                                                                                                                                                                                 |

**Rule khi thêm ngoại lệ mới:** không tự ý bỏ qua warning — phải ghi lý do cụ thể vào bảng này khi quyết định "chấp nhận, không sửa", để review sau còn biết đây là quyết định có chủ đích chứ không phải bỏ sót.

**Sunlint là gate CỤC BỘ, không phải gate CI.** `sunlint` được cài global (`@sun-asterisk/sunlint`), không có trong `devDependencies`, nên `npm ci` trên CI không có binary này — `ci.yml` **không** chạy được `lint:sunlint` và không nên thêm vào. Trách nhiệm chạy nằm ở người tạo PR (mục 27) kèm ảnh chụp kết quả. File `.sunlint-eslint.config.js` do sunlint tự sinh ra mỗi lần chạy, chứa **đường dẫn tuyệt đối theo máy** (`C:Users...`) nên đã được liệt trong `.gitignore`, `.prettierignore` và `ignores` của eslint — không commit, không format, không lint file này.

---

## 15. Ưu tiên tái sử dụng của thư viện/codebase — hạn chế tự tạo lại

**Rule:** Trước khi tự định nghĩa type/interface/constant mới, kiểm tra xem (1) framework/thư viện đang dùng (NestJS, Express, Multer, TypeORM, class-validator...) đã có sẵn chưa, và (2) chính codebase đã có DTO/interface/class nào mô tả đúng shape đó chưa. Chỉ tự tạo mới khi cả hai đều không có ("thiếu mới tạo mới").

**Vì sao:** tự định nghĩa lại một type/constant đã có sẵn tạo ra nhiều nguồn sự thật (source of truth) cho cùng một khái niệm — thư viện hoặc DTO gốc đổi shape thì bản tự chế không tự động cập nhật theo, lệch nhau âm thầm mà compiler không báo được vì cả hai đều là type hợp lệ riêng biệt.

**Ví dụ đã sửa trong repo:**

| Trước (tự tạo, dư thừa)                                                                                                                                                | Sau (tái sử dụng)                                                                                                                     | Lý do                                                                                                                                                                                                 |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `interface AvatarFile { originalname; mimetype; size; buffer }` tự viết trong `users/interfaces/`, và một object type inline y hệt trong `attachments.service.ts`      | `Express.Multer.File` (từ `@types/multer`, đã sẵn trong devDependencies)                                                              | Multer đã định nghĩa đúng type file upload; tự viết lại vừa dư thừa vừa thiếu field so với thật (`fieldname`, `encoding`, `stream`...) — lỡ dùng field đó ở đâu là lộ ra sai lệch.                    |
| `@HttpCode(200)`, `@HttpCode(204)` (số ma thuật)                                                                                                                       | `@HttpCode(HttpStatus.OK)`, `@HttpCode(HttpStatus.NO_CONTENT)`                                                                        | `HttpStatus` enum có sẵn trong `@nestjs/common` — đọc rõ nghĩa hơn số thuần, tránh gõ nhầm mã trạng thái.                                                                                             |
| `@ApiResponse({ status: 400 })`, `@ApiResponse({ status: 409 })` (số ma thuật, PR06 `auth.controller.ts`)                                                              | `@ApiResponse({ status: HttpStatus.BAD_REQUEST })`, `@ApiResponse({ status: HttpStatus.CONFLICT })`                                   | Cùng `HttpStatus` enum ở trên, áp dụng luôn cho field `status` của `@ApiResponse` (mục 19) — không chỉ `@HttpCode`; một route khai nhiều `@ApiResponse` càng dễ gõ nhầm số nếu không dùng enum.       |
| `res.setHeader('Content-Type', ...)` + `res.sendFile()` qua `@Res()` thô trong `AttachmentsController`                                                                 | `StreamableFile` (built-in Nest) với option `type`                                                                                    | Nest đã có sẵn kiểu trả về cho file streaming, tự quản lý response lifecycle (exception filter/interceptor vẫn hoạt động), không cần thoát ra `@Res()` không kiểm soát.                               |
| Interface `UserEnvelope`/`ProfileEnvelope` tự khai trong `test/utils/` chỉ để ép kiểu `res.body`                                                                       | Import thẳng `UserResponseDto`/`ProfileResponseDto` từ `src/modules/.../dto/`                                                         | DTO thật đã tồn tại trong `src` — khai lại một interface song song chỉ để test là duplicate; DTO đổi field mà quên sửa test thì test vẫn "xanh" giả.                                                  |
| `const SALT_ROUNDS = 10` khai riêng trong `auth.service.ts`, trùng với `SALT_ROUNDS` đã export ở `users/constants/users.constants.ts`                                  | Import `SALT_ROUNDS` từ `users.constants.ts`                                                                                          | 2 module cùng hash password nhưng dùng 2 hằng số độc lập — đổi cost factor ở 1 chỗ, chỗ kia âm thầm lệch, không compile error nào báo.                                                                |
| `POSTGRES_UNIQUE_VIOLATION = '23505'` + logic map lỗi unique-violation khai riêng ở cả `users.service.ts` và `follows.service.ts`                                      | `src/common/utils/postgres-unique-violation.util.ts` export `isUniqueViolation()`/`getViolatedConstraint()`, cả 2 service cùng import | Cùng 1 khái niệm ("đây có phải lỗi trùng khoá không") bị cài đặt lại y hệt ở 2 nơi — sửa 1 chỗ (vd đổi driver DB, thêm constraint mới) rất dễ quên chỗ còn lại.                                       |
| `expiresIn: Number(config.get('JWT_EXPIRES_IN')) \|\| 86400` và `process.env.PORT ?? 3000` tự default lại giá trị mà `Joi` schema (`env.validation.ts`) đã default sẵn | `config.getOrThrow<number>('JWT_EXPIRES_IN')`, `configService.getOrThrow<number>('PORT')`                                             | Joi là nguồn sự thật duy nhất cho default/validate env var; tự default thêm lần 2 vừa dư thừa vừa có bug thật (`value \|\| default` biến `0` hợp lệ thành default sai) khi giá trị đúng lại là falsy. |

**Áp dụng:** trước khi viết `interface`/`type`/`const` mới, tự hỏi theo đúng thứ tự: thư viện đang dùng có sẵn chưa → codebase đã có DTO/interface nào mô tả đúng shape này chưa → chỉ khi cả hai đều không có mới tự định nghĩa. Với biến môi trường: nếu đã khai trong `envValidationSchema` (Joi), luôn đọc qua `ConfigService.getOrThrow()` — không đọc thẳng `process.env` và không tự default thêm lần 2.

---

## 16. Guard — Optional Auth phải fail-closed với lỗi thật, chỉ fail-open khi không có credential

**Rule:** Guard override `handleRequest(err, user, info)` cho route auth-optional (vd `OptionalJwtAuthGuard`) chỉ được coi là "anonymous" (trả `null`, không chặn request) khi **không có lỗi** (`err` rỗng — nghĩa là chỉ đơn giản không gửi token). Nếu `err` có giá trị (token sai định dạng do chính `validate()` throw, token bị revoke/blacklist, user trong token đã bị xoá...) thì phải rethrow, không được nuốt.

**Vì sao:** Bug thật đã xảy ra trong repo — `OptionalJwtAuthGuard.handleRequest(_err, user)` bỏ qua hẳn tham số lỗi và `return user || null`. Hậu quả: user vừa logout (token đã bị `RedisService` blacklist) gọi `GET /profiles/:username` (route auth-optional) — `JwtStrategy.validate()` throw `UnauthorizedException('tokenRevoked')` đúng như thiết kế, nhưng guard nuốt mất lỗi này và coi request là anonymous — trả về 200 thay vì báo token đã bị revoke. Cùng lỗi này cũng che giấu luôn trường hợp hạ tầng thật sự hỏng (Redis down khi check blacklist ném lỗi không mong muốn) thành "chỉ là chưa đăng nhập".

**Sai:**

```typescript
handleRequest<TUser = unknown>(_err: unknown, user: TUser | false): TUser | null {
  return user || null;   // nuốt mọi lỗi, kể cả lỗi thật
}
```

**Đúng:**

```typescript
handleRequest<TUser = unknown>(err: unknown, user: TUser | false): TUser | null {
  if (err) {
    throw err as Error;   // token sai/bị revoke → vẫn phải báo lỗi, không hạ xuống anonymous
  }
  return user || null;    // chỉ trường hợp không gửi token mới coi là anonymous
}
```

**Áp dụng:** mọi guard override `handleRequest` cho auth-optional phải có test riêng (`*.guard.spec.ts`) phủ đúng 3 case: không có token → `null`; có token hợp lệ → trả `user`; có token nhưng bị strategy từ chối (lỗi) → rethrow, không nuốt. Xem `src/modules/auth/guards/optional-jwt-auth.guard.spec.ts`.

---

## 17. Core/Base — Line ending, format gate, đọc env var, TS strict, bootstrap

**17.1 — Line ending: LF bắt buộc, cố định bằng `.gitattributes`.**

**Vì sao:** Windows checkout với `core.autocrlf=true` tự convert LF → CRLF trên đĩa dù blob trong git vẫn là LF — gây `git add` liên tục cảnh báo "LF will be replaced by CRLF", và `prettier --check` (mặc định `endOfLine: "lf"`) fail trên chính những file không hề đổi nội dung, chỉ khác line ending do OS của người checkout.

**Rule:** Repo có `.gitattributes` với `* text=auto eol=lf` — mọi file text luôn checkout ra LF bất kể OS. `.prettierrc` và `eslint.config.mjs` đều khai rõ `endOfLine: "lf"` (không dùng `"auto"`) để 2 công cụ đồng nhất, không cái nào tolerant hơn cái kia.

**Quan trọng — thêm `.gitattributes` KHÔNG tự sửa file đã checkout trước đó.** Attribute chỉ áp dụng cho lần checkout/clean tiếp theo, nên các file đã nằm trên đĩa từ trước vẫn giữ CRLF. Hệ quả đã thực sự xảy ra trong repo này: blob trong git là LF (`git ls-files --eol` báo `i/lf`) nhưng working tree vẫn `w/crlf` ở 17 file (`data-source.ts`, `tsconfig.json`, `package.json`, `.github/workflows/ci.yml`, `src/i18n/**/*.json`, ...) — và `prettier --check .` fail đúng 17 file đó dù không ai sửa nội dung.

**Cách kiểm tra & sửa:**

```bash
git ls-files --eol | grep w/crlf   # rỗng = working tree đã sạch LF
git add --renormalize .            # chuẩn hoá lại LF; vì blob đã là LF nên diff nội dung = 0
```

Sau khi renormalize, `git diff --exit-code` phải trả về 0 cho các file đó (chỉ đổi line ending trên đĩa, không đổi nội dung commit). Lưu ý `core.autocrlf=true` cấu hình cục bộ trên Windows **không** thắng được `.gitattributes` — attribute luôn ưu tiên hơn, nên không cần và không nên đi tắt bằng cách sửa `core.autocrlf` từng máy.

**17.2 — CI phải chạy bản lint/format không tự sửa.**

**Vì sao:** `npm run lint` (`eslint --fix`) tự sửa luôn lỗi format ngay trong bản checkout tạm của CI rồi mới báo kết quả — nghĩa là CI **không bao giờ thực sự chặn** được code format sai lọt vào repo, chỉ tự vá và pass, tạo cảm giác an toàn giả.

**Rule:** Có 2 cặp script riêng biệt:

- `npm run lint` / `npm run format` — có `--fix`/`--write`, dùng khi code cục bộ (dev tự sửa).
- `npm run lint:check` / `npm run format:check` — không có `--fix`/`--write`, chỉ báo lỗi rồi exit non-zero. **CI (`ci.yml`) chỉ được dùng cặp `:check`**, không bao giờ dùng bản có `--fix`.

**Gate phải phủ CẢ REPO, không chỉ glob `src`/`test`.** Trước đây script dùng glob thủ công (`prettier --check "src/**/*.ts" "test/**/*.ts"`, `eslint "{src,apps,libs,test}/**/*.ts"`) nên **không** phủ: `data-source.ts` (file TS thật ở root, có 7 lỗi format mà CI không thấy), `eslint.config.mjs`, toàn bộ `*.json` / `*.yml` / `*.md` (kể cả `ci.yml`, `tsconfig.json`, `src/i18n/**`). Glob "an toàn" như vậy là cách âm thầm nhất để gate mất tác dụng — file không khớp glob thì không bao giờ fail.

**17.6 — `npm run build` xanh và `npm run test:e2e` xanh không chứng minh app thật sự chạy được từ `dist/`.**

**Bug thật, nghiêm trọng, tồn tại xuyên suốt PR1-PR6 mà không CI check nào bắt được:** `npm run start:prod` (`node dist/main`) **crash ngay khi boot** — `I18nModule` báo `ENOENT: no such file or directory, scandir 'dist/src/i18n/'`. Nguyên nhân: `tsconfig.build.json` loại trừ `data-source.ts` khỏi build nhưng **quên** loại trừ `data-source.test.ts` (file thêm sau ở PR6, nằm ở root repo, cạnh `src/`). Vì `data-source.test.ts` vẫn nằm trong tập file compile, TypeScript suy ra `rootDir` chung là **root repo** (không phải `src/`) — toàn bộ `src/**` bị nén thêm 1 cấp thành `dist/src/**`, trong khi `nest-cli.json` copy asset `i18n/**/*` (glob tính từ `sourceRoot: "src"`) lại ra `dist/i18n/` (không có tiền tố `src/`). Hai đường dẫn lệch nhau đúng 1 cấp — `app.module.ts` tìm i18n ở `dist/src/i18n/` (theo `__dirname` lúc runtime của bản build lệch), asset lại nằm ở `dist/i18n/`.

**Vì sao không CI job nào bắt được suốt 6 pull:** `npm run build` chỉ chạy `tsc` — chứng minh code hợp lệ về **type**, không hề thử **chạy** artifact vừa build ra. `npm run test:e2e` import thẳng `AppModule` từ **source TypeScript** qua `ts-jest` (`test/utils/create-test-app.ts`), không đụng tới `dist/` — nên `__dirname` lúc test luôn trỏ đúng `src/`, không bao giờ tái hiện được lỗi lệch đường dẫn này. Nghĩa là 2 gate tưởng như đã phủ đủ ("build sạch" + "e2e xanh") **cùng nhau vẫn để lọt 1 lỗi khiến app thật sự không khởi động được**.

**Đã fix:** thêm `data-source.test.ts` vào `exclude` của `tsconfig.build.json` (khôi phục `rootDir` suy ra đúng về `src/`, output về lại `dist/**` không tiền tố), đồng thời thu hẹp `nest-cli.json`'s `assets` từ `"i18n/**/*"` thành `"i18n/**/*.json"` (glob cũ vô tình copy nhầm cả `i18n-key-parity.spec.ts` vào artifact production). Verify bằng cách thật sự chạy `npm run start:prod`, curl `/api-docs` (200) và 1 request thật gây lỗi validate (message trả về đúng tiếng Anh) — không chỉ tin vào exit code của `build`.

**Áp dụng:** khi thêm file `.ts` mới ở **repo root** (ngang hàng `data-source.ts`, không nằm trong `src/`), luôn kiểm tra `tsconfig.build.json`'s `exclude` đã liệt kê file đó chưa nếu nó không cần có trong production build. Định kỳ (hoặc sau khi đổi `tsconfig.build.json`/`nest-cli.json`), chạy thật `npm run build && npm run start:prod` rồi curl thử 1 endpoint — đừng chỉ tin `tsc`/`test:e2e` xanh là app chạy được, vì cả 2 đều không đi qua `dist/` theo đúng cách production thật sự chạy.

**Rule:** dùng `prettier --check .` / `prettier --write .` và `eslint .` (flat config tự quyết định file nào được lint), rồi khai loại trừ **một nơi duy nhất**: `.prettierignore` cho prettier, `ignores: [...]` trong `eslint.config.mjs` cho eslint (`dist`, `coverage`, `storage`, `package-lock.json`, `.sunlint-eslint.config.js`). Thêm file/loại file mới vào repo là tự động được gate, không phải nhớ sửa glob.

**17.3 — Đọc env var: `ConfigService.getOrThrow()`, trừ `registerAs()` factory.**

**Rule:** Env var đã khai trong `envValidationSchema` (Joi, `.required()` hoặc có `.default()`) thì đọc qua `ConfigService.getOrThrow<T>('KEY')` ở bất kỳ đâu có DI (controller, service, module factory nhận `ConfigService` qua `inject`) — không đọc thẳng `process.env`, không tự default/parse lại lần 2 (xem thêm mục 15).

**Ngoại lệ hợp lệ — `registerAs()` factory (vd `typeorm.config.ts`):** factory này chạy trong `ConfigModule.forRoot({ load: [...] })`, **trước khi `ConfigService` tồn tại** (tránh vòng phụ thuộc: `ConfigService` chính là thứ tổng hợp kết quả của các factory này). Ở đây đọc thẳng `process.env` và tự parse (`Number(process.env.DB_PORT)`) là **đúng chuẩn NestJS**, không phải vi phạm rule trên — vì không có `ConfigService` nào để inject ở thời điểm này. Joi vẫn validate `process.env` gốc ở bước khác trong `ConfigModule.forRoot()`, nên vẫn an toàn.

**Ngoại lệ hợp lệ thứ hai — script CLI chạy ngoài Nest (`data-source.ts`):** file này được `typeorm-ts-node-commonjs` gọi trực tiếp cho migration, **không có Nest container** nên cũng không có `ConfigService`; nó tự `dotenv.config()` rồi tái sử dụng `buildDataSourceOptions()` chung với `typeorm.config.ts` (không copy lại option — xem mục 15). Đây là ngoại lệ được chấp nhận, cùng lý do với `registerAs()`.

**Không dùng `config.get<T>('KEY')!` (non-null assertion) để lách rule.** `get()` + `!` cho cùng kết quả runtime là `undefined` khi thiếu key, chỉ khác là compiler bị bịt miệng: app boot lên với config rỗng và fail ở chỗ khác, xa nguyên nhân. `getOrThrow()` throw ngay tại boot với đúng tên key. Áp dụng cả cho key do `registerAs()` nạp vào: `config.getOrThrow<DataSourceOptions>('typeorm')`.

**Áp dụng:** trước khi viết `config.get('KEY')` hay `process.env.KEY`, tự hỏi: (1) đang ở trong `registerAs()` factory / script CLI ngoài Nest, hay code có DI bình thường? (2) nếu có DI → `getOrThrow()`; nếu là `registerAs()` factory hoặc `data-source.ts` → `process.env` trực tiếp là chấp nhận được. Module có option phụ thuộc env (vd `I18nModule`) thì dùng bản `forRootAsync({ inject: [ConfigService], useFactory })` để đọc qua `getOrThrow()`, không đọc `process.env` trong `forRoot()` tĩnh.

**17.4 — TypeScript strict là bắt buộc.**

**Vì sao:** các rule về type (mục 4 — tách interface, mục 15 — không tự khai lại type có sẵn) chỉ có giá trị nếu compiler thật sự bắt được sai lệch. Cấu hình cũ (`noImplicitAny: false`, `strictBindCallApply: false`, cộng với `@typescript-eslint/no-explicit-any: 'off'` trong eslint) làm đúng phần ngược lại: type sai vẫn compile, `any` lan âm thầm, và những rule trên trở thành quy ước danh dự chứ không phải gate.

**Rule:** `tsconfig.json` bật `"strict": true`, kèm `"strictPropertyInitialization": false` — ngoại lệ duy nhất và bắt buộc, vì entity TypeORM và DTO khai field không initializer (`id: string;`) và được TypeORM/class-transformer gán lúc runtime; bật flag này sẽ báo lỗi giả ở toàn bộ entity/DTO. `noFallthroughCasesInSwitch` để `true`.

Phía eslint đi cùng hướng: `@typescript-eslint/no-explicit-any` và `no-unsafe-argument` để `'error'` (không `'off'`, không `'warn'`). Để `'warn'` là gây nhầm lẫn vì script đã có `--max-warnings=0` — warning vẫn fail build, nhưng đọc config lại tưởng là không.

**Kiểm chứng khi đổi:** `npx tsc -p tsconfig.json --noEmit --strict --strictPropertyInitialization false` và `npx eslint . --rule '{"@typescript-eslint/no-explicit-any":"error"}'` — codebase hiện tại pass với **0 lỗi** ở cả hai, nên không có lý do gì để nới các flag này. Nếu code mới làm nó fail, sửa code chứ không nới flag.

**17.5 — Bootstrap & lifecycle.**

**Rule:**

- Pipe/interceptor/filter toàn cục khai trong `common/bootstrap/configure-app.ts`, để `main.ts` và `test/utils/create-test-app.ts` dùng **cùng một** cấu hình (xem mục 2.1).
- `main.ts` phải gọi `app.enableShutdownHooks()`. Không có nó, Nest **không** chạy `OnModuleDestroy` khi process nhận SIGTERM/SIGINT — `RedisService.onModuleDestroy()` (`client.quit()`) sẽ không bao giờ được gọi trong production, connection Redis bị cắt cụt thay vì đóng sạch. E2E test không phát hiện được vì test tự gọi `app.close()`.
- Log dùng `Logger` của `@nestjs/common`, **không** `console.*` — kể cả trong `bootstrap().catch()`. `console` bỏ qua toàn bộ format/level/context của Nest logger, làm log production không đồng nhất và không thể tắt/route lại được.

---

## 18. Query Performance — Index theo cột sort, tránh vật chất hoá id list, tránh query lặp

**Bối cảnh:** Reviewer phát hiện 3 vấn đề trên PR4 (`articles`) bằng `EXPLAIN ANALYZE` với dữ liệu seed lớn (100k article, user có 70k favorite) — không phải lỗi logic, mà là code đúng khi dữ liệu nhỏ và vỡ dần khi dữ liệu lớn lên.

**18.1 — Index đúng cột dùng để `ORDER BY` trên mọi query list/feed.**

**Rule:** Cột nào xuất hiện trong `ORDER BY` của một query chạy trên **mọi** request list/feed (không phải filter tuỳ chọn) phải có index, kể cả khi migration đã có index cho các cột filter khác.

**Vì sao:** không có index cho `ORDER BY`, Postgres phải quét toàn bảng rồi sort mới lấy được N dòng đầu, bất kể `WHERE` match ít hay nhiều. Đo thật trên `articles` (100k dòng, trang 20 dòng đầu): thiếu index → `Seq Scan` + sort tốn 61,5ms/1.745 buffer; thêm `CREATE INDEX ... ("created_at" DESC, "id")` → còn 0,063ms/4 buffer, vì Postgres đọc index đúng thứ tự cần, không phải sort riêng.

**Áp dụng:** khi thêm bảng mới có endpoint list/feed sort theo 1 cột cố định (thường `created_at DESC`), thêm index cho cột đó ngay trong migration tạo bảng — không đợi đo mới thêm.

**18.2 — Không vật chất hoá id list vào app rồi bind `IN (...)` khi tập id đó không có cận trên cố định — dùng `EXISTS` trong SQL.**

**Sai:**

```typescript
const favoritedArticleIds = await this.favoritesService.getFavoritedArticleIds(
  favoritedBy.id,
); // không giới hạn, kéo hết id
query.andWhere('article.id IN (:...favoritedArticleIds)', {
  favoritedArticleIds: [...favoritedArticleIds],
});
```

**Vì sao:** kích thước id list ở đây tỉ lệ với dữ liệu của **user** (bao nhiêu bài đã favorite / đang follow), không tỉ lệ với kích thước trang kết quả — nên không có cận trên tự nhiên. Đo thật: user có 70.000 favorite → `GET /articles?favorited=...` trả `500 QueryFailedError: bind message has 4464 parameter formats but 0 parameters` (giao thức Postgres đếm tham số bằng số nguyên 16-bit, vượt 65.535 là tràn) — thông báo lỗi không gợi ý gì tới nguyên nhân thật. Hạ xuống 60.000 thì không lỗi nhưng mất 895ms/request (so với 18ms khi chỉ có 20 favorite), vì mỗi request đều kéo 60.000 dòng về Node rồi dựng lại câu SQL 60.000 tham số.

**Đúng:**

```typescript
query.andWhere(
  'EXISTS (SELECT 1 FROM article_favorites f WHERE f.article_id = article.id AND f.user_id = :favoritedById)',
  { favoritedById: favoritedBy.id },
);
```

**Áp dụng:** khi filter/feed dựa trên "user X có quan hệ gì với tập bản ghi Y" (favorite, follow, ...), viết `EXISTS (SELECT 1 FROM <join_table> ...)` ngay trong query builder thay vì gọi service khác lấy `Set<id>` rồi `IN (...)` — trừ khi tập id đó vốn đã bị giới hạn nhỏ và cố định (vd chỉ trong phạm vi id của 1 trang kết quả đã `LIMIT`, như `getFavoritesCountMap`/`getFavoritedArticleIds(userId, articleIds)` dùng khi compose response, khác với dùng để filter).

**18.3 — Không lặp lại một query mà kết quả đã được điều kiện filter phía trước đảm bảo sẵn.**

**Sai:** `feed()` lọc `article.authorId` theo tập đang follow, rồi bước compose response lại gọi `FollowsService.getFollowingIds()` lần nữa chỉ để tính field `author.following` — trong khi ở feed, **theo định nghĩa**, author nào cũng đang được follow.

**Đúng:** truyền thẳng flag/giá trị đã biết xuống bước compose response, không hỏi lại DB một sự thật mà tầng gọi trước đó vừa dùng để filter.

**Áp dụng:** trước khi thêm 1 query batch (`getXxxIds`) vào bước compose response, tự hỏi: điều kiện `WHERE`/filter của query chính có đang đảm bảo sẵn kết quả này cho **mọi** dòng trả về không? Nếu có, truyền thẳng giá trị đó xuống thay vì hỏi lại (xem `toListResponseDto(..., { allAuthorsFollowed: true })` trong `articles.service.ts`).

**18.4 — List endpoint trên bảng có thể tăng không giới hạn phải có pagination, hoặc ghi rõ lý do vì sao cố tình không có.**

**Rule:** trước khi thêm 1 list endpoint mới (hoặc method service trả về mảng không giới hạn), tự hỏi bảng nguồn có thể tăng không giới hạn theo thời gian/theo hành vi user không (khác với quan hệ 1-owner-vài-bản-ghi như attachment/avatar). Nếu có, endpoint phải nhận `limit`/`offset` — tái sử dụng `PaginationQueryDto` đã có ở `articles`, không tự chế lại. Nếu cố tình bỏ pagination vì lý do spec/UX, phải ghi rõ lý do bằng comment WHY ngay tại chỗ khai method (mục 13), không im lặng bỏ qua.

**Ví dụ đã sửa — `CommentsService.listByArticle()`:** ban đầu fetch **toàn bộ** comment của 1 article, không giới hạn, với lý do "khớp RealWorld spec gốc (comment không phân trang)" ghi lại bằng comment WHY tại chỗ. Mentor review PR5 (binhpt-3177) không chấp nhận lý do này — spec không phân trang không có nghĩa là bảng nguồn không thể tăng không giới hạn, và hình dạng lỗi giống hệt mục 18.2: một bài viral hàng chục nghìn comment vẫn kéo hết về 1 query. Đã sửa: nhận `PaginationQueryDto` (tái sử dụng từ `articles`, đúng theo rule dưới đây) và `skip`/`take` trong query, xoá comment WHY vì lý do đó không còn đúng nữa. Bài học: một quyết định "cố ý, có ghi lý do" trong code vẫn phải nhường khi review thật (không phải chỉ tự-review) chỉ ra lý do đó không đứng vững.

**Áp dụng:** khi thêm list endpoint mới, mặc định thêm `PaginationQueryDto`. Nếu quyết định không phân trang, dòng comment WHY tại chỗ khai method là bắt buộc, không phải tuỳ chọn.

**18.5 — Check tồn tại (exists) dùng `Repository.exists()`, không `findOne()` rồi so `!== null`.**

**Sai:**

```typescript
async isFavorited(userId: string, articleId: string): Promise<boolean> {
  const favorite = await this.favoritesRepository.findOne({ where: { userId, articleId } });
  return favorite !== null; // fetch nguyên row rồi vứt đi, chỉ cần biết có/không
}
```

**Đúng:**

```typescript
async isFavorited(userId: string, articleId: string): Promise<boolean> {
  return this.favoritesRepository.exists({ where: { userId, articleId } });
}
```

**Vì sao:** `findOne()` bắt TypeORM build lại toàn bộ entity từ row (mọi cột) chỉ để kiểm tra khác `null`. `exists()` (có sẵn từ TypeORM 0.3.x, repo đang dùng `^0.3.31`) sinh câu SQL gọn hơn, không cần hydrate entity — đúng việc cần làm là "có hàng nào khớp điều kiện không", không phải "lấy hàng đó về". Bug thật (không phải giả định): `FollowsService.isFollowing()` và `FavoritesService.isFavorited()` đều dùng `findOne()` kiểu này, trong khi `FavoritesService.countForArticle()` ngay cạnh đó lại đã dùng đúng pattern tương đương (`repository.count(...)`) — tức là một phần code trong cùng file đã biết cách làm đúng, phần còn lại thì chưa. 2 method này bị gọi rất thường xuyên: mỗi lần xem 1 article, mỗi lần follow/favorite đều gọi trước khi ghi.

**Áp dụng:** khi viết method chỉ trả `boolean` cho câu hỏi "bản ghi X có tồn tại không", dùng `repository.exists({ where })`, không `findOne()` + so `null`. `findOne()` chỉ dùng khi thực sự cần dữ liệu của row đó.

**18.6 — Tránh N+1: gom id của cả trang rồi hỏi DB một lần, không lặp qua từng item rồi query riêng.**

**Sai (N+1 — 20 article thành 21 query):**

```typescript
async toListResponseDto(articles: Article[]): Promise<ArticleResponseFields[]> {
  return Promise.all(
    articles.map(async (article) => {
      const favorited = await this.favoritesService.isFavorited(userId, article.id); // 1 query/article
      return ArticleResponseFields.fromEntity(article, { favorited /* ... */ });
    }),
  );
}
```

**Đúng (batch — hằng số query bất kể trang có bao nhiêu article):**

```typescript
const favoritedIds = await this.favoritesService.getFavoritedArticleIds(
  userId,
  articleIds,
); // 1 query cho cả trang
return articles.map((article) =>
  ArticleResponseFields.fromEntity(article, {
    favorited: favoritedIds.has(article.id) /* ... */,
  }),
);
```

**Vì sao:** đây là điểm reviewer đánh giá cao nhất trên PR4 ("Không có N+1 — đây là điểm đáng giá nhất của PR") — nhưng trước khi thêm mục này, cả `CODING_STANDARD.md` **không có chỗ nào ghi chữ "N+1"**, kỹ thuật làm đúng chỉ được nhắc thoáng qua trong ví dụ ở mục 18.3. Đo thật trên repo (20 article, 20 tác giả khác nhau, TypeORM query log): `GET /articles` ẩn danh 4 query, đã đăng nhập 7 query, `/feed` 8 query, `/:slug` 6 query — **hằng số**, không tăng theo số bài, nhờ `getFavoritesCountMap`/`getFavoritedArticleIds`/`getFollowingIds` gom id cả trang rồi hỏi một lần, trả `Map`/`Set` để tra O(1). Lặp qua từng item gọi `isFavorited()` riêng lẻ sẽ biến 20 bài thành 60+ query.

**Áp dụng:** bất kỳ chỗ nào ghép dữ liệu quan hệ (favorite/follow/comment-count...) cho **một danh sách** bản ghi, viết method dạng `getXxxIds(ownerIds, targetIds?)`/`getXxxCountMap(targetIds)` trả `Set`/`Map`, gọi đúng 1 lần cho cả trang trước khi map qua từng item — không gọi lại 1 method dành cho single-item (`isFollowing`, `isFavorited`...) bên trong `.map()`/vòng lặp.

**18.7 — Connection pool và statement timeout phải được khai tường minh, không im lặng dựa vào default của driver.**

**Rule:** `DataSourceOptions.extra` phải khai rõ `max` (pool size) và `statement_timeout` (ms), thay vì để trống và dựa vào default của `pg.Pool`.

**Vì sao:** trước khi thêm rule này, `src/config/typeorm.config.ts` hoàn toàn không có `extra` — nghĩa là chạy 100% theo default ngầm của driver `pg`: pool tối đa 10 connection, và **không có statement timeout nào cả**. Không có statement timeout là rủi ro thật: 1 câu query treo/chạy runaway (bug logic, hoặc query bị khoá do lock chờ) sẽ giữ nguyên 1 connection trong pool vô thời hạn, dần dần rút cạn pool cho tới khi request khác không lấy được connection nữa — mà không có gì báo lỗi rõ ràng tại thời điểm đó.

**Áp dụng:** `extra: { max: 10, statement_timeout: 10_000 }` trong `buildDataSourceOptions()` cho **app runtime** — `max` giữ nguyên giá trị default (không đổi hành vi, chỉ khai tường minh để đây là quyết định có chủ đích), `statement_timeout` 10s đủ dư cho mọi query hiện tại của app (lookup đơn/list phân trang) nhưng chặn được query treo vô hạn.

**Không áp timeout này cho migration runner.** `buildDataSourceOptions()` nhận tham số thứ 2 `{ forMigrations?: boolean }` — `data-source.ts`/`data-source.test.ts` (dùng cho `migration:run`/`migration:run:test`, chạy 1 lần qua CLI, không phải pool phục vụ request liên tục) truyền `{ forMigrations: true }` để bỏ hẳn `extra`, không kế thừa `statement_timeout: 10_000` của app runtime. Lý do: rule này ban đầu dùng chung 1 `extra` cho cả 2 loại DataSource — nếu sau này có 1 migration hợp lệ chạy lâu hơn 10s (vd backfill 1 cột NOT NULL trên bảng đã có nhiều dữ liệu, tạo index không dùng `CONCURRENTLY`), Postgres sẽ tự huỷ giữa chừng với lỗi `canceling statement due to statement timeout`, làm hỏng `migration:run` mà không liên quan gì tới rule này đang bảo vệ app khỏi query treo. Nếu 1 migration thật sự cần chạy lâu, thêm `statement_timeout` riêng ngay trong file migration đó (`SET statement_timeout = 0` hoặc giá trị cụ thể) thay vì nới rule chung.

**18.8 — Sau khi `save()`/`insert()`, không query lại dữ liệu đã có sẵn trong tay chỉ để dựng response.**

**Sai:** `CommentsService.create()` insert xong rồi gọi lại `findByIdOrThrow(comment.id)` — thêm 2 query (`SELECT DISTINCT` + `SELECT ... JOIN author`) chỉ để nạp lại quan hệ `author`, trong khi `author` chính là `User` đang gọi request (đã có sẵn từ `@CurrentUser()`/guard, không cần hỏi lại DB).

**Đúng:**

```typescript
async create(articleId: string, author: User, data: CreateCommentData): Promise<Comment> {
  const comment = this.commentsRepository.create({ body: data.body, articleId, authorId: author.id });
  await this.commentsRepository.save(comment);
  comment.author = author; // đã có sẵn, không re-fetch
  return comment;
}
```

**Vì sao:** Mentor review PR5 (binhpt-3177) đo bằng query log: `POST /comments` tốn 9 query, trong đó riêng cặp re-fetch này chiếm 2 query oan — không phải do TypeORM bắt buộc, mà do code tự đi hỏi lại một sự thật đã biết.

**18.9 — Không tự query lại một quan hệ mà điều kiện đã biết trước kết quả (self-relationship).**

**Sai:** `CommentsService.toResponseDto()` gọi `followsService.isFollowing(currentUserId, comment.authorId)` vô điều kiện mỗi khi có `currentUserId` — kể cả khi `currentUserId === comment.authorId` (tác giả tự xem comment của chính mình). Một user không bao giờ follow được chính mình (`FollowsService.follow()` chặn bằng `ConflictException`), nên kết quả **luôn** là `false`, tốn 1 query để hỏi một câu đã biết sẵn câu trả lời.

**Đúng:**

```typescript
const authorFollowing =
  currentUserId && currentUserId !== comment.authorId
    ? await this.followsService.isFollowing(currentUserId, comment.authorId)
    : false;
```

**Vì sao:** cùng một mentor review, cùng phép đo — đây là query thứ 9/9 trong log ban đầu (`SELECT follows ← isFollowing(me, me)`). Sau 2 fix ở mục 18.8 và mục này, `POST /comments` còn đúng 6 query (đo lại bằng cách gắn `DataSource.logger` tuỳ chỉnh trong e2e test, xem cách đo ở PR review reply).

**Áp dụng chung cho 18.8/18.9:** trước khi thêm 1 query (re-fetch hoặc gọi service khác) ngay sau một thao tác ghi hoặc trong bước dựng response, tự hỏi: dữ liệu này có **chắc chắn** đã nằm trong tay (tham số đầu vào, kết quả của bước trước) hoặc **suy ra được** từ một bất biến đã biết (không thể tự follow chính mình) không? Nếu có, dùng thẳng, không hỏi lại DB.

**Cùng pattern áp dụng luôn cho `ArticlesService` (không đợi review riêng mới sửa):** rà lại thấy `articles` có đúng 2 chỗ hình dạng giống hệt — `create()` cũng `save()` xong `findBySlugOrThrow()` lại chỉ để nạp `author` (đã có sẵn từ `@CurrentUser()`, sửa giống mục 18.8), và `toResponseDto()` cũng gọi `isFollowing(currentUserId, article.authorId)` vô điều kiện, tự hỏi self-follow khi tác giả xem/sửa bài viết của chính mình (sửa giống mục 18.9). Thêm 1 trường hợp mới không có ở comments: `favorite()`/`unfavorite()` gọi `toResponseDto()` ngay sau khi favorite/unfavorite thành công, nhưng `toResponseDto()` lại tự hỏi lại `isFavorited()` — trong khi kết quả **chắc chắn** đã biết (favorite thành công → `favorited: true`, unfavorite thành công → `favorited: false`). Vì `toResponseDto()` dùng chung cho nhiều endpoint (create/get/update/favorite/unfavorite) nên không thể đổi mặc định — thêm tham số `options?: { knownFavorited?: boolean }` (cùng khuôn với `toListResponseDto`'s `allAuthorsFollowed` ở mục 18.3), chỉ 2 call site `favorite`/`unfavorite` truyền vào, các call site còn lại vẫn query như cũ.

**Áp dụng mở rộng:** khi 1 method dựng response được gọi ngay sau 1 thao tác ghi mà chính thao tác đó đã xác định chắc chắn 1 trong các field của response (favorited sau favorite/unfavorite, following sau follow/unfollow...), truyền field đó xuống qua tham số `options` thay vì để method dựng response tự hỏi lại — đừng chỉ sửa đúng chỗ reviewer chỉ ra, tìm luôn những chỗ cùng hình dạng trong các module khác.

---

## 19. Swagger — Endpoint mới phải khai `@ApiOperation` + `@ApiResponse` cho lỗi

**Rule:** Mọi route handler mới (hoặc route đổi hành vi lỗi) phải có `@ApiOperation({ summary: ... })` mô tả ngắn gọn hành động, và `@ApiResponse` cho **từng** status code lỗi mà route thực sự có thể trả (401/403/404/409...), không chỉ dựa vào `@ApiProperty` trên DTO thành công.

**Vì sao:** hiện tại (soát tới hết PR6) **không có route nào** trong `src/modules/**` khai `@ApiOperation`/`@ApiResponse` — Swagger UI chỉ tự suy ra được response 200 từ DTO trả về (`@ApiProperty`) và path/param, còn toàn bộ case lỗi (vd `409 ConflictException` khi slug trùng, `403 ForbiddenException` khi không phải author, `404` khi không tìm thấy resource) hoàn toàn không xuất hiện trong docs — người đọc Swagger không biết endpoint có thể fail thế nào mà không phải đọc thẳng source code.

**Sai (không có gì ngoài path/param):**

```typescript
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Post(':slug/favorite')
async favorite(
  @Param('slug') slug: string,
  @CurrentUser() currentUser: User,
): Promise<ArticleResponseDto> {
  return this.articlesService.toResponseDto(
    await this.articlesService.favorite(slug, currentUser.id),
    currentUser.id,
  );
}
```

**Đúng:**

```typescript
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@ApiOperation({ summary: 'Favorite an article' })
@ApiResponse({ status: 401, description: 'Missing or invalid token' })
@ApiResponse({ status: 404, description: 'Article not found' })
@Post(':slug/favorite')
async favorite(
  @Param('slug') slug: string,
  @CurrentUser() currentUser: User,
): Promise<ArticleResponseDto> {
  return this.articlesService.toResponseDto(
    await this.articlesService.favorite(slug, currentUser.id),
    currentUser.id,
  );
}
```

**Áp dụng:** khi thêm route mới, liệt kê trước các exception mà service phía dưới thực sự throw (đọc thẳng service, không đoán), rồi khai đúng từng `@ApiResponse`. Route hiện có trong repo (từ PR1-PR6) phần lớn **chưa** được retrofit theo rule này — áp dụng dần khi route đó được sửa/chạm tới, không cần làm 1 lượt riêng. `CommentsController` (`create`/`list`/`delete`) là ví dụ retrofit đầu tiên, làm ngay khi `list()` bị sửa (thêm pagination) trong PR6 — đúng tinh thần "sửa tới đâu, khai tới đó" của rule này.

---

## 20. Test Coverage Threshold

**Rule:** `package.json`'s `jest.coverageThreshold.global` đặt sàn tối thiểu cho `npm run test:cov` (statements 70 / branches 65 / functions 60 / lines 70). `ci.yml` chạy `npm run test:cov` (không phải `npm test` trơn) nên ngưỡng này **thật sự chặn CI**, không chỉ là con số tham khảo.

**Vì sao:** con số này lấy từ coverage đo thật của repo tại thời điểm thêm rule (statements 74.1% / branches 71.04% / functions 66.24% / lines 74.88%), hạ xuống một khoảng an toàn để làm **sàn chống tụt**, không phải mục tiêu để cố đạt. Coverage tổng thấp hơn 100% là **có chủ đích** theo mục 11 ("không viết test cho code chỉ gọi lại thư viện") — file `*.module.ts` (chỉ khai DI wiring), entity (chỉ field + decorator, không logic — `collectCoverageFrom` đã thêm `!**/*.entity.ts` từ PR04 cùng lý do với `.module.ts`/`.dto.ts`/`.constants.ts`), `redis.service.ts` (wrapper mỏng qua `ioredis`) đều gần như không có gì để test nên kéo % tổng xuống một cách hợp lý. Threshold ở đây tồn tại để bắt **tụt coverage bất ngờ** (thêm logic mới có nhánh lỗi mà quên viết test), không phải để ép coverage cao giả tạo bằng cách test lại thư viện.

**Áp dụng:** nếu thêm code có nhiều logic mới (branch/condition thật) mà không kèm test, `npm run test:cov` sẽ fail cục bộ trước khi push. Không hạ threshold để né lỗi này — thêm test cho nhánh còn thiếu. Chỉ hạ threshold khi có lý do kiến trúc thật (vd thêm hẳn 1 module chỉ toàn DI wiring không có logic) và phải ghi lại lý do ngay tại chỗ sửa, tương tự mục 14.

---

## 21. Field free-text phải có `@MaxLength`

**Rule:** Mọi field kiểu `string` nhận nội dung tự do từ client (title, description, body, comment...) phải có `@MaxLength` bên cạnh `@MinLength`/`@IsString`, giá trị lấy từ constant trong `constants/` của module — không hardcode số trong decorator.

**Vì sao:** trước khi thêm rule này, `title`/`description`/`body` của article và `body` của comment chỉ có `@MinLength(1)`, không có cận trên nào — validation layer chấp nhận request tuỳ ý dài. Không có gì "vỡ ngay" như mục 18 (Express body-parser mặc định đã chặn ở ~100kb/request), nhưng đây là dạng "chưa ai quyết định tường minh" giống hệt mục 18.7 trước khi fix: không ai chọn 1 giới hạn cụ thể, index/storage cứ lớn dần theo dữ liệu người dùng tự nhập mà không kiểm soát được.

**Áp dụng:** `MAX_TITLE_LENGTH`/`MAX_DESCRIPTION_LENGTH`/`MAX_BODY_LENGTH` (`articles.constants.ts`), `MAX_BODY_LENGTH` (`comments.constants.ts`) — mỗi module tự định nghĩa hằng số riêng theo đúng mục 12 (constant thuộc domain nào nằm trong `constants/` của module đó), không dùng chung 1 hằng số toàn cục cho mọi loại field.

**`@MinLength(1)` không chặn được chuỗi toàn khoảng trắng.** Mentor review PR5 (binhpt-3177) chỉ ra: `"   "` (toàn dấu cách) có `length` là 3, vượt qua `@MinLength(1)` dù về nội dung thực chất là rỗng. Đã sửa `CreateCommentDto.body` bằng `@Matches(/\S/, {...})` thay cho `@MinLength(1)` — `\S` đòi hỏi ít nhất 1 ký tự không-phải-khoảng-trắng ở bất kỳ đâu trong chuỗi, chặn được cả `""` lẫn chuỗi toàn dấu cách/tab/xuống dòng mà không cần 2 decorator chồng nhau (lưu ý: không chặn được ký tự Unicode không-in-được nhưng cũng không khớp `\S`, vd zero-width space `U+200B` — lỗ hổng này đã tồn tại từ trước với `@MinLength(1)`, không phải regression mới). Rà lại thấy `CreateArticleDto`/`UpdateArticleDto` (`title`/`description`/`body`) có cùng lỗ hổng — đã sửa đồng loạt sang `@Matches(/\S/, {...})`, không đợi review riêng.

**Áp dụng:** field free-text nào chỉ có `@MinLength(1)` để chặn "không được rỗng" (title/description/body/comment...) phải dùng `@Matches(/\S/, {...})` thay vì `@MinLength(1)` để chặn luôn trường hợp toàn khoảng trắng — áp dụng cho **mọi** field free-text trong repo, không chỉ chỗ reviewer vừa chỉ ra. Bộ ba `@IsString`/`@Matches(/\S/, ...)`/`@MaxLength` được gom vào 1 decorator dùng chung `IsNonBlankString(maxLength, messageKeys)` (`src/common/decorators/is-non-blank-string.decorator.ts`) thay vì lặp lại ở từng field — field mới chỉ cần `@IsNonBlankString(MAX_X_LENGTH, { minLength: '...', maxLength: '...' })`.

---

## 22. Row Locking — Transaction Đơn Thuần Không Đủ Khi Nhiều Request Đua Trên Cùng Một Row

**Rule:** `dataSource.transaction()` (mục 6) chỉ đảm bảo atomic (tất cả hoặc không gì) — KHÔNG tự động chặn 2 transaction đồng thời cùng đọc rồi cùng ghi lên 1 row (lost update) ở mức isolation mặc định READ COMMITTED của Postgres. Khi nghiệp vụ có dạng "đọc giá trị hiện tại → tính toán → ghi lại" trên MỘT row mà nhiều request có thể chạm cùng lúc (trừ tồn kho khi checkout, chuyển trạng thái đơn, mở conversation OPEN...), phải chọn một trong hai cách, không chỉ bọc transaction rồi coi là xong:

1. **Atomic UPDATE có điều kiện, đọc affected rows** — ưu tiên khi diễn đạt được bằng 1 câu UPDATE: `UPDATE products SET stock = stock - :qty WHERE id = :id AND stock >= :qty`, rồi kiểm số dòng bị ảnh hưởng để biết hết hàng hay thua race — không cần lock tường minh.
2. **Pessimistic lock tường minh** khi logic phức tạp hơn 1 UPDATE (phải đọc, rẽ nhánh, rồi mới ghi nhiều bảng) — dùng `manager.findOne(Entity, { where, lock: { mode: 'pessimistic_write' } })` để khóa row tới khi transaction commit/rollback; transaction khác đọc cùng row bằng `pessimistic_write` phải đợi.

**Sai (có transaction nhưng vẫn race vì không lock):**

```typescript
return this.dataSource.transaction(async (manager) => {
  const product = await manager.findOne(Product, { where: { id: productId } });
  if (product.stock < quantity) throw new ConflictException('out of stock');
  product.stock -= quantity;
  await manager.save(product); // 2 request đọc cùng stock=1 trước khi request nào kịp ghi → cả 2 pass check, cả 2 đều trừ được
});
```

**Đúng:**

```typescript
return this.dataSource.transaction(async (manager) => {
  const product = await manager.findOne(Product, {
    where: { id: productId },
    lock: { mode: 'pessimistic_write' },
  });
  if (product.stock < quantity) throw new ConflictException('out of stock');
  product.stock -= quantity;
  await manager.save(product);
});
```

**Áp dụng:** checkout (ORDER-01, trừ tồn — "stock=1 chỉ một buyer thắng"), chuyển trạng thái đơn (ORDER-07, admin confirm/reject đua với customer cancel), mở conversation OPEN (CHAT-01 — partial unique index chỉ bắt lỗi ở COMMIT, muốn trả lời "đã có conversation đang mở" ngay thay vì để lỗi 23505 lọt ra thì vẫn cần lock hoặc catch đúng lỗi unique). Viết e2e mô phỏng đúng race bằng `Promise.all([request1, request2])` nhắm cùng 1 row, assert chỉ một request thắng — không chỉ test tuần tự từng request một.

---

## 23. Idempotency-Key — Pattern Dùng Chung Cho Checkout Và Chat

**Bối cảnh:** Cả `POST /orders` (ORDER-01) và `POST /chat/.../messages` (CHAT-04) đều nhận header `Idempotency-Key` cộng cột `request_hash` để chặn retry tạo trùng — cùng một pattern, khác bảng. Nếu mỗi module tự viết lại logic "so key, so hash, quyết định replay hay conflict", dễ lệch nhau âm thầm (vi phạm mục 15 — không tự định nghĩa lại khái niệm đã có).

**Rule:** Trước khi PR12 (checkout) và PR15 (chat) cùng cần logic này, tách helper dùng chung trong `common/utils/` (vd `idempotency.util.ts`) với tối thiểu:

- `canonicalizeForHash(payload: unknown): string` — chuẩn hoá object thành chuỗi ổn định (key sort) trước khi hash, để cùng nội dung logic luôn ra cùng hash bất kể client gửi field theo thứ tự nào.
- Tái sử dụng `sha256HexCheck()` (`common/utils/sha256-hex-check.util.ts`) ở entity, và một hàm hash tương ứng (vd Node `crypto.createHash('sha256')`) ở service.

Logic quyết định "cùng key + cùng hash → trả lại kết quả cũ; cùng key + khác hash → 409" vẫn nằm trong service của từng module (vì "kết quả cũ" khác nhau giữa order và chat message), chỉ phần canonicalize + hash dùng chung.

**Áp dụng:** khi bắt đầu PR12/PR15, kiểm tra `common/utils/idempotency.util.ts` đã có chưa trước khi viết hàm hash riêng trong service.

---

## 24. WebSocket Gateway — Cùng Nguyên Tắc Mỏng Như Controller

**Rule:** Gateway (`@WebSocketGateway()`, dùng cho CHAT-07) áp dụng đúng nguyên tắc mục 3 (Controller chỉ là tầng định tuyến): handler chỉ xác thực handshake, kiểm quyền join room, gọi service, và emit — không tự query DB hay xử lý điều kiện nghiệp vụ. Business logic (lưu message, cập nhật `last_message_at`, quyết định ai được join room nào) nằm trong `ChatService`; gateway gọi lại y như controller gọi service.

**Vì sao:** gateway dễ bị viết business logic trực tiếp vì không có sẵn "cảm giác tầng routing" rõ như HTTP controller — nếu để logic trong gateway, REST và WebSocket sẽ có 2 nơi cùng chứa 1 phần nghiệp vụ, dễ lệch hành vi khi sau này có endpoint REST đọc lại dữ liệu đã publish qua WS.

**Áp dụng:** khi viết `ChatGateway` ở PR15, handler `handleMessage()` chỉ validate DTO → gọi `chatService.sendMessage(...)` → emit kết quả; không tự `chatMessageRepository.save()` trong gateway.

---

## 25. Scheduled Job (`@nestjs/schedule`) — Idempotent, Không Chồng Lấn, Timeout Riêng

**Bối cảnh:** SYS-01 (dispatch mỗi phút) và SYS-04 (báo cáo doanh thu 00:10 đầu tháng) đều dùng `@Cron()`.

**Rule:**

- Handler `@Cron()` phải tự an toàn khi bị gọi 2 lần chồng nhau (lần trước chưa xong mà lần sau đã tới, vd query chậm) — dùng cờ `isRunning` trong service, hoặc advisory lock Postgres (`pg_try_advisory_lock`) nếu chạy nhiều instance app cùng lúc; không giả định "chỉ có 1 instance nên không cần lo".
- Không log lỗi bằng `console.*` trong handler cron — mục 17.5 áp dụng y hệt cho code chạy nền, không chỉ code trong request.
- Job phải tự giới hạn batch (SYS-01 đã ghi rõ "tối đa 50" trong `api-requirements.csv`) — không query toàn bộ PENDING rồi xử lý hết 1 lần, tránh 1 lần chạy quá lâu chồng vào lần chạy kế tiếp.

**Áp dụng:** khi viết `NotificationDispatcherService`/`MonthlyReportService` ở PR05/PR16, thêm test cho "gọi handler 2 lần gần nhau, lần 2 không xử lý trùng dữ liệu lần 1 đang xử lý".

---

## 26. Tiền VND — Chuỗi Số, Validate Cận Trước Khi Tính, Không Dùng `parseFloat`

**Bối cảnh:** `database.md` mục 2 quy định `price_vnd`/`total_vnd` lưu `numeric(14,0)`, API trả **chuỗi** (vd `"250000"`) vì driver Postgres trả numeric dạng string để tránh mất độ chính xác khi ép qua JS `number`.

**Rule:**

- DTO nhận trường tiền dạng `string`, validate bằng `@Matches(/^\d+$/)` (chỉ chữ số) cộng kiểm cận nghiệp vụ (`1..1_000_000_000` cho đơn giá, `1..1_980_000_000_000` cho tổng đơn — đúng `MIN/MAX_PRODUCT_PRICE_VND`, `MIN/MAX_ORDER_TOTAL_VND` đã có ở `constants/` của `products`/`orders`) **trước khi** chuyển sang `Number` để tính.
- Không dùng `parseFloat()`/`Number()` trực tiếp lên input chưa validate cận — chuỗi dài (vd 20 chữ số) ép qua `Number` mất độ chính xác âm thầm, không throw lỗi nào báo.
- Phép tính tổng đơn (`line_total = unit_price * quantity`, `order.total = Σ line_total`) an toàn bằng `Number` thường **chỉ vì** đã kiểm cận trước (`1_980_000_000_000 < Number.MAX_SAFE_INTEGER`) — nếu sau này mở cận (vd đơn hàng B2B lớn hơn), phải đổi sang `BigInt`/thư viện decimal, không tự tin giữ nguyên `Number`.

**Áp dụng:** khi viết `CreateOrderDto`/`ProductPatchRequest`/tương tự có field tiền, theo đúng thứ tự: validate string bằng regex → parse `Number` sau khi qua cận → tính toán → serialize lại thành string khi trả response.

---

## 27. Checklist trước khi tạo PR

- [ ] Controller không chứa business logic — chỉ gọi service. Kể cả dựng response DTO (`XxxResponseDto.fromEntity()`) cũng phải nằm trong service, không gọi thẳng từ controller (mục 3).
- [ ] Mỗi module đúng 1 domain, không lẫn nghiệp vụ khác; không có import vòng giữa module (mục 10).
- [ ] `{feature}.controller.ts`/`.service.ts`/`.module.ts` phẳng ở root module; `dto/`, `entities/`, `guards/`, `constants/`, `interfaces/`... đúng subfolder theo vai trò (mục 2.2).
- [ ] File mới đặt đúng tầng: dùng chung → `common/` (helper hậu tố `.util.ts`), infra → `src/{infra}/`, nghiệp vụ → `src/modules/{feature}/` (mục 2.1). `common/` không import giá trị từ `modules/` — nếu cần shape thì `import type` (mục 10).
- [ ] Pipe/filter/interceptor toàn cục thêm vào `configure-app.ts`, không thêm riêng ở `main.ts` (mục 17.5) — nếu không, e2e chạy thiếu và test xanh giả.
- [ ] Không còn inline object type lặp lại — đã tách `interface`.
- [ ] Không tự định nghĩa lại type/constant mà thư viện hoặc codebase đã có sẵn; env var đã có trong Joi schema thì đọc qua `ConfigService.getOrThrow()`, không tự default lại (mục 15).
- [ ] Có transaction cho thao tác ghi nhiều bảng — **và mọi Repository call bên trong callback thực sự dùng `manager` được truyền vào**, không phải Repository inject mặc định (mục 6). Nếu transaction gọi sang service khác, method đó phải nhận `manager?: EntityManager` và dùng nó.
- [ ] Guard input rỗng trước khi update DB.
- [ ] Bắt lỗi unique violation → trả `ConflictException` với message đúng field (dùng chung `isUniqueViolation()`/`getViolatedConstraint()` ở `common/utils`, không tự viết lại check `error.driverError.code`).
- [ ] Upload file có `fileFilter` allow-list MIME type.
- [ ] Guard auth-optional (override `handleRequest`) chỉ fail-open khi không có lỗi; có lỗi thật (token revoke, strategy throw...) phải rethrow (mục 16).
- [ ] Response thành công đi qua `XxxResponseDto.fromEntity()`, đúng envelope (mục 9); filter lỗi vẫn là catch-all `@Catch()` để lỗi non-HTTP cũng trả đúng envelope (mục 9).
- [ ] Có unit test cho happy path + lỗi validate + edge case rỗng/null (mục 11).
- [ ] Có e2e test nếu flow xuyên ≥2 module hoặc phụ thuộc DB constraint/transaction thật (mục 11).
- [ ] Env var đọc qua `ConfigService.getOrThrow()`, trừ `registerAs()` factory và `data-source.ts` (mục 17.3); không dùng `get()` + `!`.
- [ ] `git ls-files --eol | grep w/crlf` rỗng — working tree sạch LF (mục 17.1).
- [ ] `tsconfig.json` vẫn `strict: true`; không nới flag để code mới compile (mục 17.4).
- [ ] Nếu vừa thêm file `.ts` mới ở repo root hoặc sửa `tsconfig.build.json`/`nest-cli.json`: chạy thật `npm run build && npm run start:prod` rồi curl thử 1 endpoint — `build` xanh và `test:e2e` xanh không chứng minh app boot được từ `dist/` (mục 17.6).
- [ ] Chạy `npm run lint:sunlint` — 0 errors; warning mới phát sinh phải được review, warning đã biết xem mục 14. Đây là gate cục bộ, CI không chạy được (mục 14). **Đính kèm ảnh chụp kết quả sạch (0 errors) vào PR** trước khi gửi review — bắt buộc theo yêu cầu của mentor, không chỉ chạy xong là đủ.
- [ ] Chạy `npm run lint:check` và `npm run format:check` (bản không `--fix`/`--write`, phủ **cả repo** chứ không chỉ `src`/`test`) — đây là bản CI thật sự chạy, không phải `lint`/`format` (mục 17.2).
- [ ] Chạy `npm run build`, `npm run test:cov`, và `npm run test:e2e` — cả 3 đều pass; `test:cov` không được thấp hơn `coverageThreshold` (mục 20).
- [ ] Query list/feed chạy trên mọi request có index cho cột `ORDER BY` (mục 18.1).
- [ ] Filter/feed theo quan hệ user↔bản ghi (favorite, follow...) dùng `EXISTS` trong SQL, không kéo id list vào app rồi `IN (...)` khi tập đó không có cận trên cố định (mục 18.2).
- [ ] Không có query nào hỏi lại một sự thật mà điều kiện filter/where của bước trước đã đảm bảo sẵn (mục 18.3).
- [ ] List endpoint mới trên bảng có thể tăng không giới hạn có `limit`/`offset` (`PaginationQueryDto`), hoặc có comment WHY giải thích rõ vì sao cố tình không phân trang (mục 18.4).
- [ ] Method chỉ trả `boolean` cho câu hỏi tồn tại dùng `repository.exists()`, không `findOne()` + so `null` (mục 18.5).
- [ ] Ghép dữ liệu quan hệ cho 1 danh sách bản ghi dùng batch `getXxxIds`/`getXxxCountMap` gọi 1 lần, không lặp gọi method single-item bên trong vòng lặp/`.map()` (mục 18.6).
- [ ] `DataSourceOptions.extra` có khai `max`/`statement_timeout` tường minh, không để trống dựa vào default driver (mục 18.7).
- [ ] Field free-text (title/description/body/comment...) có `@MaxLength` lấy từ constant của module; dùng `@Matches(/\S/, ...)` thay vì `@MinLength(1)` để chặn cả chuỗi toàn khoảng trắng (mục 21).
- [ ] Sau `save()`/`insert()`, không re-fetch dữ liệu đã có sẵn trong tay chỉ để dựng response; không tự query lại một quan hệ mà điều kiện đã biết trước kết quả (vd self-follow) (mục 18.8, 18.9).
- [ ] Thêm/sửa key i18n thì sửa **cả** `en/` và `vi/` — chạy `npm test` (bao gồm `i18n-key-parity.spec.ts`) để tự xác nhận không lệch key (mục 11).
- [ ] Route mới hoặc route đổi hành vi lỗi có `@ApiOperation` + `@ApiResponse` cho từng status lỗi thực sự có thể trả (mục 19).
- [ ] Enum/type mới không tự động đặt trong entity của module sở hữu cột DB — đã tự hỏi có module khác không liên quan trực tiếp cần dùng giá trị này ở runtime không; nếu có, đặt ở `common/enums/` (mục 10).
- [ ] Thao tác "đọc rồi ghi lại" trên 1 row có thể bị nhiều request chạm cùng lúc (trừ tồn, đổi trạng thái, mở conversation) dùng atomic UPDATE có điều kiện hoặc `pessimistic_write` lock — không chỉ bọc `dataSource.transaction()` rồi coi là đủ (mục 22).
- [ ] Logic Idempotency-Key mới (checkout/chat) tái sử dụng helper hash/canonicalize dùng chung, không viết lại từ đầu (mục 23).
- [ ] Handler WebSocket gateway không tự query DB/xử lý nghiệp vụ — chỉ gọi service, cùng nguyên tắc controller mỏng (mục 24).
- [ ] Handler `@Cron()` mới tự chống chạy chồng lấn (`isRunning`/advisory lock) và có giới hạn batch tường minh (mục 25).
- [ ] Field tiền (VND) nhận dạng `string` đã validate cận trước khi ép `Number` để tính, không dùng `parseFloat` trực tiếp lên input chưa kiểm (mục 26).
