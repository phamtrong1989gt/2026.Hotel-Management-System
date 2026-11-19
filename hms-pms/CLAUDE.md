<!-- Tệp SINH bởi scripts/sync-claude-dirs.mjs ở thư mục dự án — sửa công cụ rồi chạy lại, đừng sửa tay. -->

# hms-pms — một trong 3 thư mục của kho TÁCH

Kho gộp cũ (một thư mục có `src/Core`, `src/Services`, `src/Apps/<Mã>`, `scripts`, `docs`, `deploy`, `_bmad`) nay là các thư mục độc lập, KHÔNG submodule. Đường dẫn dưới đây tính từ thư mục đang mở:

| Vai trò | Thư mục |
|---|---|
| Lõi nền tảng — `src/Core`, `src/Services` (SSO · Gateway · File), `_bmad` | `../../0.Core` |
| Dự án — `scripts`, `docs`, `deploy`, `services-config`, `workspace.json` | `../hms` |
| Phần mềm PMS — `BE`, `FE`, `_contracts`, `scripts` | `.` ← đang mở ở đây |

## Đường dẫn LOGIC ↔ THẬT

Luật `_bmad`, các lệnh `/vibe` `/stack` `/gen-module`…, hồ sơ `app.yaml` và thông báo của công cụ vẫn nói theo đường dẫn LOGIC của kho gộp cũ. Dịch sang đường dẫn thật:

- `src/Apps/PMS/…` → `./…` (vd `src/Apps/PMS/BE/x` = `./BE/x`)
- `src/Core/…` · `src/Services/…` · `_bmad/…` → lõi (`../../0.Core/…`)
- `scripts/…` · `docs/…` · `deploy/…` · `services-config/…` → dự án (`../hms/…`)

Chi tiết, cách công cụ nhận diện nhau và danh sách việc còn mở: `../hms/docs/BO-CUC-KHO-TACH.md`.

## Làm việc khi mở một thư mục riêng lẻ

- Lõi và dự án (riêng thư mục dự án: cả các phần mềm) đã được cấp quyền đọc / ghi qua `.claude/settings.json` → `additionalDirectories` (đường dẫn tương đối, tính từ thư mục đang mở); thư mục khác thì Claude sẽ hỏi quyền. HOOK và lệnh `/…` thì chỉ lấy từ `.claude` của thư mục ĐANG MỞ — vì vậy mỗi thư mục có bản sao `.claude/` và `CLAUDE.md` này.
- Nguồn chuẩn của `.claude` là LÕI. Sửa ở lõi, rồi chạy ở thư mục dự án: `node scripts/sync-claude-dirs.mjs --write` (kiểm: `node scripts/sync-claude-dirs.mjs`). Đừng sửa tay bản sao.
- Cổng và công cụ cấp dự án chạy từ thư mục dự án (`node scripts/…`); công cụ của khung BMAD chạy từ thư mục lõi.
- Hook của dự án chặn lệnh dựng FE (`npm run build`, `ng build`) từ phiên Claude: coder tự build ở terminal; kiểm kiểu bằng `ngc --noEmit` thì được.
