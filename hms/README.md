# Hotel Management System (HMS)

Thư mục **dự án**: chứa `workspace.json` (khai lõi + các repo phần mềm), `scripts` (cổng kiểm cấp dự án), `docs`, `services-config`. Mã nghiệp vụ của từng phần mềm nằm ở repo riêng cạnh thư mục này. Dựng ngày 2026-11-20 bằng `_bmad/tests/new-project.mjs` của lõi nền tảng 7.0.0 (dòng `7.0.x`).

| Thành phần | Thư mục (tính từ đây) |
|---|---|
| Lõi nền tảng (dùng chung nhiều dự án) | `../../0.Core` |
| Phần mềm PMS (Linked) — `BE`, `FE`, `_contracts`, `doc`, `scripts` | `../hms-pms` |

**Máy mới / clone về:** xem [docs/README.md](docs/README.md) — clone đúng bố cục anh em, `npm install` ở lõi, `node scripts/fe-node-modules.mjs --link`.
**Bảng cổng dev:** [docs/deploy/bang-cong-dev.md](docs/deploy/bang-cong-dev.md). **Bố cục các thư mục:** [docs/BO-CUC-KHO-TACH.md](docs/BO-CUC-KHO-TACH.md).

## Cổng kiểm (chạy ở thư mục này)

```
node scripts/check-apps.mjs        # hồ sơ app.yaml của mọi phần mềm
node scripts/check-ports.mjs       # cổng dev: công thức khối · trùng cổng · bảng ↔ app.yaml ↔ launchSettings
node scripts/config-sync.mjs       # cấu hình dùng chung (appsettings.*, .env.example) — thêm --sync để sinh phần thiếu
node scripts/sync-claude-dirs.mjs  # .claude + CLAUDE.md các thư mục khớp lõi — thêm --write để chép
node --test scripts/               # test của chính các công cụ trên
dotnet build TN.HMS.slnx         # cả dự án (lõi + mọi phần mềm)
```
