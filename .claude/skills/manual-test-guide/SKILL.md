---
name: manual-test-guide
description: Viết file docs/testing/prXX-manual-test-guide.md hướng dẫn test thủ công (Postman/Swagger UI) làm bằng chứng cho reviewer, theo đúng format thật đã dùng ở PR06/PR07 — không hardcode outline cố định, đọc guide gần nhất để bám văn phong rồi sinh mục theo diff thật của PR hiện tại. Dùng khi user gõ /manual-test-guide, hoặc nói "viết manual test guide", "tạo hướng dẫn test thủ công cho PR này", "làm bằng chứng test cho reviewer". Không tự tạo PR — việc đó dùng flow built-in sẵn có của Claude Code, không lặp lại ở skill này.
---

# Manual Test Guide

Viết file `docs/testing/prXX-manual-test-guide.md` hướng dẫn test thủ công (Postman hoặc Swagger UI) làm bằng chứng cho reviewer — theo đúng format thật đã dùng ở PR06 (`docs/testing/pr06-manual-test-guide.md`) và PR07 (`docs/testing/pr07-manual-test-guide.md`), không phải suy đoán format mới.

## Bước 0 — Đọc argument

Argument có thể là số PR tường minh (vd `/manual-test-guide 8` hoặc `/manual-test-guide PR08`), hoặc để trống.

- Có số PR trong argument: dùng luôn.
- Không có: suy từ tên branch hiện tại theo pattern `feature/pull-<N>-*` (vd `feature/pull-8-admin-users` → PR08). Không khớp pattern này → hỏi thẳng user số PR, không đoán bừa — tên file đặt theo số PR, đặt sai gây nhầm lẫn khi tra cứu lại sau này.

## Bước 1 — Xác định diff cần cover

- Mặc định: `git diff main...HEAD` (toàn bộ thay đổi nhánh hiện tại so với `main`) cộng `git diff` (uncommitted) nếu có.
- Nếu diff rỗng, báo "Không có thay đổi để viết test guide" và dừng, không tạo file rỗng.

## Bước 2 — Đọc guide gần nhất làm tham chiếu văn phong

Tìm file `docs/testing/prXX-manual-test-guide.md` có số PR lớn nhất nhưng nhỏ hơn số PR hiện tại (đang viết PR08 thì đọc PR07; không có PR07 thì lùi tiếp PR06...), đọc bằng Read tool.

**Chỉ học theo**: cách đặt tên mục theo trình tự nghiệp vụ (`## 1. <Tên hành động> — \`METHOD /path\``), cách đánh số case lỗi/edge (`### 1a. Test lỗi — ...`/`### 1a. Test edge — ...`), cách trình bày request/response mẫu, mục mở đầu "0. Chuẩn bị", mục kết "Tổng hợp bằng chứng cho PR".

**Không copy outline** của file cũ — số mục, tên mục, công cụ demo (Postman hay Swagger UI) phải sinh lại từ diff thật của PR hiện tại (Bước 3). PR06 dùng Postman, PR07 dùng Swagger UI vì lý do nghiệp vụ khác nhau — không có "khung chuẩn" cố định để hardcode vào skill này.

Nếu không tìm thấy guide cũ nào (PR đầu tiên có guide loại này) — không chặn lại, tự thiết kế theo cấu trúc chung ở Bước 4.

## Bước 3 — Liệt kê endpoint/flow cần test từ diff thật

Đọc kỹ diff (controller, DTO, service) — không đoán từ tên file hay mô tả PR. Với mỗi endpoint mới hoặc đổi behavior:

- 1 mục happy path.
- 1 mục edge case cho **mỗi rule/validation/bug thực sự có trong diff này** — vd DTO validation mới, RBAC/ownership check mới, atomic update/lock mới (mục 22 CODING_STANDARD.md), lỗi 4xx mới định nghĩa trong i18n. Không liệt kê edge case chung chung không liên quan tới PR đang xét — guide phải giúp reviewer soi đúng chỗ PR này thay đổi, không phải bộ test case độc lập với code.

PR chỉ đổi behavior của endpoint cũ (không thêm mới) vẫn phải có mục test lại đúng phần đổi, không bỏ qua vì "không phải API mới".

## Bước 4 — Viết file

Tạo `docs/testing/pr<N>-manual-test-guide.md`:

- Mở đầu: `# PR<N> — Hướng dẫn test thủ công bằng <Postman|Swagger UI> (bằng chứng cho reviewer)`.
- `## 0. Chuẩn bị`: seed data cần thiết, biến môi trường/base_url, tài khoản demo, Mailpit nếu PR có gửi mail.
- Mỗi endpoint/flow: 1 mục theo đúng thứ tự luồng nghiệp vụ thật (không theo thứ tự khai báo trong controller), có subsection edge case đánh số `Na`, `Nb`...
- Mục cuối: `## <số cuối>. Tổng hợp bằng chứng cho PR` — bảng hoặc checklist liệt kê từng case ở trên, kèm chỗ để user tự paste kết quả thật (screenshot/response) khi họ tự chạy tay.

## Bước 5 — Không tự tạo evidence thật

Skill này chỉ tạo **khung hướng dẫn** — không tự gọi API qua Postman/Swagger UI để sinh evidence thật. Báo rõ với user sau khi viết xong: "Guide đã viết xong, bạn cần tự chạy theo từng bước và paste kết quả thật vào mục Tổng hợp trước khi mở PR."

## Bước 6 — Không tự tạo PR

Tạo PR (gh pr create + điền `.github/PULL_REQUEST_TEMPLATE.md`) đã có sẵn trong hành vi built-in của Claude Code — không lặp lại logic đó ở đây. Sau khi viết xong file, chỉ nhắc user: khi có evidence thật rồi, yêu cầu "tạo PR" là đủ, không cần gọi lại skill này.
