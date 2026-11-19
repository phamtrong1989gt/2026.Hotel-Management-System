---
description: "Stack: bật / tắt / khởi động lại / xem trạng thái bộ dịch vụ DEV (SSO, File API, BDS Linked, PMKT Linked, gateway, 3 FE) bằng MỘT lệnh `scripts/dev-stack.ps1` — chỉ tắt đúng tiến trình do công cụ mở (theo PID), kiểm https thật, không đăng nhập, không gửi OTP, không ghi CSDL"
argument-hint: "<start|stop|restart|reset|status> [sso|file|bds|pmkt|gateway|fe-sso|fe-bds|fe-pmkt|all] [-NoBuild]"
---

Quản lý bộ dịch vụ DEV bằng `scripts/dev-stack.ps1` (PowerShell 5.1, thuần ASCII). Đối số của người dùng: `$ARGUMENTS`.

## Cách chạy

1. Đọc `$ARGUMENTS`. Rỗng ⇒ coi là `status`. Hành động hợp lệ: `start` · `stop` · `restart` · `status` (và `reset` = bí danh của `restart`); mục tiêu: `sso` · `file` · `bds` · `pmkt` · `gateway` · `fe-sso` · `fe-bds` · `fe-pmkt` · `all` (mặc định `all`); cờ `-NoBuild` (dùng bản đã build, không build lại).
2. Chạy ở thư mục DỰ ÁN (thư mục chứa `workspace.json` và `scripts/`; lõi không có `scripts/dev-stack.ps1`), bằng công cụ PowerShell:
   `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/dev-stack.ps1 <hành động> [mục tiêu …] [-NoBuild]`
3. `status` chạy ngay (vài giây). `start` / `restart` mất lâu (build API + biên dịch lần đầu của `ng serve` có thể tới ~5 phút): chạy NỀN (`run_in_background`) với `timeout` dài, KHÔNG poll, chờ thông báo hoàn tất, rồi chạy `status` để chốt kết quả.
4. Báo cáo cho người dùng: bảng trạng thái (dịch vụ · cổng · nghe · TLS · PID), mục nào KHÔNG lên kèm vài dòng cuối của nhật ký (`src/Services/Sso/scripts/.local/dev-stack-*.out.log`, `*.err.log`, hoặc nhật ký của script start tương ứng).

## Bảng dịch vụ (https — quy tắc D-CORE-96: localhost luôn https)

| Mục tiêu | Dịch vụ | Cổng | Bật bằng |
|---|---|---|---|
| `sso` | SSO API | 5101 | `src/Services/Sso/scripts/start.ps1 -Snapshot [-Build]` (kiểm OTP giả, dừng nếu OTP thật bật) |
| `file` | File API | 5601 | `dotnet publish` ra `.local/file-api-bin` rồi chạy `dotnet File.Api.dll` (https); cần tệp client `.local/file-api.clients.json` (chỉ BĂM token — thiếu thì script dừng và chỉ tới `docs/deploy/file-api.md`); BDS / PMKT lưu mọi tệp qua dịch vụ này (D-CORE-118) nên PHẢI bật trước chúng |
| `bds` | BDS Linked API | 5021 | `src/Apps/BDS/scripts/a06-linked-start.ps1` |
| `pmkt` | PMKT Linked API | 5421 | `src/Apps/PMKT/scripts/pmkt-linked-start.ps1` |
| `gateway` | Gateway | 5201 | build ra `.local/gateway-bin` rồi chạy, cụm dịch trỏ https 5101 / 5021 / 5421 |
| `fe-sso` · `fe-bds` · `fe-pmkt` | FE `ng serve` | 4300 · 4220 · 4620 | `npm run start` / `start:linked` (có ghi PID) |

Thứ tự bật: SSO → File API → BDS → PMKT → gateway → FE. Thứ tự tắt: ngược lại. Tắt luôn đi qua `src/Services/Sso/scripts/stop.ps1 -Only <khoá>`, đọc PID từ `src/Services/Sso/scripts/.local/state.json`.

## LUẬT BẮT BUỘC

- **KHÔNG BAO GIỜ tắt tiến trình theo tên** (`taskkill /IM`, `Stop-Process -Name`, `pkill`…) và không tự `kill` PID lạ. Chỉ `dev-stack.ps1 stop` (đối chiếu tên + giờ bắt đầu của PID đã ghi). Mục đang chạy mà KHÔNG do công cụ mở (script báo "KHÔNG do cong cu nay mo") ⇒ giữ nguyên, nói với người dùng cách tắt (Ctrl+C / đóng cửa sổ / TaskStop nếu chính phiên này mở bằng shell nền).
- **Không đăng nhập vào giao diện, không gửi OTP, không ghi CSDL.** Sau khi SSO lên, đọc dòng log `OTP Enabled=…` (script đã làm): `Enabled=True` + `DeliveryMode=Live` ⇒ DỪNG và báo — đăng nhập thử sẽ gửi email THẬT. Máy chủ dev dùng chung `10.0.68.72` — không chạy lệnh nào ghi lên đó từ skill này.
- **Trước `restart` / `stop`:** nếu có tác nhân phụ / phiên khác đang chạy kiểm thử trên stack (xem `ListAgents`, hoặc người dùng nói), HỎI trước — đừng tắt dưới chân họ. `restart all` làm gián đoạn mọi phiên đăng nhập đang mở.
- **Thứ tự khi đổi cấu hình đăng nhập (client OIDC, issuer, địa chỉ https):** đăng ký lại client ở SSO (ghi CSDL — cần người dùng nói "chạy") TRƯỚC khi `restart`; khởi động lại trước đó thì đăng nhập hỏng.
- **FE:** script chỉ chạy `ng serve`, KHÔNG build bản phát hành (hook của dự án chặn lệnh build FE). Chứng chỉ https của `ng serve` PHẢI được tin (HSTS không cho bỏ qua cảnh báo): `status` hiện `TLS LOI` ở FE ⇒ FE đang phục vụ http thường hoặc chứng chỉ chưa tin — báo người dùng, đừng tự `dotnet dev-certs https --trust` (cần UAC, việc tay của coder).
- Gateway, FE chỉ tắt được khi do `dev-stack.ps1` mở. Dịch vụ do shell nền của một phiên Claude mở (không ghi PID) cần tắt bằng `TaskStop` của chính phiên đó.
- `pmkt` / `fe-pmkt` có thể không lên khi PMKT chưa đăng ký client ở SSO (`src/Apps/PMKT/BE/App.Api.PMKT/.env` thiếu khoá riêng) — đó là điều kiện thiếu, không phải lỗi công cụ; nói rõ và chỉ tới `docs/deploy/chay-thu-pmkt-linked.md`.

## Ví dụ

- `/stack status` — xem cả bộ.
- `/stack restart sso bds` — khởi động lại SSO và BDS Linked (build lại).
- `/stack start fe-bds fe-sso` — bật hai FE.
- `/stack stop all` — tắt tất cả những gì công cụ đã mở.
- `/stack restart all -NoBuild` — khởi động lại cả bộ không build.

## Kiểm "chạy được chưa" (smoke test chỉ-đọc)

Sau `status`/`start`, chạy `node scripts/smoke-stack.mjs` (không đăng nhập, không POST, không đọc bí mật; tuỳ chọn: `--require sso,bds` buộc dịch vụ phải lên · `--only <khoá,…>` · `--json [tệp]` · `--ascii`; khoá hợp lệ: `sso` `file` `bds` `pmkt` `gateway` `fe-sso` `fe-bds` `fe-pmkt` hoặc `all`). Kiểm cổng + TLS (kể cả chứng chỉ có được tin), discovery/JWKS của SSO, 401 gọn của API, File API (`/healthz` ẩn danh trả "ok"; xác thực BẬT: không token ⇒ 401; không dò được tên client; tiêu đề an toàn — toàn bộ KHÔNG mang token, 2 lệnh không token tính là 2 lần xác thực thất bại của IP 127.0.0.1 nên đừng chạy liên tục ≥ 5 lần trong 5 phút), FE (`<app-root>`, main/polyfills, baseApiUrl, CSP), gateway (phân biệt backend chết với gateway sai), client OIDC của BDS/PMKT qua `SsoStart`. Dịch vụ chưa bật = SKIP; có FAIL ⇒ mã thoát 1; chi tiết ở đầu `scripts/smoke-stack.mjs`, tự kiểm: `node --test scripts/smoke-stack.test.mjs`.
