// STACK RIÊNG của agent (tác nhân tự động) — chạy song song với stack của coder, KHÔNG đè cổng.
//   FE agent : http://localhost:4910   (coder: https://localhost:4900)
//   API agent: https://localhost:5711  (coder: https://localhost:5701)
// Kích hoạt: `npm run start:agent` (angular.json → configuration "agent" → fileReplacements).
// PHẢI là bản sao độc lập, KHÔNG `import` từ ./environment: fileReplacements thay module đó bằng chính file này. Khi environment.ts đổi (kid, SSO…), đồng bộ tay sang đây — chỉ khác ở baseApiUrl (và các dòng chú thích đầu tệp).
// Chế độ như environment.ts (không khai sẵn): muốn ĐĂNG NHẬP được ở stack agent khi API chạy Linked thì phải đăng ký client SSO cho địa chỉ nhận đăng nhập của API agent (https://localhost:5711/…) (việc ghi CSDL SSO do coder chạy).
export const environment = {
  production: false,
  baseApiUrl: 'https://localhost:5711',
  // Dịch vụ báo cáo: phần mềm chưa dùng — giữ khoá theo khuôn vì `provideApiBase` (app.config.ts) và scripts/web-config-build.mjs (CSP) đọc nó; cùng gốc với API nên CSP không mở thêm máy nào.
  baseReportUrl: 'https://localhost:5711',
  // Khóa MỒI để seal đúng request bootstrap GetPublicSecuritySettings — chính endpoint công bố kid hiện hành. Đây là RSA PUBLIC key: lộ ra là bình thường, KHÔNG suy ngược được private key.
  // Đây là khoá dev MẶC ĐỊNH CỦA KHO (D-CORE-87) — dùng chung mọi phần mềm dựng từ lõi, nên `.env` của API phải mang private key ĐÚNG CẶP với nó (hoặc đổi cả hai cùng lúc sang khoá RIÊNG của phần mềm:
  // sinh cặp mới, khai kid vào src/Core/FE/crypto-repo-default-keys.json + RepoDefaultRsaKeys.cs của lõi để cổng check:crypto-key CK-07 xanh — quy trình docs/security/xoay-khoa-rsa.md ở thư mục dự án). Lệch cặp ⇒ MỌI request của FE bị API từ chối (400).
  // kid tự suy ("k-" + 16 hex đầu SHA-256 của SPKI): FE và API cùng suy từ khoá, không có ô kid.
  cryptoBootstrapPublicKeySpkiB64:
    'MIIBojANBgkqhkiG9w0BAQEFAAOCAY8AMIIBigKCAYEAtS+d3iv3eyxIj2/XOnUOPe3/QlWtDq0FITdpOAKGuP2UscBXZhVMwYV3wOxWqsFNGttlOYxy4Ie8FdQnoZY2T77ACuI8KWIakoyIeii4KyAFo+xDGnOXj6jt0OChVsbSkiEQeF6fjcCi+Ai8pl85KEeMU5du2fz1Sf178He8Wu+AVXtaZcXjMQ+d/VQE2xApuqAtzdfelPPEl6lFYng6iokQpFTxLyGSzawgsa3yAh2XFn1SBGav6wNbNNzbOhkhRRnBbsjjp3TSuR/E/mZc0nW6zSEVFsz7gEyH+++o51fFry26X3Uf6omSSqXqfbyB4x8m2PHNAZkIVsRwDmXKyxlq3qjLuGdq9WXajG06bYs2U53MtaeqznmtiQ6ZtOYwJGprtMdpajsa2eiD14X62vijY7KVEgWQ4IXmgzm+ZM6HIz9hpnYx6St0wD1Fe5k0nWXU92awT9NpBz8e6iYw5siNcYyXpF1/uEaMzkeshjWbyXrgaQ2CaNMYhaQnQEotAgMBAAE=',
  // Nguồn connect-src thêm cho CSP (hệ thống danh tính SSO…) — xem environment.prod.ts. Đổi ở đây thì cập nhật headers của cấu hình serve tương ứng trong angular.json (scripts/web-config-build.mjs in bản đúng).
  cspExtraConnectSrc: [] as string[],
  // Địa chỉ cổng giao diện SSO (nút "Mở cổng SSO" ở trang /sso-return, /logged-out và trang "tài khoản do SSO quản lý"). Tuỳ chọn: bỏ khoá / để rỗng ⇒ ẩn nút. Chỉ là liên kết điều hướng nên không cần thêm vào CSP connect-src.
  ssoPortalUrl: 'https://localhost:4300',
};
/*
 * For easier debugging in development mode, you can import the following file
 * to ignore zone related error stack frames such as `zone.run`, `zoneDelegate.invokeTask`.
 *
 * This import should be commented out in production mode because it will have a negative impact
 * on performance if an error is thrown.
 */
// import 'zone.js/plugins/zone-error';  // Included with Angular CLI.
