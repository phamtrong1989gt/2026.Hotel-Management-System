// jsonc — đọc JSON CÓ CHÚ THÍCH (kiểu appsettings của .NET, launchSettings.json, workspace.json viết tay) cho công cụ cấp dự án. Node thuần, không gói ngoài.
//
// Một nguồn cho: scripts/config-sync.mjs, scripts/check-ports.mjs (và công cụ khác cần đọc JSON có chú thích). KHÔNG import tệp nào khác của scripts/ — dùng được ở mọi nơi,
// kể cả khi chưa xác định được lõi nền tảng (lib/workspace.mjs có bản riêng của stripJsonc vì nó là mắt xích ĐẦU TIÊN tìm lõi; cùng thuật toán, xem chú thích ở đó).
//
// Xuất: stripJsonc · parseJsonc.

/**
 * Hàm làm gì: bỏ chú thích dòng (`//`), chú thích khối, BOM đầu tệp và dấu phẩy thừa trước `}` / `]` khỏi văn bản JSON-có-chú-thích,
 * GIỮ NGUYÊN mọi thứ nằm trong chuỗi (vd `"http://localhost:5100/"`, `"a, }"`).
 * @param {string} text Nội dung tệp (có thể có BOM và chú thích).
 * @returns {string} JSON thuần, parse được bằng `JSON.parse`.
 * Tác dụng phụ: không.
 */
export function stripJsonc(text) {
  const start = text.charCodeAt(0) === 0xFEFF ? 1 : 0;   // chịu BOM đầu tệp (PowerShell 5.1 `Set-Content -Encoding UTF8` ghi BOM)
  let out = '';
  let inStr = false;
  for (let i = start; i < text.length; i++) {
    const c = text[i];
    const n = text[i + 1];
    if (inStr) {
      out += c;
      if (c === '\\') { out += n ?? ''; i++; } else if (c === '"') inStr = false;
      continue;
    }
    if (c === '"') { inStr = true; out += c; continue; }
    if (c === '/' && n === '/') { while (i < text.length && text[i] !== '\n') i++; out += '\n'; continue; }
    if (c === '/' && n === '*') { i += 2; while (i < text.length && !(text[i] === '*' && text[i + 1] === '/')) i++; i++; continue; }
    out += c;
  }
  return stripTrailingCommas(out);
}

/**
 * Hàm làm gì: bỏ dấu phẩy thừa đứng ngay trước `}` hoặc `]` (kể cả cách nhau khoảng trắng / xuống dòng) NGOÀI chuỗi — .NET và trình soạn thảo cho phép, `JSON.parse` thì không.
 * Duyệt từng ký tự để KHÔNG đụng nội dung trong chuỗi (một biểu thức chính quy đơn giản sẽ làm hỏng chuỗi chứa «, }»).
 * @param {string} text JSON đã bỏ chú thích.
 * @returns {string} JSON đã bỏ dấu phẩy thừa.
 * Tác dụng phụ: không.
 */
function stripTrailingCommas(text) {
  let out = '';
  let inStr = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inStr) {
      out += c;
      if (c === '\\') { out += text[i + 1] ?? ''; i++; } else if (c === '"') inStr = false;
      continue;
    }
    if (c === '"') { inStr = true; out += c; continue; }
    if (c === ',') {
      let j = i + 1;
      while (j < text.length && /\s/.test(text[j])) j++;
      if (text[j] === '}' || text[j] === ']') continue;   // bỏ dấu phẩy thừa, giữ khoảng trắng phía sau
    }
    out += c;
  }
  return out;
}

/**
 * Hàm làm gì: phân tích văn bản JSON-có-chú-thích thành đối tượng.
 * @param {string} text Nội dung tệp (có thể có BOM, chú thích, dấu phẩy thừa).
 * @returns {any} Đối tượng đã phân tích.
 * @throws {SyntaxError} Không phải JSON hợp lệ sau khi bỏ chú thích / dấu phẩy thừa.
 * Tác dụng phụ: không.
 */
export function parseJsonc(text) {
  return JSON.parse(stripJsonc(text));
}
