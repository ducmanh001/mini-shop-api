# Mini Shop API — hướng dẫn cho Claude Code

NestJS + TypeORM + PostgreSQL ecommerce backend, làm trong mock project có mentor review thật. Hiện đã xong B1-B4 (requirements, ERD, foundation, 14 entity + migration + seed — PR04 `feature/pull-4-schema-seed`). Từ đây trở đi là B5: implement theo đúng thứ tự ưu tiên trong [full-scope-plan.md](docs/planning/full-scope-plan.md) — **vàng (P0) xong hết mới sang trắng (P1)**, không làm song song.

## Đọc gì trước khi code

- [CODING_STANDARD.md](CODING_STANDARD.md) — 27 mục, rule đầy đủ. Không copy vào đây để tránh trùng và lạc hậu — đọc trực tiếp khi cần, nhất là mục 2 (folder structure), 3 (controller mỏng), 6 (transaction), 10 (chiều phụ thuộc module).
- [docs/process/pr-self-review-checklist.md](docs/process/pr-self-review-checklist.md) — pattern review **thật** của mentor (`lamnv-1116`) rút từ nhiều PR học viên khác cùng chương trình, không phải suy luận lý thuyết.

## Rule hay bị phá vỡ nhất khi implement mới (tự áp dụng trong lúc code, đừng đợi review bắt)

- **Đặt `const`/`enum`/`interface`/`type` mới ở đâu**: chỉ 1 câu hỏi — module khác không liên quan trực tiếp có cần dùng ở runtime/import không? Có → `common/enums|constants/` hoặc `common/<subfolder>/interfaces`. Không → vẫn phải có file riêng trong module (`modules/<module>/{enums,constants,interfaces}/`), **không khai inline trong file entity/service/controller** dù chỉ dùng nội bộ 1 module (mục 2.2, 10 CODING_STANDARD.md).
- **Không query trong vòng lặp** (N+1); check tồn tại dùng `.exists()` không `findOne()`; join/list nhiều cột phải có `.select([...])` (mục 18).
- **Controller không chứa business logic** — chỉ gọi đúng 1 hàm service (mục 3).
- **Transaction nhiều bước phải truyền `manager` xuyên suốt mọi Repository/service call bên trong** — `dataSource.transaction()` không tự động bảo vệ nếu code trong callback dùng Repository inject mặc định thay vì `manager` (mục 6, đã từng là bug thật).
- **Đọc-rồi-ghi trên 1 row có thể bị nhiều request đua** (tồn kho, đổi trạng thái đơn, mở conversation) dùng atomic UPDATE hoặc `pessimistic_write` lock, không chỉ bọc transaction (mục 22).
- **Interface dùng ở service/controller tách file riêng** trong `interfaces/`, kể cả khi có lý do hợp lý để khai inline (vd tránh import cycle) — reviewer thật không chấp nhận ngoại lệ này, giải quyết cycle bằng cách khác.
- **Không `Promise.all` cho nhiều query cùng dùng một `manager` transaction** — một transaction chỉ có đúng một connection nên không có gì chạy song song thật; `pg` còn deprecate hành vi này (mục 6 CODING_STANDARD.md, bug thật ở PR12 checkout). Cần giảm round-trip cho N dòng cùng bảng thì gộp thành 1 UPDATE bằng `CASE`, không lặp N query.

## Git

- **Không bao giờ thêm `Co-Authored-By: Claude` vào commit** — chỉ author là user.
- Conventional Commits, không gộp nhiều thay đổi không liên quan vào 1 commit.

## Trước khi mở PR

Chạy `/pr-self-review` (thêm `fix` để tự sửa luôn FAIL 🔴: `/pr-self-review fix`). Sau bất kỳ thay đổi code nào, verify bằng đúng script có sẵn trong `package.json`: `npm run build`, `npm run lint:check`, `npx prettier --check .`, `npm run test:cov`, `npm run test:e2e`, và nếu có sửa entity thì `npm run migration:generate -- <tmp-name>` phải báo "No changes" (trừ khi thực sự đổi schema).
