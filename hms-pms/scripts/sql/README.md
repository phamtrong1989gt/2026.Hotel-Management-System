# scripts/sql — script SQL của phần mềm PMS (D-CORE-173)

Script SQL của phần mềm nằm Ở ĐÂY (repo phần mềm), không ở lõi hay thư mục dự án. Tên `YYYY-MM-DD_việc-làm.sql`; mỗi script idempotent, chỉ THÊM, KHÔNG khoá ngoại vật lý, ghi sổ `adm.SchemaVersion`.
Công cụ dựng khung KHÔNG chạy SQL và KHÔNG nối CSDL nào — script do dev đọc, chạy thử rồi chạy thật.

## Đã sinh sẵn: bảng lõi schema `adm` của CSDL nghiệp vụ

| Tệp | Nội dung |
|---|---|
| `2026-11-20_adm-tables-for-app-db.sql` | Tạo các bảng lõi `adm.*` trong CSDL nghiệp vụ của PMS — chế độ **Linked** (bảng đồng bộ từ SSO + bảng lưu local + hai bảng của module SsoClient; số bảng và danh sách ghi ở đầu tệp) |

Script được SINH từ mô hình EF của lõi nền tảng **7.0.0** (đừng sửa tay):
- Lõi nâng bản (MINOR có thêm bảng / cột `adm`) ⇒ sinh lại: `node scripts/gen-adm-script.mjs --app PMS --out <tệp mới>` (chạy ở thư mục DỰ ÁN), rồi so với script cũ và chạy phần chênh.
- Chạy: mở tệp, SỬA `@ConfirmDb` = đúng tên CSDL nghiệp vụ, `@DryRun = 1` chạy thử (làm hết rồi ROLLBACK, in những gì sẽ tạo), duyệt xong đặt `@DryRun = 0` để chạy thật. Dòng lệnh mẫu có ngay ở đầu tệp.
- An toàn: chỉ chạy trên CSDL **nghiệp vụ** của phần mềm (tự từ chối nếu thấy `adm.IdpSession` / `adm.App` — dấu hiệu CSDL SSO). Bảng đã có thì giữ nguyên.

## Bảng nghiệp vụ `dbo.*`

Do `/migrate` (hoặc `/gen-module`) sinh khi có module: một script mỗi việc, chung thư mục này.
