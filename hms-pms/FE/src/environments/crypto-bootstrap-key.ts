/**
 * Khoá RSA CÔNG KHAI nạp lúc ĐÓNG GÓI cho bản production (D-CORE-87 — tách khoá theo ứng dụng, mỗi dự án triển khai tự có khoá riêng).
 *
 * Vì sao có tệp này: khoá commit trong `environment.prod.ts` là "khoá mặc định của kho" — dùng chung nhiều ứng dụng / dự án nên không thể là khoá của một dự án nào. Dự án thật nạp khoá
 * riêng LÚC ĐÓNG GÓI mà không sửa tệp nào đã commit: `npm run crypto:set-key` (Core/FE/tools/set-bootstrap-key.mjs) ghi khoá vào `crypto-bootstrap-key.generated.ts` (bị .gitignore),
 * và `angular.json` (cấu hình production) THAY tệp này bằng tệp sinh đó (fileReplacements). `environment.prod.ts` đọc `cryptoBootstrapKeyOverride ?? <khoá commit trong kho>`.
 *
 * Giá trị ở ĐÂY luôn là `null` = chưa nạp khoá riêng ⇒ bản build dùng khoá commit trong kho (hành vi cũ, công cụ và cổng `check:crypto-key` nhắc bằng ⚠). KHÔNG sửa giá trị này bằng tay.
 * Đây là PUBLIC key (an toàn khi nằm trong bundle). TUYỆT ĐỐI không đặt private key ở đây. Quy trình: docs/security/xoay-khoa-rsa.md ở thư mục dự án.
 */
export const cryptoBootstrapKeyOverride: string | null = null;
