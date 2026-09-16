---
name: pr-self-review
description: Chạy checklist tự-review trước khi mở PR, đối chiếu diff hiện tại với docs/process/pr-self-review-checklist.md (rút từ comment review thật của mentor trên các PR học viên khác). Dùng khi user gõ /pr-self-review, hoặc khi user nói "review trước khi mở PR", "check trước khi push", "so với checklist reviewer". Thêm argument "fix" (vd `/pr-self-review fix`) để tự sửa luôn các mục FAIL 🔴 sau khi báo cáo, không cần prompt riêng.
---

# PR Self-Review

Đối chiếu diff hiện tại với checklist đã rút từ pattern review thật của mentor (`lamnv-1116`), để bắt trước những lỗi mentor hay bắt — trước khi PR được gửi đi thật.

## Bước 0 — Đọc argument

Argument có thể gồm 2 phần độc lập, theo bất kỳ thứ tự nào:

- **Phạm vi diff** (xem Bước 1): path, branch/ref, hoặc số PR. Không có thì dùng mặc định.
- **Từ khoá `fix`** (hoặc "và fix", "rồi tự sửa", "auto fix"...): bật chế độ tự sửa ở Bước 5. Không có từ khoá này → chỉ chấm và báo cáo như cũ, **không đụng code**.

Vd: `/pr-self-review` (chỉ báo cáo), `/pr-self-review fix` (báo cáo + tự sửa FAIL 🔴), `/pr-self-review #12 fix` (soát PR #12 rồi tự sửa).

## Bước 1 — Xác định diff cần soát

- Không có argument phạm vi: dùng `git diff main...HEAD` (toàn bộ thay đổi của nhánh hiện tại so với `main`) cộng `git diff` (uncommitted) nếu có.
- Argument là một path: chỉ soát diff của path đó.
- Argument là một branch/ref khác: `git diff <ref>...HEAD`.
- Argument là số PR (vd `#12` hoặc chỉ số nguyên): dùng `gh pr diff <number>` nếu `gh` sẵn có và repo có remote; nếu không, báo cho user biết không lấy được diff PR và dừng lại — không tự đoán.

Nếu diff rỗng, báo ngay "Không có thay đổi để review" và dừng, không tạo báo cáo rỗng.

## Bước 2 — Đọc checklist nguồn

Đọc toàn bộ `docs/process/pr-self-review-checklist.md` bằng Read tool **mỗi lần chạy** — không hardcode lại nội dung checklist trong skill này, vì file có thể được cập nhật sau. Lấy đúng các dòng bắt đầu bằng `- [ ]` (bỏ qua các mục đã tự đánh dấu hoàn thành `- [x]` nếu có) làm danh sách mục cần chấm, giữ nguyên cờ 🔴/🟡 và section (Database & Performance, Code Structure, Bảo mật, Testing, Git & PR Hygiene, Documentation & Observability) của từng mục.

Nếu không tìm thấy file này trong repo, báo lỗi rõ ràng và dừng — không tự bịa checklist thay thế.

## Bước 3 — Chấm từng mục theo diff thật

Với mỗi mục checklist, đọc kỹ nội dung file/dòng liên quan trong diff (không chỉ đoán từ tên biến/import) rồi kết luận một trong ba:

- **PASS** — diff tuân thủ đúng mục này.
- **FAIL** — vi phạm cụ thể, phải trích dẫn đúng `file:dòng` và giải thích ngắn gọn vi phạm ở đâu.
- **N/A** — mục không áp dụng cho diff này (vd diff không đụng tới bảng nào thì bỏ qua toàn bộ mục Database; diff không có upload file thì bỏ qua phần MIME/magic-byte).

**Ưu tiên nghiêm ngặt mục 🔴 hơn 🟡** khi quyết định PR đã sẵn sàng hay chưa — 🔴 là pattern có bằng chứng thật từ reviewer, còn 🟡 là gợi ý bổ sung từ chuẩn ngành, quan trọng nhưng không phải thứ reviewer này đã từng bắt lỗi.

Không tự sửa code ở bước này — chỉ chấm và báo cáo. Chỉ sửa ở Bước 5, và chỉ khi có argument `fix`.

## Bước 4 — Xuất báo cáo

Trình bày theo đúng section của checklist gốc, mỗi mục một dòng dạng:

```
[PASS|FAIL|N/A] 🔴|🟡 <nội dung mục rút gọn> — <dẫn chứng file:dòng nếu FAIL>
```

Kết thúc bằng một câu tóm tắt rõ ràng: liệt kê số lượng FAIL 🔴 (phải sửa trước khi mở PR) tách riêng khỏi FAIL 🟡 (nên cân nhắc), rồi kết luận thẳng "Sẵn sàng mở PR" hoặc "Chưa nên mở PR — còn N mục 🔴 chưa qua".

## Bước 5 — Tự sửa (chỉ khi argument có từ khoá `fix`)

Không có từ khoá `fix` → dừng lại ở Bước 4, không làm gì thêm.

Có `fix` → với từng mục **FAIL 🔴** (bỏ qua 🟡 — luôn cần user tự quyết, không tự sửa):

- Nếu là lỗi máy móc, sửa rõ ràng theo đúng mục checklist trỏ tới (thêm `.select()`, tách constant, đổi `findOne` → `exists()`, tách interface/enum ra file riêng...) — sửa trực tiếp, không hỏi lại.
- Nếu việc sửa đòi hỏi quyết định kiến trúc/nghiệp vụ (vd đổi cấu trúc bảng, đổi hành vi API) — **không tự sửa**, liệt kê riêng vào nhóm "cần bạn quyết định" trong tóm tắt cuối, kèm lý do tại sao không tự sửa được.
- Sau khi sửa xong tất cả mục có thể sửa máy móc, chạy lại pipeline verify chuẩn của repo (build, lint, format check, unit test, e2e test, và `migration:generate` để xác nhận không phát sinh schema drift nếu có đụng entity) — dùng đúng script trong `package.json`, không tự chế lệnh khác.
- In tóm tắt cuối: bao nhiêu mục đã tự sửa, bao nhiêu mục cần user quyết định (kèm lý do), và trạng thái verify (pass/fail). Không tự commit — dừng lại ở việc sửa code, để user tự xem lại và yêu cầu commit riêng.
