# Checklist tự review trước khi mở PR — rút từ pattern reviewer thật

Khác [CODING_STANDARD.md](../../CODING_STANDARD.md): mục 🔴 dưới đây rút trực tiếp từ comment review thật của cùng một reviewer (`lamnv-1116`), trên PR của học viên khác cùng chương trình + PR#4 chính dự án Mini Shop. Mục 🟡 là khoảng trống bổ sung từ chuẩn ngành (Google eng-practices, OWASP File Upload, 12-Factor) mà các PR trên chưa từng chạm tới.

Nguồn: [nestjs-mock-project#7](https://github.com/thaind-2785/nestjs-mock-project/pull/7), [#8](https://github.com/thaind-2785/nestjs-mock-project/pull/8), [#9](https://github.com/thaind-2785/nestjs-mock-project/pull/9), [realworld-tutorial#21](https://github.com/thanhnn-3239/realworld-tutorial/pull/21), [#22](https://github.com/thanhnn-3239/realworld-tutorial/pull/22) (Prisma, upload avatar), [#23](https://github.com/thanhnn-3239/realworld-tutorial/pull/23) (approve sạch, không có finding), [nestjs_tutorial#3](https://github.com/thanhdn-2601/nestjs_tutorial/pull/3), [nestjs-tutorial#11](https://github.com/ducnt-0269/nestjs-tutorial/pull/11), [store-web#10](https://github.com/yenvt-0228/store-web/pull/10) (Kafka event), PR#4 mini-shop-api (`feature/pull-5-mail-queue`, dự án này).

## Phong cách reviewer

- Tiếng Việt, xưng "anh — em", câu ngắn, nêu vấn đề không giải thích lý do (trừ transaction/data consistency).
- Approve gần như ngay sau 1 commit sửa, không soát lại toàn diff → tự chịu trách nhiệm sửa đúng-đủ trước khi push lại.
- Trọng tâm: tối ưu query DB + tổ chức code. Ít đả động test coverage/security/commit convention (bù bằng mục 🟡).

## Top pattern lặp lại nhiều nhất (tần suất trên 4 PR gốc)

| #   | Pattern                                                            | Tần suất | Có rule CODING_STANDARD? |
| --- | ------------------------------------------------------------------ | :------: | ------------------------ |
| 1   | Query trong vòng lặp; `findOne()` thay vì `.exists()`              |  3/4 PR  | ✅ 18.2, 18.5, 18.6      |
| 2   | Thiếu `.select([...])` giới hạn cột khi query/join                 |  3/4 PR  | ⚠️ bổ sung bên dưới      |
| 3   | Interface khai trong file service thay vì tách file riêng          |  3/4 PR  | ✅ mục 4                 |
| 4   | Magic number/regex/path rải rác, chưa gom constants                |  3/4 PR  | ⚠️ bổ sung bên dưới      |
| 5   | Hàm quá dài/if-else lồng nhau; code trùng lặp chưa rút hàm chung   |  3/4 PR  | ⚠️ bổ sung bên dưới      |
| 6   | Controller chứa business logic                                     |  2/4 PR  | ✅ mục 3                 |
| 7   | Thiếu transaction/concurrency; ghi file trước khi transaction chạy |  2/4 PR  | ✅ mục 6, 18.7           |
| 8   | Access modifier không nhất quán                                    |  2/4 PR  | ⚠️ bổ sung bên dưới      |
| 9   | Tên hàm/biến không rõ nghĩa; repository không theo convention CRUD |  1/4 PR  | ✅ mục 12                |
| 10  | Thiếu logger cho xử lý quan trọng                                  |  1/4 PR  | ✅ mục 17.5              |

## Checklist — chạy trước khi mở PR

### Database & Performance

- [ ] 🔴 Không query trong vòng lặp `for`/`.map()` — gộp `IN(...)`/`JOIN`/`Promise.all` (mục 18.2, 18.6).
- [ ] 🔴 Check tồn tại dùng `.exists()`, không `findOne()` (mục 18.5).
- [ ] 🔴 Query join/list nhiều cột có `.select([...])` — kể cả `findOne()` có `relations`, không chỉ list (nguồn: PR#4, #7/#8).
- [ ] 🔴 Tạo entity trong transaction dùng `manager.create()` rồi `insert()`/`save()`, không insert object literal thô.
- [ ] 🔴 Update entity đã load trong transaction dùng `update()`, không `save()`, cho thay đổi đơn giản (nguồn: #9).
- [ ] 🔴 Ghi nhiều bước trong transaction truyền `manager` xuyên suốt mọi Repository/service call (mục 6) — đã cân nhắc race condition.
- [ ] 🔴 Ghi file ngoài DB trước khi transaction chạy — đã có cơ chế dọn file mồ côi khi transaction lỗi (mục 6).
- [ ] 🔴 Nhiều lock lồng nhau trong 1 transaction dùng đúng thứ tự lock cố định, tránh deadlock — áp dụng cho mọi transaction đa lock, không chỉ checkout (mục 22, nguồn: #9).
- [ ] Đọc-rồi-ghi trên 1 row có thể bị nhiều request đua (tồn kho, đổi trạng thái đơn, mở conversation) dùng atomic UPDATE hoặc `pessimistic_write`, không chỉ transaction (mục 22).

### Code Structure

- [ ] 🔴 Interface dùng ở service/controller tách file riêng `interfaces/*.interface.ts` — không có ngoại lệ dù có lý do tránh import cycle (mục 4, nguồn: #22).
- [ ] 🔴 Enum mới tách file riêng `enums/*.enum.ts`, không khai trong entity — áp dụng cho mọi enum, không chỉ enum cross-module.
- [ ] 🔴 Magic number/regex/path gom vào `constants/` của module sở hữu.
- [ ] Type/constant có sẵn của framework/library đã dùng trước khi tự định nghĩa mới (vd: enum `HttpStatus` của `@nestjs/common` thay vì hardcode `@HttpCode(200)`/`status: 400`) (mục 15).
- [ ] 🔴 Không hàm quá dài / if-else lồng quá 3 cấp; logic lặp lại rút hàm chung.
- [ ] 🔴 Controller không chứa business logic, chỉ gọi service (mục 3).
- [ ] 🔴 Access modifier nhất quán — method nội bộ `private`; DI constructor luôn `private readonly`, không bare `readonly` (nguồn: #11).
- [ ] Tên hàm/biến rõ nghĩa; repository theo convention CRUD (mục 12).
- [ ] Enum/const dùng cross-module đặt ở `common/enums/`, không đặt trong module sở hữu data (mục 10).

### Kiến trúc dự án

- [ ] Idempotency-Key dùng chung helper hash ở `common/utils/` (mục 23).
- [ ] WebSocket gateway không tự query DB — chỉ gọi service (mục 24).
- [ ] `@Cron()` chống chạy chồng lấn, giới hạn batch (mục 25).
- [ ] Field tiền (VND) validate `string` trước khi ép `Number`, không `parseFloat` trực tiếp lên input chưa kiểm (mục 26).

### Side-effect & consistency

- [ ] 🔴 Side-effect ngoài (mail, webhook, MQ publish) + ghi DB xác nhận — 2 chiều đều xử lý tách biệt, không chung 1 try/catch: DB ghi trước/side-effect fail sau (event mất — dual-write), hoặc side-effect thành công/DB ghi fail sau (retry lặp lại side-effect đã xong) (nguồn: PR#4 mail queue, #10 order event).
- [ ] 🔴 Hành động bù trừ/rollback tự thất bại (xóa file mồ côi, hoàn kho...) có chiến lược rõ hơn "log rồi bỏ qua" — nối vào cơ chế cron dọn dẹp đã có (mục 6), không try/catch-and-log riêng (nguồn: #22).
- [ ] Handler nhận message at-least-once (MQ, webhook) check id đã xử lý chưa trước khi chạy side-effect — khác Idempotency-Key (chống broker retry, không phải client retry) (mục 23, nguồn: #10).
- [ ] Trước khi giữ resource "phòng hờ" (job fail trong queue, soft-delete, cache hết hạn) — trace xem nhánh không giữ có tự cho cùng kết quả không (nguồn: PR#4).
- [ ] 🔴 `.env.example` không chứa secret thật/dùng được ngay, kể cả secret chỉ bảo vệ dev — dùng placeholder rõ ràng invalid (nguồn: PR#4).

### Bảo mật 🟡

- [ ] Input từ client validate bằng DTO allow-list (class-validator), không deny-list.
- [ ] Upload file: giới hạn kích thước, kiểm MIME/magic byte, server tự sinh tên file ngẫu nhiên (mục 8).
- [ ] Không log/trả về password, token, secret (mục 9).
- [ ] Secret/credential lấy từ env qua `ConfigService.getOrThrow()`, không hardcode (mục 17.3).
- [ ] Endpoint có guard RBAC/ownership đúng — không dựa vào ẩn route ở FE.
- [ ] Raw query/QueryBuilder dùng parameter binding, không nối chuỗi trực tiếp từ input.

### Testing 🟡

- [ ] Unit test phủ nhánh nghiệp vụ quan trọng vừa sửa (N+1/transaction/concurrency ở trên), không chỉ happy path (mục 11).
- [ ] Có test cho nhánh lỗi (email trùng, token hết hạn, file không hợp lệ...).
- [ ] Sửa bug logic thì có regression test tái hiện đúng lỗi trước khi sửa.

### Git & PR Hygiene 🟡

- [ ] Conventional Commits, không gộp nhiều thay đổi không liên quan vào 1 commit.
- [ ] PR description dùng đúng `.github/PULL_REQUEST_TEMPLATE.md`.
- [ ] Đã tự đọc lại toàn bộ diff — reviewer thật không soát lại sau khi sửa, nên sửa đúng-đủ ngay từ đầu.
- [ ] Việc bị dời sang sau (theo góp ý review) có ghi chú/ticket theo dõi.

### Documentation & Observability

- [ ] Swagger cập nhật nếu thêm/đổi endpoint (mục 19).
- [ ] Env var mới đã thêm vào `.env.example` kèm mô tả.
- [ ] 🔴 Xử lý quan trọng (rate-limit, upload, auth, dọn resource mồ côi) có `Logger` ghi đủ ngữ cảnh — cả lúc thực hiện, không chỉ khi lỗi (nguồn: #22).

## Nguồn tham khảo cho phần 🟡

- [Google Engineering Practices](https://google.github.io/eng-practices/review/reviewer/standard.html)
- [OWASP File Upload Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/File_Upload_Cheat_Sheet.html)
- [The Twelve-Factor App — Config & Logs](https://12factor.net/config)

## Cách dùng

Chạy sau checklist mục 27 của `CODING_STANDARD.md`. Có thể yêu cầu Claude "chạy checklist docs/process/pr-self-review-checklist.md lên diff hiện tại" trước khi mở PR.
