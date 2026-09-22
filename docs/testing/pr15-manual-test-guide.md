# PR15 — Hướng dẫn test thủ công bằng Swagger UI (REST) + Postman (WebSocket/Socket.IO) (bằng chứng cho reviewer)

Test end-to-end thật trên môi trường local (không mock): app + Postgres qua `docker-compose`. Phần
REST (mở/xem conversation, gửi/xem tin nhắn, admin inbox/assign/status) thao tác qua Swagger UI
(`http://localhost:3001/api-docs`). Phần WebSocket (namespace `/chat`, CHAT-07) không demo được bằng
Swagger UI nên dùng **Postman Socket.IO request** (Postman ≥ v10.13 hỗ trợ sẵn protocol Socket.IO,
không phải raw WebSocket — dùng đúng loại request "Socket.IO", chọn "WebSocket" thường sẽ không bắt
tay đúng vì server dùng thư viện `socket.io`). PR15 không phát sinh email nào nên không cần mở
Mailpit.

Phạm vi: `POST /chat/conversations`, `GET /chat/conversations/me`, `GET
/chat/conversations/:id/messages`, `POST /chat/conversations/:id/messages` (CHAT-01..04); `GET
/admin/chat/conversations`, `PATCH /admin/chat/conversations/:id` (CHAT-05/06); WebSocket namespace
`/chat` — event `conversation.join` (client→server, có ack) và `chat.message.created`
(server→client) (CHAT-07).

## 0. Chuẩn bị

1. `docker compose up -d` (nếu chưa chạy) — kiểm tra container `postgres` `healthy`: `docker ps`.
2. Có file `.env` ở root repo (copy từ `.env.example`, điền `JWT_SECRET`/`NOTIFICATION_SECRET_KEY`
   như PR06). PR15 có 1 migration mới (`AddChatMessageRequestHashCheck`) — chạy `npm run
migration:run` trước khi seed.
3. `npm run seed -- --profile=demo` — tạo/giữ nguyên (idempotent) 1 admin (`admin@mini-shop.example.com`)
   và 2 customer (`customer1@mini-shop.example.com`, `customer2@mini-shop.example.com`), cùng mật
   khẩu demo `Demo@12345`. Seed chỉ có **đúng 1 admin** — mục 6 dùng chính admin này làm người được
   assign (self-assign), không cần tạo thêm admin thứ hai.
4. `npm run start:dev` — app chạy ở `http://localhost:3001`.
5. Mở Swagger UI: `http://localhost:3001/api-docs`.
6. Mở Postman, tạo sẵn 1 request kiểu **Socket.IO** (New → Socket.IO Request) với URL
   `http://localhost:3001` và namespace/path `/chat` — chưa Connect vội, cấu hình auth ở mục 7.

**Ghi hình/chụp:** bắt đầu quay từ bước `docker ps`.

**Cách gắn JWT vào Swagger UI:** bấm **Authorize** (biểu tượng ổ khoá) → dán **chỉ raw JWT** (không
thêm chữ `Bearer`) vào ô `Value` → **Authorize** → **Close**. Đổi JWT thì **Authorize** → **Logout**
→ dán JWT mới → **Authorize** lại. Test case "không có token" thì **Authorize** → **Logout** (không
dán gì) trước khi gọi endpoint đó.

## 1. Đăng nhập — lấy JWT_ADMIN, JWT_CUSTOMER1, JWT_CUSTOMER2

`POST /auth/login` với `{ "email": "admin@mini-shop.example.com", "password": "Demo@12345" }`.
**Kỳ vọng:** `200`. **Copy JWT** → **JWT_ADMIN**. **Copy `user.id`** → **ADMIN_ID**.

`POST /auth/login` với `{ "email": "customer1@mini-shop.example.com", "password": "Demo@12345" }`.
**Kỳ vọng:** `200`. **Copy JWT** → **JWT_CUSTOMER1**. **Copy `user.id`** → **CUSTOMER1_ID**.

`POST /auth/login` với `{ "email": "customer2@mini-shop.example.com", "password": "Demo@12345" }`.
**Kỳ vọng:** `200`. **Copy JWT** → **JWT_CUSTOMER2**.

Authorize Swagger bằng **JWT_CUSTOMER1** cho mục 2-4 bên dưới.

## 2. Mở / xem conversation của tôi — `POST /chat/conversations`, `GET /chat/conversations/me`

### 2a. Test edge trước — chưa từng mở lần nào (404)

`GET /chat/conversations/me`. **Kỳ vọng:** `404` — customer1 chưa mở conversation nào.

### Happy path — mở conversation mới

`POST /chat/conversations` (không cần body). **Kỳ vọng:** `201`, `conversation.status = "OPEN"`,
`conversation.assignedAdmin = null`. **Copy `conversation.id`** → **CONV1_ID**.

`GET /chat/conversations/me`. **Kỳ vọng:** `200`, `conversation.id = CONV1_ID`.

### 2b. Test edge — gọi lại `POST` trả về đúng conversation đang mở (không tạo mới)

`POST /chat/conversations` lần nữa. **Kỳ vọng:** `200` (không phải `201`), `conversation.id =
CONV1_ID`.

### 2c. Test edge — RBAC/không token

Authorize JWT_ADMIN, gọi `POST /chat/conversations`. **Kỳ vọng:** `403` — conversation chỉ dành cho
`CUSTOMER`. Authorize → Logout, gọi lại. **Kỳ vọng:** `401`. Xong thì Authorize lại JWT_CUSTOMER1.

## 3. Gửi tin nhắn — `POST /chat/conversations/:id/messages`

Mọi request mục này cần header `Idempotency-Key` (một UUID bất kỳ, tự sinh — Swagger UI có ô nhập
header riêng ở "Parameters").

### Happy path

`POST /chat/conversations/{CONV1_ID}/messages`, header `Idempotency-Key: <uuid-1>`, body `{ "body":
"Xin chào, tôi cần hỗ trợ đơn hàng" }`. **Kỳ vọng:** `201`. **Copy `message.id`** → **MSG1_ID**.

### 3a. Test edge — thiếu header `Idempotency-Key`

Gọi lại y hệt nhưng **bỏ trống header `Idempotency-Key`**. **Kỳ vọng:** `400`.

### 3b. Test edge — replay đúng key + đúng body (idempotent, không tạo dòng mới)

Gọi lại y hệt **Happy path** (cùng `<uuid-1>`, cùng body). **Kỳ vọng:** `200` (không phải `201`),
`message.id = MSG1_ID`.

### 3c. Test edge — replay cùng key, khác body (409)

`POST /chat/conversations/{CONV1_ID}/messages`, header `Idempotency-Key: <uuid-1>` (**y hệt mục
Happy path**), body `{ "body": "một nội dung khác" }`. **Kỳ vọng:** `409`.

### 3d. Test edge — ADMIN gửi được vào conversation (không cần được assign)

Authorize JWT_ADMIN. `POST /chat/conversations/{CONV1_ID}/messages`, header `Idempotency-Key:
<uuid-2>`, body `{ "body": "Chào bạn, admin đây, mình hỗ trợ được gì?" }`. **Kỳ vọng:** `201`. **Copy
`message.id`** → **MSG2_ID** (dùng ở mục 5 cho unreadCount). Authorize lại JWT_CUSTOMER1.

### 3e. Test edge — customer khác không sở hữu conversation (404, không lộ tồn tại)

Authorize JWT_CUSTOMER2. `POST /chat/conversations/{CONV1_ID}/messages`, header `Idempotency-Key:
<uuid-3>`, body `{ "body": "hi" }`. **Kỳ vọng:** `404`. Authorize lại JWT_CUSTOMER1.

### 3f. Test edge — không token

Authorize → Logout, gọi `POST /chat/conversations/{CONV1_ID}/messages`. **Kỳ vọng:** `401`.
Authorize lại JWT_CUSTOMER1.

_(Case "gửi vào conversation đã CLOSED → 409" cần admin đóng conversation trước — xem mục 6b, làm
ngay sau khi đóng CONV1_ID ở đó, không làm ở mục này.)_

## 4. Xem lịch sử tin nhắn (cursor) — `GET /chat/conversations/:id/messages`

### Happy path

`GET /chat/conversations/{CONV1_ID}/messages` (không query). **Kỳ vọng:** `200`, `messages` có 2
phần tử (MSG2_ID của admin, MSG1_ID của customer1), thứ tự **mới nhất trước** (MSG2_ID đứng đầu),
`nextCursor = null` (chưa đủ 20 dòng mặc định).

### 4a. Test cursor — phân trang từng trang nhỏ

Gửi thêm 3 tin nhắn nữa từ customer1 (`Idempotency-Key` khác nhau mỗi lần, body tuỳ ý, vd "tin 3",
"tin 4", "tin 5") để có 5 tin tổng cộng. `GET /chat/conversations/{CONV1_ID}/messages?limit=2`.
**Kỳ vọng:** `200`, `messages` có 2 phần tử, `nextCursor` khác `null`. Gọi lại với
`?limit=2&cursor=<nextCursor vừa nhận>`. **Kỳ vọng:** 2 phần tử tiếp theo, không trùng 2 phần tử
trước. Lặp lại đến khi `nextCursor = null` — tổng số tin nhắn thu được qua các trang phải đúng bằng
5, không thiếu/thừa/trùng.

### 4b. Test edge — cursor sai định dạng

`GET /chat/conversations/{CONV1_ID}/messages?cursor=not-a-valid-cursor`. **Kỳ vọng:** `400`.

### 4c. Test edge — customer khác không đọc được (404)

Authorize JWT_CUSTOMER2. `GET /chat/conversations/{CONV1_ID}/messages`. **Kỳ vọng:** `404`.
Authorize lại JWT_CUSTOMER1.

## 5. Admin — danh sách inbox và `unreadCount` — `GET /admin/chat/conversations`

Authorize JWT_ADMIN.

### 5a. Test edge — RBAC

Authorize JWT_CUSTOMER1, gọi `GET /admin/chat/conversations`. **Kỳ vọng:** `403`. Authorize lại
JWT_ADMIN.

### Happy path — sort và unreadCount

`GET /admin/chat/conversations`. **Kỳ vọng:** `200`, `conversations` chứa `CONV1_ID`, sắp xếp
`lastMessageAt DESC`. Ghi lại `unreadCount` hiện tại của `CONV1_ID` (đã bị ảnh hưởng bởi mục 4 —
admin **chưa từng** gọi `GET messages` trên CONV1_ID nên các tin của customer1 vẫn `unread`).

Authorize JWT_CUSTOMER1. `POST /chat/conversations/{CONV1_ID}/messages`, header `Idempotency-Key:
<uuid-6>`, body `{ "body": "còn ai hỗ trợ không?" }`. **Kỳ vọng:** `201`.

Authorize JWT_ADMIN. `GET /admin/chat/conversations`. **Kỳ vọng:** `unreadCount` của `CONV1_ID` **cao
hơn trước** đúng 1 (chỉ đếm tin do customer gửi, chưa đọc).

`GET /chat/conversations/{CONV1_ID}/messages` (đọc lịch sử — đánh dấu tin của customer đã đọc).
`GET /admin/chat/conversations` lần nữa. **Kỳ vọng:** `unreadCount` của `CONV1_ID` = `0`.

### 5b. Test edge — filter theo `status`/`assignedAdminId`

`GET /admin/chat/conversations?status=OPEN`. **Kỳ vọng:** `200`, mọi phần tử trả về có
`status = "OPEN"`. `GET /admin/chat/conversations?assignedAdminId={ADMIN_ID}`. **Kỳ vọng:** `200`,
chỉ trả về conversation đã assign cho admin này (rỗng nếu chưa assign ai — xem mục 6).

## 6. Admin — assign / đổi trạng thái — `PATCH /admin/chat/conversations/:id`

Authorize JWT_ADMIN.

### 6a. Test edge — validation trước khi chạm DB

`PATCH /admin/chat/conversations/{CONV1_ID}` với body `{}`. **Kỳ vọng:** `400` (không có field nào).

`PATCH /admin/chat/conversations/{CONV1_ID}` với `{ "assignedAdminId": "{CUSTOMER1_ID}" }`.
**Kỳ vọng:** `400` — customer1 không phải admin.

`PATCH /admin/chat/conversations/00000000-0000-4000-8000-000000000000` với `{ "status": "CLOSED" }`.
**Kỳ vọng:** `404`.

### Happy path — assign cho chính admin đang test

`PATCH /admin/chat/conversations/{CONV1_ID}` với `{ "assignedAdminId": "{ADMIN_ID}" }`. **Kỳ
vọng:** `200`, `conversation.assignedAdmin.id = ADMIN_ID`.

### 6b. Đóng conversation, rồi quay lại test "gửi vào CLOSED" (mục 3f đã hoãn)

`PATCH /admin/chat/conversations/{CONV1_ID}` với `{ "status": "CLOSED" }`. **Kỳ vọng:** `200`,
`conversation.status = "CLOSED"`.

Authorize JWT_CUSTOMER1. `POST /chat/conversations/{CONV1_ID}/messages`, header `Idempotency-Key:
<uuid-7>`, body `{ "body": "còn ai không?" }`. **Kỳ vọng:** `409` (đây chính là case đã hoãn ở mục
3f).

### 6c. Test edge — reopen bị chặn khi customer đã có OPEN khác (409)

Customer vẫn cần một nơi để chat tiếp sau khi CONV1_ID đóng — `POST /chat/conversations` (JWT
đang là JWT_CUSTOMER1). **Kỳ vọng:** `201` (conversation mới vì CONV1_ID đã CLOSED). **Copy
`conversation.id`** → **CONV2_ID**.

Authorize JWT_ADMIN. `PATCH /admin/chat/conversations/{CONV1_ID}` với `{ "status": "OPEN" }`.
**Kỳ vọng:** `409` — reopen CONV1_ID sẽ tạo ra 2 conversation OPEN cùng lúc cho customer1 (CONV1_ID
và CONV2_ID), vi phạm partial unique index.

## 7. WebSocket realtime — namespace `/chat` (CHAT-07, Postman Socket.IO)

Dùng request Socket.IO đã tạo ở mục 0.6 (`http://localhost:3001`, namespace `/chat`).

### 7a. Test edge — token sai bị disconnect ngay

Cấu hình auth handshake của request với `{ "token": "not-a-real-jwt" }` (tab Auth của Socket.IO
request trong Postman; nếu bản Postman không có ô auth riêng thì thêm header
`Authorization: Bearer not-a-real-jwt` khi Connect — gateway chấp nhận cả hai). **Connect**.
**Kỳ vọng:** socket connect rồi bị server disconnect gần như ngay lập tức.

### Happy path — join conversation của mình và nhận broadcast

Sửa auth handshake thành `{ "token": "<JWT_CUSTOMER1>" }`. **Connect**. **Kỳ vọng:** kết nối thành
công, không bị disconnect.

Emit event `conversation.join` với payload `{ "conversationId": "{CONV2_ID}" }` (dùng ô "Emit
event"/"Message" của Postman, nhớ chọn đúng tên event `conversation.join` để nhận được ack).
**Kỳ vọng:** ack trả về `{ "ok": true }`.

Ở tab/request Swagger UI (Authorize JWT_ADMIN): `POST /chat/conversations/{CONV2_ID}/messages`,
header `Idempotency-Key: <uuid-8>`, body `{ "body": "delivered over websocket" }`. **Kỳ vọng:**
`201` qua REST, **đồng thời** socket Postman nhận được event `chat.message.created` với
`message.body = "delivered over websocket"` — đây là bằng chứng chính của CHAT-07 (REST commit
xong mới broadcast).

### 7b. Test edge — join conversation không sở hữu (NOT_FOUND)

Cùng socket (vẫn auth bằng JWT_CUSTOMER1). Emit `conversation.join` với `{ "conversationId":
"{CONV1_ID}" }`... **đổi lại** — dùng socket auth bằng JWT_CUSTOMER2 (Disconnect, sửa token, Connect
lại) rồi emit `conversation.join` với `{ "conversationId": "{CONV1_ID}" }` (sở hữu bởi customer1).
**Kỳ vọng:** ack `{ "ok": false, "code": "NOT_FOUND" }` — không lộ việc conversation có tồn tại hay
không.

### 7c. Test edge — join conversation đã CLOSED

Vẫn socket JWT_CUSTOMER2 hoặc reconnect lại bằng JWT_CUSTOMER1 (CONV1_ID là của customer1 nên dùng
JWT_CUSTOMER1 mới đúng ngữ cảnh "chủ conversation join lại conversation đã đóng"). Emit
`conversation.join` với `{ "conversationId": "{CONV1_ID}" }` (đã CLOSED từ mục 6b). **Kỳ vọng:** ack
`{ "ok": false, "code": "CONVERSATION_CLOSED" }`.

## 8. Concurrency (không demo thủ công — xem evidence tự động)

Race "2 request mở conversation cùng lúc chỉ tạo đúng 1 row" (bắt `23505` trên partial unique index)
và "2 request gửi cùng Idempotency-Key cùng lúc chỉ tạo đúng 1 message" cần độ chính xác thời gian
mà bấm tay 2 tab không đảm bảo được — giống PR11. Bằng chứng cho 2 case này là **kết quả chạy
`test/chat.e2e-spec.ts`** (dùng `Promise.all` bắn request thật cùng lúc), không phải thao tác thủ
công — đính kèm output console của `npm run test:e2e -- chat.e2e-spec.ts` (26/26 pass) làm evidence
thay cho screenshot.

## 9. Tổng hợp bằng chứng cho PR

Đặt tên file/thư mục evidence gợi ý (đính kèm vào PR hoặc Google Drive rồi dán link vào mô tả PR):

```
docs/testing/evidence/pr15/
├── 01-login-admin-200.png
├── 02-login-customer1-200.png
├── 03-login-customer2-200.png
├── 04-conversation-me-404-before-open.png
├── 05-conversation-open-201.png
├── 06-conversation-me-200.png
├── 07-conversation-open-repeat-200.png
├── 08-conversation-open-rbac-403.png
├── 09-conversation-open-no-token-401.png
├── 10-message-send-201.png
├── 11-message-missing-idempotency-key-400.png
├── 12-message-replay-same-body-200.png
├── 13-message-replay-different-body-409.png
├── 14-message-admin-send-201.png
├── 15-message-other-customer-404.png
├── 16-message-no-token-401.png
├── 17-messages-history-200.png
├── 18-messages-cursor-page1-200.png
├── 19-messages-cursor-page2-200.png
├── 20-messages-malformed-cursor-400.png
├── 21-messages-other-customer-404.png
├── 22-admin-inbox-rbac-403.png
├── 23-admin-inbox-unread-before.png
├── 24-admin-inbox-unread-after-increment.png
├── 25-admin-inbox-unread-after-read-zero.png
├── 26-admin-inbox-filter-status.png
├── 27-admin-patch-empty-body-400.png
├── 28-admin-patch-non-admin-assignee-400.png
├── 29-admin-patch-not-found-404.png
├── 30-admin-patch-assign-200.png
├── 31-admin-patch-close-200.png
├── 32-message-send-to-closed-409.png
├── 33-conversation-open-second-201.png
├── 34-admin-patch-reopen-conflict-409.png
├── 35-ws-invalid-token-disconnect.png
├── 36-ws-join-ok-true.png
├── 37-ws-broadcast-received.png
├── 38-ws-join-not-found.png
├── 39-ws-join-closed.png
├── 40-chat-e2e-console-26-passed.png
└── pr15-demo.mp4   (video quay liền mạch mục 1 → 7)
```

Không bắt buộc đúng tên file này — quan trọng là mỗi ảnh/đoạn video thể hiện rõ **request + response
(status code + body)**, hoặc với WebSocket là **payload emit/ack/event nhận được**, đặc biệt: mục 3b
(replay idempotent), mục 5 (unreadCount tăng/giảm đúng theo hành động đọc), mục 6c (reopen 409) và
mục 7 happy path (broadcast tới đúng room sau khi REST commit) — đây là các điều kiện nghiệm thu cốt
lõi của PR15.
