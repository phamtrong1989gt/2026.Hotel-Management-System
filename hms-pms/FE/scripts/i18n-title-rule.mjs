// =============================================================================
// i18n-title-rule.mjs — LUẬT KIỂU CHỮ cho nhãn người dùng nhìn thấy (11.182c).
//
//   Coder hỏi "nên để viết hoa hay như này" rồi chốt: "Tôi cần 1 tiêu chuẩn, nếu cần sửa có thể quét hết để sửa".
//   Chuẩn: CÂU THƯỜNG (sentence case) — hoa chữ đầu câu, phần còn lại thường, trừ danh từ riêng / viết tắt.
//
//   Vì sao không phải hai kiểu kia:
//     • Title Case (hoa từng từ) là quy ước TIẾNG ANH. "Loại Tài liệu" không phải danh từ riêng nên viết hoa là sai
//       chính tả tiếng Việt, không phải trang trọng.
//     • VIẾT HOA TOÀN BỘ trong app này đã có việc khác: nhãn tầng (.g-cfg__title, 12px) và tên hệ thống ở thanh tiêu đề.
//       Dùng lại cho tiêu đề màn thì chữ hoa mất hết ý nghĩa phân cấp. Chữ hoa toàn bộ cũng đọc chậm hơn vì mất đường
//       viền trên–dưới của chữ.
//     • Và câu thường VỐN ĐÃ là đa số (70% số màn lúc chốt luật) — chọn nó là ít phải sửa nhất.
//
//   MỘT nguồn luật cho CẢ HAI phía: gate check-i18n (bắt) và fix-i18n-titles (sửa). Tách hai bản là sớm muộn lệch nhau.
// =============================================================================

/** Từ được giữ chữ hoa giữa câu: viết tắt kỹ thuật + tên riêng. Thêm từ mới vào đây, đừng nới luật. */
export const PROPER = new Set([
  'API', 'BE', 'FE', 'SQL', 'HTML', 'PDF', 'CSDL', 'IP', 'OTP', 'SMS', 'URL', 'JSON', 'CSV', 'UAV', 'AI',
  'GB', 'MB', 'RAM', 'CPU', 'QR', 'PIN', 'ID', 'IT',
  'Excel', 'Word', 'Angular', 'Windows', 'Linux', 'Zalo', 'Google', 'Facebook', 'Email',
]);

/** Chuỗi có ít nhất một chữ cái (mọi hệ chữ) không. Tham số: `t` chuỗi. Trả về: boolean. Tác dụng phụ: không. */
const hasLetter = (t) => /\p{L}/u.test(t);

/** Tách từ, giữ nguyên dấu nối trong từ ghép (Check-In) để xét cả cụm. */
export const wordsOf = (t) => t.split(/[\s/&·,()–—:+|]+/).filter(Boolean);

/** Bỏ dấu câu quanh từ để so với danh sách danh từ riêng. */
const bare = (w) => w.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, '');

/** Từ có thuộc danh từ riêng / viết tắt đã khai ở `PROPER` không (so cả dạng chữ hoa). Tham số: `w` từ (có thể kèm dấu câu). Trả về: boolean. Tác dụng phụ: không. */
export const isProper = (w) => {
  const b = bare(w);
  return !!b && (PROPER.has(b) || PROPER.has(b.toUpperCase()));
};

/** VIẾT HOA TOÀN BỘ: không còn chữ thường nào. */
export const isAllCaps = (t) => hasLetter(t) && t === t.toLocaleUpperCase('vi');

/**
 * Các TỪ viết hoa sai giữa câu (bỏ qua từ đầu và danh từ riêng đã khai).
 * Từ ghép có dấu nối xét từng mảnh: "Check-In" sai cả hai mảnh.
 */
export function midCapWords(t) {
  if (isAllCaps(t)) return [];
  const bad = [];
  wordsOf(t).slice(1).forEach((w) => {
    if (isProper(w)) return;
    for (const piece of bare(w).split('-')) {
      if (!piece) continue;
      if (PROPER.has(piece) || PROPER.has(piece.toUpperCase())) continue;
      const f = piece[0], rest = piece.slice(1);
      const isUpperLetter = f === f.toLocaleUpperCase('vi') && f !== f.toLocaleLowerCase('vi');
      if (isUpperLetter && rest.length > 0 && rest !== rest.toLocaleUpperCase('vi')) bad.push(piece);
    }
  });
  return bad;
}

/** Nhãn có hợp chuẩn không. */
export const isOk = (t) => !isAllCaps(t) && midCapWords(t).length === 0;

/**
 * Đề xuất bản sửa về câu thường. KHÔNG áp dụng mù: với nhãn lọt tên code ra giao diện (BannerItem…) thì máy không đoán
 * được tên tiếng Việt đúng — chỗ đó phải khai tay trong OVERRIDES.
 */
export function toSentenceCase(t) {
  const lowered = t
    .split(/(\s+)/)
    .map((tok) => {
      if (!/\p{L}/u.test(tok)) return tok;
      if (isProper(tok)) return bare(tok) === tok ? tok : tok;   // giữ nguyên viết tắt/tên riêng
      return tok.toLocaleLowerCase('vi');
    })
    .join('');
  // Hoa đúng chữ cái đầu tiên của câu.
  const i = [...lowered].findIndex((c) => /\p{L}/u.test(c));
  if (i < 0) return lowered;
  return lowered.slice(0, i) + lowered[i].toLocaleUpperCase('vi') + lowered.slice(i + 1);
}

/** Nhãn phải đặt tay vì máy không đoán được (tên code lọt ra giao diện). */
export const OVERRIDES = {
  'Quản lý BannerItem': 'Quản lý mục banner',
  'Quản lý MenuItem': 'Quản lý mục menu',
  'Quyền Areas': 'Quyền theo khu vực',
};
