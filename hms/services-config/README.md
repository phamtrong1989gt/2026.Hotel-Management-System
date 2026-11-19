# services-config — cấu hình DÙNG CHUNG của dự án Hotel Management System

Khung rỗng. Hiện có:

| Tệp | Vai trò |
|---|---|
| `config-manifest.json` | Phần của DỰ ÁN trong luật cấu hình dùng chung (phần mềm nào dùng bản mẫu `appsettings.*.json` nào, tệp riêng từng phần mềm, mục đăng ký còn thiếu = `knownGap`). Đọc bởi `scripts/config-sync.mjs` và `ConfigParityTests` của lõi |

Thêm dần khi dự án cần (chưa sinh sẵn vì phụ thuộc quyết định hạ tầng của coder):

- `gateway/appsettings.Gateway.json` — tuyến + cụm của API Gateway cho các phần mềm (tên miền + SSL do coder chốt). Khi thêm: bỏ `knownGap` «gateway» của từng phần mềm ở `config-manifest.json`.
- `sso/sql/` — script đăng ký phần mềm / chức năng / vai trò ở máy chủ SSO (khuôn `_bmad/custom/templates/sql/sso-register-functions.sql` ở lõi; ghi CSDL SSO chỉ khi coder bảo «chạy»).
- Cấu hình `.env` / `DOTENV_PATH` từng dịch vụ: `.env.example` của từng host API do `node scripts/config-sync.mjs --sync` sinh; giá trị thật KHÔNG commit.
