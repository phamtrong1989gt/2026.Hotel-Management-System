# App.Modules.PMS

**NGHIỆP VỤ CỦA PHẦN MỀM PMS** (Property Management System) — hiện là **KHUNG TRỐNG** (dựng 2026-11-20 bằng `_bmad/tests/new-project.mjs`): chưa có entity, bảng, dịch vụ hay controller nào.
Đây là nơi lập trình viên của phần mềm viết mã; lõi không biết gì về nó. Hồ sơ thiết kế nghiệp vụ nằm ở `doc/` (SRS, do dev chép vào) và `_contracts/` (`/arch-init` dựng khung).

**Cần:** `Identity` · `Category` · `FileStorage` · `Notification` · `AuditLog`.
**Được dùng bởi:** `App.Api.PMS` — **không module lõi nào** được phép tham chiếu tới đây (gate `ModuleDependencyRulesTests`).

## Hiện có gì

| Tệp | Vai trò |
|---|---|
| `PmsModule.cs` | `AddPmsModule()` — hiện chỉ đăng ký `IDepartmentUsageChecker` (hợp đồng bắt buộc của lõi). Mỗi entity mới: thêm repository + dịch vụ ở đây |
| `Persistence/IPmsDbContext.cs` | Lát cắt DbContext — hiện rỗng; `OperationalContext` (host) kế thừa nó. Thêm bảng = khai `DbSet` ở đây |
| `Persistence/PmsDepartmentUsage.cs` | Bản cài `IDepartmentUsageChecker` — hiện trả rỗng (chưa có bảng nào tham chiếu đơn vị) |
| `Domain/` | `.gitkeep` giữ thư mục — gate bố cục đòi module có `Persistence` thì phải có `Domain` |

## Quy ước

- Bảng nghiệp vụ ở lược đồ `dbo`, khai tường minh `ToTable("X", "dbo")` (gate `AppSchemaRulesTests`).
- Mọi thay đổi dữ liệu ghi nhật ký (`ILogService`) trước khi lưu; mọi hàm có chú thích XML (làm gì, tham số, trả về, tác dụng phụ).
- Kho tệp CHỈ qua File API.
- Sinh module bằng chuỗi `/arch-init` → thiết kế → `/arch-features` → `/plan-modules` → `/gen-module NN`.
