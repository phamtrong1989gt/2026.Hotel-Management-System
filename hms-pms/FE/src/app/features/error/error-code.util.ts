// features/error/error-code.util — chuẩn hoá tham số `?code=` của trang /error (hàm thuần, không phụ thuộc Angular / DOM).
//
// Vì sao cần: trang /error hiện `code` làm TIÊU ĐỀ LỚN trong thẻ mang logo / tên hệ thống. Trước đây `this.code = params['code'] ?? 404` phản chiếu
// NGUYÊN chuỗi từ URL ⇒ kẻ gửi liên kết dựng được trang trông như thông báo của hệ thống (`/error?code=Phiên hết hạn, gọi 090…`) — lừa đảo nội dung
// (Angular đã escape nên KHÔNG phải XSS; cùng lớp lỗi `sso-callback` đã vá ở rv6 FE-8). Luồng hợp lệ chỉ gửi SỐ HTTP (error.interceptor / jwt.interceptor /
// auth.guard / login-redirect.guard / app.routes) nên danh sách đóng dưới đây không làm hỏng luồng nào.

/** Danh sách ĐÓNG các mã trang /error được hiển thị: phiên hết hiệu lực, thiếu quyền, không tồn tại, đăng nhập nơi khác, lỗi máy chủ. */
export const ERROR_PAGE_CODES: readonly number[] = [401, 403, 404, 409, 500];

/** Mã mặc định khi `?code=` vắng hoặc không thuộc danh sách đóng. */
export const ERROR_PAGE_DEFAULT_CODE = 404;

/**
 * Chuẩn hoá giá trị thô của `?code=` thành MỘT mã trong danh sách đóng `ERROR_PAGE_CODES`.
 *
 * Làm gì: ép về số rồi chỉ chấp nhận mã nằm trong danh sách đóng; mọi thứ khác (vắng, chuỗi tự do, số lạ như 418, mảng khi có `?code=1&code=2`,
 * `NaN`) trả `ERROR_PAGE_DEFAULT_CODE` (404). Kết quả luôn là SỐ — trang không bao giờ in lại chuỗi do người dùng URL cung cấp.
 * @param raw giá trị `params['code']` của ActivatedRoute (kiểu thực tế là chuỗi | mảng chuỗi | undefined; có thể là số khi gọi từ mã).
 * @returns một trong 401 / 403 / 404 / 409 / 500.
 * Tác dụng phụ: không có.
 */
export function normalizeErrorCode(raw: unknown): number {
  const n = Number(raw);
  return ERROR_PAGE_CODES.includes(n) ? n : ERROR_PAGE_DEFAULT_CODE;
}
