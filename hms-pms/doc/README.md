# doc — hồ sơ nghiệp vụ đầu vào của PMS

Thư mục này dành cho **dev chép thư mục SRS (md) vào** — tài liệu yêu cầu / nghiệp vụ do bên phân tích cấp. Công cụ KHÔNG sinh gì ở đây.

Sau khi chép xong:

```
# ở thư mục LÕI nền tảng
/arch-init "Property Management System" --app PMS --tai-lieu "<đường dẫn thư mục này>"
```

`/arch-init` dựng `_contracts/_architecture` (khung kiến trúc nghiệp vụ) rồi chỉ bước kế tiếp: thiết kế cùng AI → `/arch-features` → `/plan-modules` → `/gen-module`.

Gợi ý bố cục (không bắt buộc): `inputs/` (tài liệu gốc), `deliverables/`, `screenshots/`, `wireframes/`. Tệp nhị phân lớn (ảnh, PDF) cân nhắc để ngoài git.
