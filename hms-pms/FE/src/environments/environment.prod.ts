import { cryptoBootstrapKeyOverride } from './crypto-bootstrap-key';

// ⚠ CHƯA CÓ DOMAIN PHÁT HÀNH của PMS (dev tự yêu cầu — chưa chốt). `baseApiUrl` / `baseReportUrl` dưới là địa chỉ GIỮ CHỖ trên tên miền `.invalid` (RFC 2606: không bao giờ phân giải được) để
// scripts/web-config-build.mjs (chạy ở postinstall / prebuild) dựng được CSP mà `npm ci` không vỡ; bản build production mang giá trị này KHÔNG gọi được API (lỗi mạng rõ ràng, không gọi nhầm máy lạ).
// Khi dev chốt domain: thay hai địa chỉ + `ssoPortalUrl` (https, không có "/" cuối) rồi build lại; bản UAT dùng environment.uat.ts do công cụ triển khai sinh (bị .gitignore, KHÔNG commit).
// KHÔNG khai `deploymentMode`: FE tự hỏi API chế độ nào (Standalone hay Linked); phần mềm chỉ chạy Linked có thể thêm `deploymentMode: 'Linked'` để biết ngay từ lúc build.
export const environment = {
  production: true,
  baseApiUrl: 'https://api.pms.invalid',
  baseReportUrl: 'https://api.pms.invalid',
  // Khóa MỒI seal request bootstrap. Là PUBLIC key nên nhúng vào bundle là an toàn (mỏ neo tin cậy: chỉ máy chủ giữ private key tương ứng mới trả nổi phản hồi bootstrap hợp lệ). Xem D-CORE-09.
  //
  // ⚠️ Trước khi deploy, `.env` cạnh App.Api.PMS.dll phải có private key ĐÚNG CẶP với public key dưới:  Crypto__Admin__PrivateKey = <base64 PKCS#8>. Lệch cặp / thiếu thì API trả 400 cho mọi request.
  //    kid tự suy ("k-" + 16 hex đầu SHA-256 của SPKI; khoá dưới → k-5a4c3eb15dba6ec8).
  //    D-CORE-87 (tách khoá theo ứng dụng): chuỗi dưới là KHOÁ MẶC ĐỊNH CỦA KHO (dùng chung mọi phần mềm dựng từ lõi, không thể là khoá riêng của dự án nào). Dự án thật nạp khoá riêng LÚC ĐÓNG GÓI —
  //    `npm run crypto:set-key` (biến CRYPTO_BOOTSTRAP_PUBLIC_KEY_SPKI_B64) ghi `crypto-bootstrap-key.generated.ts` (bị .gitignore); angular.json (production) thay `crypto-bootstrap-key.ts` bằng tệp đó
  //    nên `cryptoBootstrapKeyOverride` mang khoá riêng. Chưa nạp ⇒ null ⇒ dùng chuỗi dưới như cũ. KHÔNG commit khoá của dự án vào đây. Quy trình: docs/security/xoay-khoa-rsa.md ở thư mục dự án.
  cryptoBootstrapPublicKeySpkiB64:
    cryptoBootstrapKeyOverride ?? 'MIIBojANBgkqhkiG9w0BAQEFAAOCAY8AMIIBigKCAYEA0G2zqkeu641lz7G3rGmVFKT/6AVZGlRaIVy5yTIDkNErpBwBF6hHvApf8k5R/rbrNCxIq6O796cX6StgMWVWeOGKj5QVNqHsvpW+knmm4O06ezFYlcdIgrJmnQAjQuVyeV0w9x0TXZnZKWkoKv7lsPy3KpdSHSaWdxA5GMl5ofhl6juio+f0I+vL+FrxKm5cMw6UluR/HE39104rBHG3pHrodETdFT2fnuuPfSs1AAkdnJlFHa4AgxN9yd9molYXCKi44uVJZBtWCds7M/ydPVEx67b6VBEZp6baW7aEKR/Lm31rSrPu7tMONsY4lu7WeoYM7N3Q860ZtkPznIOsoEKWTzWdKGkv+EwOCpr/UNU9UDW/vvbFr7AzNNxEHTZDCIoodyrtM5YX2FJ698/f+v0eUn9tlUDd8H7OuRdXH1xnCkxcpIkBr9qlW6+xDjU2+vT7w/+b8NXvOvvkK7lUfP3qVPOROE4W/XjKWZXcyLoO17bjJ+sJYwHwXWaYuJ5lAgMBAAE=',
  // CSP CHẶN THẬT: nguồn THÊM cho connect-src do người triển khai khai — scripts/web-config-build.mjs đọc khi build.
  // Bật đăng nhập một lần (SSO Linked) thì PHẢI thêm origin của "Authority" (+ origin của token_endpoint nếu khác máy), vd 'https://id.donvi.example' — thiếu là nút SSO báo "Không kết nối được hệ thống danh tính". Chỉ URL https đầy đủ.
  cspExtraConnectSrc: [] as string[],
  // Địa chỉ cổng giao diện SSO cho nút "Mở cổng SSO" — để rỗng tới khi dev chốt tên miền SSO (rỗng ⇒ ẩn nút).
  ssoPortalUrl: '',
};
