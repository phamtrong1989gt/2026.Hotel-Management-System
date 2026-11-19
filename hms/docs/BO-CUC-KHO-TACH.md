# Bố cục các thư mục của Hotel Management System và cách công cụ tìm nhau

Dựng 2026-11-20 bằng `_bmad/tests/new-project.mjs` (lõi 7.0.0). Chi tiết đầy đủ của bố cục TÁCH (lõi · dự án · repo phần mềm) và phép dịch đường dẫn: `CLAUDE.md` ở gốc LÕI.

| Vai trò | Thư mục (tính từ thư mục dự án) | Chứa |
|---|---|---|
| **Lõi nền tảng** dùng chung nhiều dự án | `../../0.Core` | `src/Core` · `src/Services` (SSO · Gateway · File) · `_bmad` · `Directory.*.props` |
| **Dự án** (thư mục này) | `.` | `workspace.json` · `scripts` · `docs` · `services-config` · `TN.HMS.slnx` |
| Phần mềm PMS (Linked) — `BE`, `FE`, `_contracts`, `doc`, `scripts` | `../hms-pms` |

## Đường dẫn LOGIC ↔ THẬT

Luật `_bmad`, hồ sơ `app.yaml` và thông báo công cụ nói theo đường dẫn LOGIC của kho gộp cũ; công cụ tự dịch sang đường dẫn thật theo `workspace.json`:

- `src/Apps/<Mã>/…` → repo của phần mềm đó (xem `apps` trong `workspace.json`)
- `src/Core/…` · `src/Services/…` · `_bmad/…` → lõi
- `scripts/…` · `docs/…` · `services-config/…` → thư mục dự án

## Nhận diện lõi và dự án (thứ tự ưu tiên)

- **Lõi:** `platform.local.props` → biến `PLATFORM_ROOT` → `workspace.json → platform.path` → (MSBuild mỏng: mặc định `../../0.Core` tính từ repo). Riêng `Directory.Build.props` mỏng KHÔNG đọc `workspace.json` — `platform.path` khác mặc định thì phải đặt thêm `platform.local.props` hoặc `PLATFORM_ROOT` để BE và công cụ thấy CÙNG một lõi.
- **Dự án** (khi chạy công cụ của LÕI): biến `PTCORE_PROJECT_ROOT` → từ thư mục đang đứng đi ngược tới `workspace.json` → quét thư mục anh em quanh lõi (chỉ nhận khi DUY NHẤT; nhiều dự án ⇒ đặt biến).
- Phần mềm khai trong `workspace.json` mà repo chưa clone ⇒ công cụ ĐỎ nêu tên + đường dẫn thiếu (chủ ý chỉ làm một phần: `PTCORE_ALLOW_MISSING_APPS=1`).

## Quy tắc tệp commit

Đường dẫn trong mọi tệp commit là TƯƠNG ĐỐI và dùng `/`; KHÔNG ghi ổ đĩa, tên máy, tên người dùng, IP riêng. Phần riêng từng máy chỉ nằm ở tệp `*.local.*` / `.env` / `.local/` (đã `.gitignore`). KHÔNG commit liên kết / junction (`FE/node_modules`). Cổng kiểm: `node _bmad/tests/new-project.mjs --check-portable <thư mục>` ở lõi.
