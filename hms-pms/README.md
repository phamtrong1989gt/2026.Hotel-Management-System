# PMS — Property Management System

Phần mềm **PMS** của dự án **Hotel Management System** (chế độ triển khai mặc định: **Linked**). Repo này là **KHUNG TRỐNG** dựng ngày 2026-11-20 bằng `_bmad/tests/new-project.mjs` của lõi nền tảng: đủ cấu hình, build xanh, CHƯA có entity / controller / module nghiệp vụ nào.

## Bố cục

| Thư mục / tệp | Vai trò |
|---|---|
| `app.yaml` | Hồ sơ ứng dụng (nguồn chân lý máy đọc): mã, cổng, đường dẫn logic. `sso_code` / `sso_app_id` để `null` tới khi đăng ký ở SSO |
| `BE/App.Api.PMS` | Host API — mỏng, phần lớn việc khởi động nằm ở `PTCore.Host` của lõi |
| `BE/Modules/App.Modules.PMS` | Module nghiệp vụ (hiện rỗng) |
| `BE/Tests/App.Tests.PMS` | Gate kiến trúc (bố cục module · lược đồ `dbo`) |
| `FE` | Giao diện Angular (vỏ, chưa có màn nghiệp vụ) — xem `FE/README.md` |
| `_contracts` | Hồ sơ hợp đồng (`/arch-init` dựng `_architecture` + `_plan` ở đây) |
| `doc` | CHỖ DEV CHÉP thư mục SRS (md) vào — nguồn đầu vào cho `/arch-init --tai-lieu` |
| `scripts/sql` | Script SQL của riêng phần mềm (D-CORE-173). Đã có sẵn script tạo các bảng `adm` (xem `scripts/sql/README.md`) |
| `TN.HMS.PMS.slnx` | Solution của repo (build + test chạy ở đây) |

## Build / test

```
dotnet build TN.HMS.PMS.slnx
dotnet test  BE/Tests/App.Tests.PMS/App.Tests.PMS.csproj
```

Lõi nền tảng phải nằm ở `../../0.Core` tính từ repo này (bố cục chuẩn: các repo của dự án nằm cạnh nhau, lõi nằm ngoài). Khác vị trí ⇒ tạo `platform.local.props` (KHÔNG commit) khai `<PlatformRoot>`, hoặc đặt biến môi trường `PLATFORM_ROOT`. Máy mới clone: xem `docs/README.md` của thư mục dự án.

## Chạy API lần đầu (đã thử thật trên khung này)

1. CSDL: tạo một CSDL nghiệp vụ, chạy script `adm` ở `scripts/sql` (đặt `@ConfirmDb`, chạy `@DryRun = 1` trước, rồi `@DryRun = 0`).
2. `.env`: chép `BE/App.Api.PMS/.env.example` → `.env` (cạnh API, đã `.gitignore`) rồi điền: chuỗi kết nối `ConnectionStrings__OperationalConnection`; `ApiSettings__TokenKey` (≥ 32 ký tự) · `BaseSettings__EncryptionKey` (≥ 16) · `Crypto__PartnerKeyEncryptionKey` (base64 của đúng 32 byte) — mỗi phần mềm một giá trị riêng; **`Crypto__Admin__PrivateKey` = RSA PKCS#8 từ 3072-bit trở lên** (nhỏ hơn thì API từ chối khởi động); thay mọi chỗ `<…>` (cổng, địa chỉ). `.env.example` do lõi sinh mặc định `Deployment__Mode=Linked`; phần mềm Standalone đã được đổi sẵn thành `Standalone`.
3. Chế độ **Linked** còn cần `Deployment__AppId`, `Deployment__SsoClient__*` (ClientId · KeyId · PrivateKey RSA do SSO cấp cho phần mềm này) và `AuthorizeSettings__TokenSettings__RefreshTransport=Cookie`; chưa đăng ký ở SSO thì API từ chối khởi động (đúng thiết kế).
4. Chạy: `dotnet run --project BE/App.Api.PMS --no-launch-profile` (hồ sơ mặc định tự mở trình duyệt) với `ASPNETCORE_URLS=https://localhost:5701`. Chưa đăng nhập thì mọi route trả 401, `/scalar` chuyển hướng, `/swagger/v2/swagger.json` trả 200; nhật ký ở `BE/App.Api.PMS/logs/diag/` (dòng «Mức tương thích CSDL … đạt» = đã nối được CSDL).
5. Giao diện: ở thư mục dự án `node scripts/fe-node-modules.mjs --link`, rồi trong `FE`: `npm run start` (cổng 4900). KHÔNG `npm install` trong `FE`.

## Bước kế tiếp (chuỗi chuẩn D-CORE-165)

1. Chép thư mục SRS (md) vào `doc/`.
2. Ở lõi: `/arch-init "Property Management System" --app PMS --tai-lieu "<đường dẫn thư mục doc>"`.
3. Thiết kế nghiệp vụ cùng AI → `/arch-features` → `/plan-modules` → `/gen-module NN`.
4. Việc hạ tầng song song (không có skill): đăng ký phần mềm ở SSO (điền `sso_code`, `sso_app_id`), cấp `.env` (xem `BE/App.Api.PMS/.env.example`), chạy script `adm` ở `scripts/sql`, đăng ký tuyến gateway, khoá bí mật RIÊNG cho phần mềm.
