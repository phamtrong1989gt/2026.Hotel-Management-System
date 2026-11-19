# Hotel Management System — máy mới / clone về

Dự án gồm **nhiều thư mục độc lập** (không submodule) đặt **cạnh nhau**, mọi đường dẫn trong tệp commit là **tương đối** và chỉ đúng khi giữ bố cục này.

```
<thư mục gốc>/
├── 0.Core/     ← lõi nền tảng (repo riêng, dùng chung nhiều dự án) — phải ở ../0.Core tính từ thư mục gốc dự án
└── <thư mục gốc dự án>/
    ├── hms/   ← thư mục DỰ ÁN (workspace.json · scripts · docs · services-config)
    └── hms-pms/   ← repo phần mềm PMS (Linked)
```

## Các bước (đúng thứ tự)

1. **Clone** lõi và các repo của dự án về đúng bố cục trên (tên thư mục đúng chữ hoa — CI Linux phân biệt hoa thường). Lõi: checkout đúng dòng `7.0.x` (`platform.ref` trong `workspace.json`); bản đang dùng khi dựng khung là `7.0.0`.
2. **Cài gói giao diện MỘT lần ở lõi:** `cd <lõi>/src && npm install`. Giao diện của các phần mềm KHÔNG tự `npm install` riêng (npm sẽ xoá bớt gói của bản cài chung).
3. **Nối `node_modules` cho từng FE:** ở thư mục dự án chạy `node scripts/fe-node-modules.mjs --link` (tạo LIÊN KẾT cục bộ `FE/node_modules` → bản cài ở lõi; liên kết này KHÔNG commit). Kiểm: `node scripts/fe-node-modules.mjs`.
4. **Lõi nằm chỗ khác bố cục chuẩn?** Tạo `platform.local.props` (KHÔNG commit) ở gốc từng repo phần mềm và thư mục dự án:
   ```xml
   <Project><PropertyGroup><PlatformRoot>ĐƯỜNG-DẪN-TỚI-LÕI-TRÊN-MÁY-BẠN</PlatformRoot></PropertyGroup></Project>
   ```
   hoặc đặt biến môi trường `PLATFORM_ROOT`. Công cụ `scripts/*` đọc cùng thứ tự: `platform.local.props` → `PLATFORM_ROOT` → `workspace.json → platform.path`. Không tìm thấy lõi thì thông báo nêu RÕ các nơi đã thử.
5. **Bí mật từng máy:** mỗi host API có `.env.example` (chỉ tên khoá). Chép thành `.env` cạnh API rồi điền giá trị thật — `.env` đã `.gitignore`. `DOTENV_PATH` (biến môi trường) chỉ tới một tệp `.env` ở chỗ khác nếu muốn mỗi dự án / môi trường một tệp riêng.
6. **Kiểm cả bộ:** ở thư mục dự án `node scripts/check-apps.mjs`, `node scripts/check-ports.mjs`, `node scripts/config-sync.mjs`, `node --test scripts/`; ở từng repo phần mềm `dotnet build` + `dotnet test`.

## Nhiều dự án dùng chung một lõi trên cùng máy

Lõi tự tìm dự án qua `workspace.json`; có **từ hai dự án** cạnh lõi thì công cụ chạy từ LÕI không đoán được — đặt `PTCORE_PROJECT_ROOT=<thư mục dự án>` cho từng lệnh (đừng đặt chung cả phiên). Cổng dev của các dự án không được trùng nhau nếu chạy cùng lúc: xem [deploy/bang-cong-dev.md](deploy/bang-cong-dev.md).

## Việc còn lại sau khi dựng khung (chuỗi chuẩn D-CORE-165)

Chép SRS vào `<repo phần mềm>/doc/` → ở lõi `/arch-init "<Tên>" --app <Mã> --tai-lieu "<đường dẫn doc>"` → thiết kế nghiệp vụ cùng AI → `/arch-features` → `/plan-modules` → `/gen-module NN`. Song song (không có skill): đăng ký phần mềm ở SSO (điền `sso_code`, `sso_app_id` trong `app.yaml`), cấp `.env`, chạy script `adm` đã sinh sẵn ở `<repo phần mềm>/scripts/sql`, cổng / tên miền / gateway.
