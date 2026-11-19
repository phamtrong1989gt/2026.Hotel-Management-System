// pill-i18n-rule — hàm THUẦN cho luật PILL-01 của check-cells.mjs (tách ra để scripts/tests/pill-i18n-rule.test.mjs thử ca PASS + ca phá).
//
// PILL-01 (UNRELEASED 2026-11-03, _bmad/_pending fe-cellpill-text-khong-duoc-dich-nen-khoa-i18n-hien-tho-khong-co-may-bat):
// chữ trong `cellPill({...})` / `cellIcon({...})` / `cellBoolPill(...)` / `cellBoolIcon(...)` được VẼ NGUYÊN VĂN — g-cell vẽ `{{ mapItem.text }}` / `[matTooltip]`
// KHÔNG qua pipe `translate` (platform/ui/table/g-cell/g-cell.component.ts, nhánh 'pill' / 'iconMap'). Điền KHOÁ i18n (vd 'analysis-sync.statusName.0') vào đó ⇒
// giao diện hiện khoá thô mà `check:i18n` (kiểm khoá có trong json) và `check:cells` (kiểm renderer có tồn tại) đều xanh. Nhãn lấy từ enum / danh mục phải đi
// `cellCategory(source, { pill: true, colors, icons })` (nhãn do BE trả qua [CategoryEnum] + [Display]) hoặc ghi chữ tiếng Việt nguyên văn.
//
// Cách bắt: với mỗi lời gọi của 4 hàm trên, lấy thân (đếm ngoặc tròn, bỏ qua chuỗi + chú thích), duyệt MỌI literal chuỗi trong thân; literal có HÌNH DẠNG khoá i18n
// (tiền tố viết thường, đoạn thứ hai có chữ cái, các đoạn sau tuỳ ý — vd 'analysis-sync.statusName.0'; không khoảng trắng / dấu tiếng Việt) ⇒ vi phạm.
// Tên icon Material ('lock_open'), màu ('success'), chữ nguyên văn ('Đang chạy', 'N/A', 'v1.2') KHÔNG khớp hình dạng này nên không bị đỏ oan.
// NGOẠI LỆ (G1, 2026-11-04): khoá i18n là ĐỐI SỐ TRỰC TIẾP của lời gọi dịch — `this.translate.instant('x.y')` / `.stream('x.y')` / `translate('x.y')` / `translate.get('x.y')`
// (kể cả trong mảng khoá `instant(['a.b', 'c.d'])` hay biểu thức ba ngôi `instant(c ? 'a.b' : 'c.d')`) — là cách dịch ĐÚNG: chuỗi được dịch TRƯỚC khi tới ô nên ô vẽ chữ đã dịch,
// không phải khoá thô ⇒ không báo. Khoá nằm ngoài lời gọi dịch (hoặc ở object tham số nội suy của nó) vẫn bị bắt.
// Giới hạn đã biết: chỉ bắt literal ngay trong thân lời gọi; map dựng ở biến rồi truyền vào (`cellPill(MAP)`), hoặc khoá ghép bằng nối chuỗi / template, không bị thấy.

/** Hàm dựng ô mà chữ được vẽ nguyên văn (không dịch). */
export const VERBATIM_CELL_FNS = ['cellPill', 'cellIcon', 'cellBoolPill', 'cellBoolIcon'];

/** Hình dạng khoá i18n: tiền tố viết thường, đoạn thứ hai có ít nhất một chữ cái (loại 'v1.2', 'a.1'), các đoạn sau tuỳ ý (cho phép '.0'). */
export const I18N_KEY_SHAPE = /^[a-z][a-z0-9-]*\.[A-Za-z0-9_-]*[A-Za-z][A-Za-z0-9_-]*(\.[A-Za-z0-9_-]+)*$/;

/**
 * Thay chú thích (`/* … *\/` và `// …`) bằng khoảng trắng CÙNG ĐỘ DÀI (giữ nguyên xuống dòng để số dòng không lệch), không đụng vào nội dung chuỗi.
 * @param src văn bản TypeScript.
 * @returns văn bản cùng độ dài, chú thích đã bị xoá.
 */
export function blankComments(src) {
  let out = '';
  let i = 0;
  while (i < src.length) {
    const c = src[i];
    const n = src[i + 1];
    if (c === "'" || c === '"' || c === '`') {                // chuỗi: chép nguyên tới dấu đóng
      let j = i + 1;
      while (j < src.length && src[j] !== c) j += src[j] === '\\' ? 2 : 1;
      out += src.slice(i, j + 1);
      i = j + 1;
    } else if (c === '/' && n === '/') {                      // chú thích dòng
      let j = i;
      while (j < src.length && src[j] !== '\n') j++;
      out += ' '.repeat(j - i);
      i = j;
    } else if (c === '/' && n === '*') {                      // chú thích khối (giữ xuống dòng)
      const end = src.indexOf('*/', i + 2);
      const j = end < 0 ? src.length : end + 2;
      out += src.slice(i, j).replace(/[^\n]/g, ' ');
      i = j;
    } else {
      out += c;
      i++;
    }
  }
  return out;
}

/**
 * Cho biết dấu `(` tại `parenIdx` có mở một lời gọi HÀM DỊCH hay không (ngoại lệ G1: khoá i18n truyền thẳng vào hàm dịch là cách dịch ĐÚNG, không phải khoá thô).
 * Nhận: `….instant(` và `….stream(` (mọi tên đối tượng, gồm `?.`), `translate(` / `….translate(` (hàm trần), và `<tên chứa "translate">.get(` (vd `this.translate.get(`,
 * `translateService.get(`) — `.get(` của đối tượng khác (vd `map.get('a.b')`) KHÔNG nhận. Chỉ đọc tối đa 80 ký tự đứng trước dấu `(`; không đổi `code`.
 * @param code văn bản TypeScript ĐÃ xoá chú thích (kết quả `blankComments`).
 * @param parenIdx chỉ số của ký tự `(` trong `code`.
 * @returns true nếu phần ngay trước `(` là tên hàm dịch; false nếu không.
 */
export function isTranslateCallee(code, parenIdx) {
  const before = code.slice(Math.max(0, parenIdx - 80), parenIdx).trimEnd();
  return /\.\s*(?:instant|stream)$/.test(before)
    || /(?:^|[^\w$])translate$/.test(before)
    || /\b\w*translate\w*\s*\??\.\s*get$/i.test(before);
}

/**
 * Tìm các literal có hình dạng khoá i18n trong thân lời gọi `cellPill(` / `cellIcon(` / `cellBoolPill(` / `cellBoolIcon(`.
 * BỎ QUA literal là ĐỐI SỐ TRỰC TIẾP của một lời gọi dịch (`isTranslateCallee`): dấu ngoặc tròn trong cùng chứa literal là `instant(` / `translate(` …, hoặc literal nằm trong
 * mảng / biểu thức ba ngôi đặt ngay trong ngoặc đó. Literal trong object `{ … }` (kể cả object tham số nội suy của lời gọi dịch) hoặc trong lời gọi hàm khác thì KHÔNG được miễn.
 * Chỉ đọc `src`, không ghi gì.
 * @param src văn bản TypeScript của một tệp.
 * @returns danh sách `{ fn, key, line }` (line tính từ 1); rỗng = sạch.
 */
export function findI18nKeyInVerbatimCells(src) {
  const code = blankComments(src);
  const found = [];
  const callRe = new RegExp(`\\b(${VERBATIM_CELL_FNS.join('|')})\\s*\\(`, 'g');
  let m;
  while ((m = callRe.exec(code)) !== null) {
    const start = m.index + m[0].length;          // ngay sau dấu '('
    // Ngăn xếp ngoặc đang mở trong thân lời gọi: mỗi phần tử { open, translating }.
    // `translating` = nhóm ngoặc này là đối số trực tiếp của hàm dịch (ngoặc tròn của hàm dịch, hoặc mảng đặt thẳng trong đó).
    const stack = [{ open: '(', translating: false }];   // phần tử đầu = ngoặc tròn của chính cellPill / cellIcon / …
    let depth = 1;
    let j = start;
    while (j < code.length && depth > 0) {
      const c = code[j];
      if (c === "'" || c === '"' || c === '`') {
        const q = c;
        const litStart = j;
        j++;
        while (j < code.length && code[j] !== q) j += code[j] === '\\' ? 2 : 1;
        if (q !== '`' && !stack[stack.length - 1].translating) {
          const value = code.slice(litStart + 1, j);
          if (I18N_KEY_SHAPE.test(value)) {
            found.push({ fn: m[1], key: value, line: code.slice(0, litStart).split('\n').length });
          }
        }
      } else if (c === '(') {
        depth++;
        stack.push({ open: '(', translating: isTranslateCallee(code, j) });
      } else if (c === '[') {
        const top = stack[stack.length - 1];
        stack.push({ open: '[', translating: top.translating });   // mảng khoá `instant(['a.b', 'c.d'])` thừa hưởng
      } else if (c === '{') {
        stack.push({ open: '{', translating: false });
      } else if (c === ')') {
        depth--;
        if (stack.length > 1) stack.pop();
      } else if (c === ']' || c === '}') {
        if (stack.length > 1) stack.pop();
      }
      j++;
    }
    callRe.lastIndex = j;
  }
  return found;
}
