# Bảng cổng dev — Hotel Management System

Nguồn DUY NHẤT cho cổng dev của dự án; `node scripts/check-ports.mjs` đối chiếu bảng này với `app.yaml → ports`, `Properties/launchSettings.json`, `FE/angular.json`, `FE/src/environments/environment*.ts`.
Mọi dịch vụ dev dùng **https** (`localhost` luôn https — D-CORE-96); cổng http chỉ để chuyển hướng.

## 1. Quy tắc

- **BE** = 5000 + 100 × (khối − 50) · bản **agent** cộng 10 · https = http + 1 · **FE** = BE http − 800. Mỗi phần mềm MỘT khối.
- **Cổng cố định của dịch vụ lõi** (dùng chung nhiều dự án trên một máy — dự án KHÔNG được đặt trùng): SSO `5100/5101` (agent `5110/5111`), FE SSO `4300` (agent `4310`) · Gateway `5200/5201` (agent `5210/5211`) · `mini-rp` `5300` · File API `5601` (https). Dải dành riêng cho máy chủ luồng: `8000–8999`, `9900–9999`.
- Khối của phần mềm mới do `new-project` chọn là khối **chưa dùng** theo các dự án đang có cạnh lõi trên máy dựng; đây là cổng **ĐỀ XUẤT, coder duyệt**. Dự án khác trên MÁY KHÁC có thể trùng số — chỉ cần khác nhau khi chạy cùng lúc trên một máy.
- Đổi cổng = sửa ĐỦ ba nơi: bảng dưới · `app.yaml → ports` · `launchSettings.json` / `angular.json` / `environment*.ts`, rồi `node scripts/check-ports.mjs`.

## 2. Bảng cổng

| Thành phần | BE http | BE https | FE (Angular) | Tên miền dev | Ghi chú |
|---|---|---|---|---|---|
| PMS — máy coder | 5700 | 5701 | 4900 | — | ĐỀ XUẤT khối 57xx, coder chưa duyệt (chế độ Linked) |
| PMS — stack agent | 5710 | 5711 | 4910 | — | Chưa có stack agent riêng |
