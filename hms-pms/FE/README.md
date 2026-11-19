# FE của PMS — Property Management System

Giao diện Angular của phần mềm PMS thuộc dự án Hotel Management System (HMS) — gói npm `gradus-pms`, mã `PMS`, namespace lưu trữ trình duyệt `pms`. **Trạng thái (2026-11-20): VỎ RỖNG** do `/new-project` dựng: khung đăng nhập (qua SSO hoặc cục bộ — FE tự hỏi API chế độ nào), khung layout (thanh bên, menu do máy chủ trả theo quyền, thanh công cụ), Bàn làm việc, trang lỗi, các module chung của lõi (nhật ký hành động, thông báo, cấu hình hệ thống, giám sát, danh mục hành chính, tài khoản) — **chưa có màn nghiệp vụ nào**. Màn nghiệp vụ do `/gen-module` sinh vào `src/app/features/main/`.

FE dùng nguồn chung `src/Core/FE` của lõi (platform + module chung; D-CORE-81 / D-CORE-84): **không chép** `platform/` hay module chung vào đây — đọc `README.md` của `src/Core/FE` (lõi). Đường dẫn tới lõi tính từ thư mục FE này là `../../../0.Core` (khai ở `fe-app.json → kit`, `tsconfig.json`, `angular.json`, `package.json`).

## Chạy dev

| Việc | Lệnh / điều kiện |
|---|---|
| Cài gói (MỘT lần, ở thư mục `src` của lõi) | `npm ci` — npm workspaces của lõi: một `node_modules` + một `package-lock.json` hoist cho mọi FE; thư mục `node_modules` của FE này là liên kết tới bản hoist đó (công cụ của dự án tạo — xem tài liệu bố cục kho tách của dự án). `postinstall` sinh i18n gộp, ví dụ doc-v3, `web.config`, asset monaco (các thư mục sinh bị `.gitignore`) |
| Chứng chỉ dev (MỘT lần mỗi máy) | `dotnet dev-certs https --trust` (việc TAY của coder). Kiểm: `node ../../../0.Core/src/Core/FE/tools/ensure-dev-cert.mjs --check`. `ng serve` dùng cặp PEM `../../../0.Core/src/.local/certs/localhost.pem|key` xuất từ chính chứng chỉ ASP.NET (D-CORE-96 «localhost luôn https») |
| API | `BE/App.Api.PMS`: hồ sơ `launchSettings` `App.Api.PMS` → `https://localhost:5701`; `.env` cạnh host PHẢI có `ApiSettings__UseCors` = `ApiSettings__PublicWebUrl` = `https://localhost:4900` và `Crypto__Admin__PrivateKey` ĐÚNG CẶP khoá công khai nhúng ở `src/environments/environment*.ts` (xem «Khoá RSA mồi») |
| FE (coder) | `npm start` → **`https://localhost:4900`** (`prestart` sinh lại i18n / ví dụ / web.config / monaco và kiểm chứng chỉ; CSP chỉ báo, không chặn). Muốn FE biết ngay mình là Linked (API chạy `Program.Deployment = Linked`): `npm run start:linked` (cùng cổng, CSP chặn thật) |
| FE (stack agent) | `npm run start:agent` → `http://localhost:4910` (http; gọi API agent `https://localhost:5711`; CSP chặn thật) |

Cổng do `/new-project` chọn theo bảng cổng dev của dự án (ĐỀ XUẤT, coder duyệt): API http/https · FE `4900` · stack agent `5711` / `4910`. Đổi cổng thì đổi đồng bộ `angular.json` (cổng + CSP của `serve.*`), `launchSettings.json` của API, `environment*.ts`.

Lệnh biên dịch (`npm run build`, `ng build`…) chạy ở terminal của coder; phiên Claude chỉ chạy kiểm tĩnh (mục «Cổng kiểm»).

## Cấu trúc

```
FE/
  fe-app.json            hồ sơ nối nguồn chung: { app: PMS, kit, storageNamespace: pms, sharedModules[7] } — KHÔNG có storage-explorer (xem dưới)
  tsconfig.json          alias @platform @core @ui @layout @theme → nguồn chung; @modules → cục bộ TRƯỚC, chung SAU; @features → src/app/features
  angular.json           project `pms`; build: production · uat · development · linked · agent; serve: development (https 4900) · linked (https 4900) · agent (http 4910) · production
  scripts/               các cổng `check-*.mjs` + công cụ build (i18n-build · examples-build · web-config-build) — dùng lớp overlay `fe-overlay-fs.mjs` của lõi để thấy nguồn chung như thể nằm trong ứng dụng
  public/                tài sản tĩnh nguồn chung tham chiếu (favicon, logo mặc định, ảnh nền xác thực, avatar mặc định) — xem «Việc còn lại của vỏ»
  src/environments/      environment.ts (dev, trung tính) · .linked.ts · .agent.ts · .prod.ts (domain CHƯA chốt ⇒ `api.pms.invalid`) · crypto-bootstrap-key.ts
  src/app/
    app.config.ts        providers (storage namespace `pms`, HTTP interceptors, SSO client, …)
    app.routes.ts        đăng nhập (SsoLoginEntryGuard), /sso-return, /logged-out, /error, `manage/:roleCode` (AuthGuard) → features/pages.routes
    features/
      pages.component.*  khung layout (thanh bên, menu từ máy chủ, thanh công cụ) — khuôn lõi
      pages.routes.ts    mount các module chung + `...MAIN_ROUTES` (KHÔNG sửa khi thêm màn)
      main/main.routes.ts  ⭐ bảng route của module nghiệp vụ App.Modules.PMS — NƠI DUY NHẤT khai route màn nghiệp vụ (hiện rỗng)
      shared/            dùng chung giữa các module nghiệp vụ của PMS (nhãn / bảng màu / hàm giúp) — hiện rỗng
      landing-page/ · error/  khung trống / trang lỗi (khuôn)
    modules/             module CỤC BỘ (rỗng)
```

`storage-explorer` KHÔNG nằm trong `sharedModules`: vỏ mới chưa lưu tệp qua File API. Phần mềm có tải tệp lên thì khai `storage-explorer` ở `fe-app.json → sharedModules` rồi thêm `...STORAGE_EXPLORER_ROUTES` vào `pages.routes.ts`.

## Thêm màn của một module

Menu do máy chủ trả theo quyền (`adm.RoleController` đã đăng ký); FE KHÔNG tự khai menu. `RouterLink` của mỗi mục = kebab tên controller = `path` của route FE.

1. **Route:** thêm MỘT khối vào `src/app/features/main/main.routes.ts` (`MAIN_ROUTES`) — `{ path: '<kebab>', loadComponent: () => import('./<kebab>/<kebab>.component').then(c => c.<Pascal>Component), data: { breadcrumb: '' } }` (route con: `loadChildren` tới `<kebab>.routes.ts` của module). KHÔNG route `:id` / `create` / `edit`; KHÔNG sửa `pages.routes.ts` / `app.routes.ts` / `app.config.ts`.
2. **Thư mục màn:** `src/app/features/main/<kebab>/` (module chính `Main` ↔ `features/main`, D1 của khung; cổng `check:module-parity` có ALLOW `main`). Danh sách CRUD kế thừa `BaseMainModuleComponent` / `StatusListBaseComponent` ⇒ có nút Lịch sử (`check:history`), nút `g-button`, control `ct-*` (`check:controls`), mọi hàm có chú thích (`check:method-docs`), cột đầu STT (`check:cells`).
3. **i18n:** `src/app/features/main/<kebab>/i18n/{vi,en}.json` — khoá gốc = tên module kebab (đủ vi + en, không trùng nơi khác).
4. **KHÔNG** sửa nguồn chung `src/Core/FE/**` của lõi, `fe-app.json`, `angular.json`, `environments/`, `package.json` khi sinh màn; cần control / cell chưa có thì ghi vấn đề cho phiên lõi (R-fe.27).

## Cổng kiểm

`npm run check` chạy tuần tự (gate đỏ đầu tiên dừng chuỗi; `npm run check:all` chạy hết rồi tổng hợp):

- Của lõi (chạy từ `src/Core/FE/tools`): `check-platform-sync` (PS-*) · `check-storage` (STORE-*) · `check-fe-security` (SEC-FE-*) · `check-crypto-key` (CK-*).
- Của FE (thư mục `scripts/`): `check-architecture` · `check-module-parity` · `check-cells` · `check-platform-glue` · `check-envelope` · `check-examples` · `check-controls` · `check-ui-rules` (luật `UI-RULES.md`) · `check-history` · `check-doc-v3` · `check-i18n` · `check-dependent` · `check-method-docs` · `check-export` · `check-unit` (mọi `*.test.mjs` của FE + của nguồn chung).

Kiểm kiểu (không build): `npx ngc -p tsconfig.app.json --noEmit`.

## Khoá RSA mồi

`cryptoBootstrapPublicKeySpkiB64` trong `environment*.ts` là khoá CÔNG KHAI dùng seal request bootstrap. Vỏ mới mang **khoá MẶC ĐỊNH CỦA KHO** (dev: `environment.ts` · `.linked.ts` · `.agent.ts`; prod: `environment.prod.ts`) — dùng chung mọi phần mềm dựng từ lõi, nên cổng `check:crypto-key` CK-08 chỉ nhắc ⚠ (không đỏ). Phần mềm thật nạp khoá RIÊNG lúc đóng gói (`npm run crypto:set-key`) hoặc đổi sang cặp riêng: sinh cặp mới, thay khoá công khai ở `environment*.ts` + `Crypto__Admin__PrivateKey` trong `.env` của API CÙNG LÚC, khai kid mới vào `src/Core/FE/crypto-repo-default-keys.json` + `RepoDefaultRsaKeys.cs` của lõi (CK-06 / CK-07). Quy trình: `docs/security/xoay-khoa-rsa.md` ở thư mục dự án (nếu dự án chưa có tệp này, làm theo các bước ngay phía trên).

## Việc còn lại của vỏ

- **Ảnh thương hiệu mặc định:** `public/img/back_login.jpg` (nền trang xác thực) · `public/img/tn/logo2.png` (logo trang đăng nhập khi chưa có thương hiệu) · `public/img/logo/logo_tn.png` · `public/img/users/default-user.jpg` (avatar mặc định) · `public/favicon.ico` · `src/assets/img/app/no-image.png` (ảnh thay khi ảnh lỗi) — vỏ KHÔNG kèm tệp nhị phân; thiếu thì chỉ mất ảnh (không lỗi build). Thương hiệu thật do máy chủ (Branding) cấp lúc chạy.
- **Domain phát hành:** `environment.prod.ts` mang địa chỉ giữ chỗ `.invalid` tới khi dev chốt tên miền (thay `baseApiUrl` / `baseReportUrl` / `ssoPortalUrl`, rồi build lại).
- **Bản UAT:** cấu hình `uat` của `angular.json` cần `src/environments/environment.uat.ts` do công cụ triển khai sinh (bị `.gitignore`); chưa có tệp thì chỉ `--configuration uat` báo lỗi.
