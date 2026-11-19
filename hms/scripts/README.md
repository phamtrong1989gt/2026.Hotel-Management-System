# scripts — công cụ cấp DỰ ÁN

Bộ công cụ Node thuần (ESM, không `npm install`) chạy **ở thư mục DỰ ÁN** (thư mục có `workspace.json`). Công cụ biết dự án có những phần mềm nào và lõi nền tảng nằm đâu qua `workspace.json` — không cứng tên phần mềm, tên máy hay ổ đĩa.

Lõi được tìm theo thứ tự: `platform.local.props` (`<PlatformRoot>`, riêng từng máy) → biến môi trường `PLATFORM_ROOT` → `workspace.json → platform.path`. Không có chỗ nào đúng ⇒ công cụ dừng và liệt kê từng nơi đã thử.

Biến môi trường tuỳ chọn: `PTCORE_PROJECT_ROOT` (phải trỏ đúng dự án này, sai ⇒ dừng) · `PTCORE_ALLOW_MISSING_APPS=1` (cho qua khi chỉ clone một phần các repo phần mềm).

## Cổng kiểm (gate)

| Lệnh | Làm gì | Mã thoát |
|---|---|---|
| `node scripts/check-apps.mjs [--json]` | Kiểm hồ sơ `app.yaml` của mọi phần mềm (A1–A7): đọc được và hợp lệ, `code` trùng tên thư mục, mã / `sso_code` / `sso_app_id` / cổng không trùng, thư mục `paths.*` và csproj tồn tại. | 0 đạt (WARN không làm đỏ) · 1 có ERROR · 2 sai tham số hoặc không có phần mềm nào |
| `node scripts/check-ports.mjs [--json]` | Kiểm cổng dev theo `app.yaml → ports` (nhóm `dev`, `agent`): công thức khối (`be_https` = `be_http` + 1, `fe` = `be_http` − 800, agent = dev + 10), không trùng cổng giữa các phần mềm và với dịch vụ lõi, khớp bảng `docs/deploy/bang-cong-dev.md` mục 2, `launchSettings.json`, `angular.json`, `environment*.ts`. | 0 đạt · 1 lệch / trùng / không đọc được hồ sơ · 2 sai tham số |
| `node scripts/config-sync.mjs [--sync [--dry]] [--json]` | Kiểm các tệp `appsettings.*.json` dùng chung giữa SSO và các phần mềm so với bản mẫu của lõi (luật «phần mềm mới không được thiếu cấu hình» R1–R6); `--sync` chép bản mẫu và sinh tệp khung còn thiếu (không ghi đè). | 0 không lỗi đỏ · 1 còn mục đỏ |
| `node scripts/sync-claude-dirs.mjs [--write [--prune]] [--group]` | Kiểm / chép `.claude` (lệnh `/…` + hook) và `CLAUDE.md` từ lõi sang dự án và từng repo phần mềm. Mặc định chỉ kiểm. Dự án, lõi và các repo phần mềm phải cùng một ổ đĩa (đường dẫn trong tệp luôn tương đối). | 0 khớp / đã ghi · 1 lệch hoặc lỗi môi trường |
| `node scripts/fe-node-modules.mjs [--link]` | Canh phụ thuộc của mọi FE phải giống hệt nhau (để dùng chung một bản `node_modules` cài ở lõi); `--link` tạo liên kết `FE/node_modules` cho FE chưa có. Không chạy npm, không xoá gì. | 0 giống hệt · 1 lệch (hoặc `--link` thất bại) · 2 không ở bố cục tách |

Mỗi công cụ trên có `--selftest` (dựng kho giả trong thư mục tạm, ca thuận + ca phá; mỗi ca phá phải đỏ): `check-apps`, `check-ports`, `sync-claude-dirs`, `fe-node-modules`, `lib/apps.mjs`, `lib/mini-yaml.mjs`. Mã thoát 0 = mọi ca đúng kỳ vọng.

## Thư viện dùng chung (`lib/`)

| Tệp | Vai trò |
|---|---|
| `workspace.mjs` · `Workspace.ps1` | Chỗ nối DUY NHẤT biết kho gồm nhiều thư mục: đổi đường dẫn LOGIC (`src/Apps/<Mã>/…`, `src/Core/…`, `scripts/…`) ⇄ THẬT theo `workspace.json`. `Workspace.ps1` là bản PowerShell 5.1 (thuần ASCII) cho script `.ps1`. |
| `apps.mjs` | Đọc / kiểm `app.yaml`, phân giải «đang làm phần mềm nào» (`--app` → đường dẫn → tên module → kho chỉ có một phần mềm; còn nhập nhằng thì **hỏi lại**, không có phần mềm mặc định). CLI: `node scripts/lib/apps.mjs [--resolve\|--print <khoá>\|--vars] [--app <Mã>]` (mã thoát 3 = cần hỏi lại). |
| `mini-yaml.mjs` | Bộ đọc tập con YAML chặt cho `app.yaml` (từ chối mọi thứ không hiểu, báo số dòng). |
| `jsonc.mjs` | Đọc JSON có chú thích và dấu phẩy thừa (`appsettings`, `launchSettings`, `angular.json`). |

## Kiểm thử

```
node --test scripts/
```

Chạy toàn bộ test (`*.test.mjs`): tự kiểm của từng công cụ, ca dựng kho giả trong thư mục tạm, và vài ca chạy trên chính dự án (cổng, hồ sơ, đồng bộ `.claude`, phụ thuộc FE). Test không đụng phần mềm thật nào ngoài dự án đang đứng; ca nào cần dữ liệu chưa có (vd `.claude` chưa đồng bộ lần đầu, dự án và lõi khác ổ đĩa) sẽ báo «bỏ qua» kèm lý do thay vì đỏ giả.

## Công cụ khác trong thư mục này

`gen-adm-script.mjs` / `gen-adm-script.cs` — sinh script SQL bảng `adm` cho CSDL của một phần mềm (chỉ ghi một tệp `.sql`, không nối CSDL); xem đầu tệp để biết tham số.
