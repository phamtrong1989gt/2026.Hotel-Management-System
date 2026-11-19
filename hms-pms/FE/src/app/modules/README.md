# `src/app/modules/` — module CỤC BỘ của FE PMS (hiện RỖNG)

Thư mục này chỉ chứa module **cục bộ** của ứng dụng (đặc thù PMS mà chưa / không vào nguồn chung). Hiện PMS không có module cục bộ nào: mọi module dùng chung (`audit-log`, `operations`, `notification`, `sso-client`, `platform`, `category`, `identity`) nằm ở nguồn chung `src/Core/FE/modules/` của lõi và được khai ở `fe-app.json → sharedModules`; tsconfig tra thư mục này TRƯỚC, nguồn chung SAU (`@modules/*`).

- **Màn nghiệp vụ PMS KHÔNG đặt ở đây** mà ở `src/app/features/main/<module>/` (xem [../../../README.md](../../../README.md), mục «Thêm màn của một module»).
- Tên thư mục ở đây phải là đoạn cuối tên một project `src/Core/Modules/PTCore.Modules.*` của lõi (cổng `check:module-parity` MP-01).
- Sửa phần dùng chung: MỘT chỗ ở `src/Core/FE` của lõi theo quy trình R-fe.27 (`README.md` của `src/Core/FE`) — phiên FE của một phần mềm KHÔNG tự sửa.
