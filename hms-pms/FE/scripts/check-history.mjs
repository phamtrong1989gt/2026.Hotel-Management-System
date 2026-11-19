// =============================================================================
// check-history.mjs — GATE "màn danh sách phải có nút Lịch sử" (2026-10-05, coder: "nhân rộng nút Lịch sử sang các màn khác, cho vào luật").
//
//   Màn DANH SÁCH CRUD (kế thừa BaseMainModuleComponent / StatusListBaseComponent, có `get pageActions()` và tạo / sửa bản ghi —
//   `addBtn(` hoặc `editRow(`) PHẢI có:
//     HIS-01  `this.historyPageAction` trong pageActions   → nút "Lịch sử" đầu trang = nhật ký CẢ module (popup, quyền ActivityLogs/Index)
//     HIS-02  `this.historyRowAction`  trong rowActions    → mục ⋮ "Lịch sử" của từng dòng (nếu màn có rowActions)
//   Hai nút tự ẩn khi người dùng thiếu quyền Nhật ký hành động; lọc CHÍNH XÁC theo `historyObjectNames` (mặc định [moduleName];
//   màn có nhật ký ghi dưới tên khác thì override — vd Tài khoản ['Users', 'ApplicationUser']).
//
//   Ngoại lệ có chủ đích khai trong ALLOW — mỗi dòng PHẢI kèm lý do. Bỏ comment trước khi so (nút nằm trong comment = KHÔNG có —
//   lỗi thật đã gặp khi chèn tự động: `// ghi chú, this.historyRowAction`).
//   Fail (exit 1) khi có vi phạm. Thuộc chuỗi `npm run check`.
// =============================================================================

import { readFileSync, readdirSync, statSync } from '../../../../0.Core/src/Core/FE/tools/fe-overlay-fs.mjs';
import { join, relative, sep } from 'node:path';

const ROOT = process.cwd();
const SCOPE = ['src/app/modules', 'src/app/features'];

// Ngoại lệ: đường dẫn (tính từ thư mục FE của phần mềm) → { rules, reason }
const ALLOW = {
};

const BASE = /extends\s+(BaseMainModuleComponent|StatusListBaseComponent)\s*</;

/** Duyệt đệ quy gom tệp `*.component.ts`. Tham số: `dir` thư mục gốc; `out` mảng tích luỹ. Trả về: `out`. Tác dụng phụ: đọc cây thư mục (qua overlay). */
function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (p.endsWith('.component.ts')) out.push(p);
  }
  return out;
}

/** Bỏ comment khối + comment dòng (không đụng '//' nằm trong chuỗi kiểu 'https://'). */
function stripComments(src) {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n')
    .map((line) => line.replace(/(^|[^:'"`])\/\/.*$/, '$1'))
    .join('\n');
}

/** Thân getter `get name() { … }` (đếm ngoặc nhọn) — null nếu không có. */
function getterBody(src, name) {
  const i = src.search(new RegExp(`get\\s+${name}\\s*\\(\\s*\\)`));
  if (i < 0) return null;
  const open = src.indexOf('{', i);
  let depth = 0;
  for (let j = open; j < src.length; j++) {
    if (src[j] === '{') depth++;
    else if (src[j] === '}') { depth--; if (depth === 0) return src.slice(open, j + 1); }
  }
  return null;
}

const violations = [];
let screens = 0;
for (const dir of SCOPE) {
  for (const file of walk(join(ROOT, dir))) {
    const raw = readFileSync(file, 'utf8');
    if (!BASE.test(raw)) continue;
    const src = stripComments(raw);
    const page = getterBody(src, 'pageActions');
    if (page === null) continue;                                  // bảng nhúng / màn không có thanh nút → ngoài phạm vi
    if (!/\baddBtn\(|\beditRow\(/.test(src)) continue;            // không tạo / sửa bản ghi (nhật ký, giám sát, cấu hình) → ngoài phạm vi
    screens++;
    const rel = relative(ROOT, file).split(sep).join('/');
    const allow = ALLOW[rel]?.rules ?? [];
    if (!allow.includes('HIS-01') && !/this\.historyPageAction\b/.test(page))
      violations.push(`${rel}\n    HIS-01 thiếu nút "Lịch sử" cả module → thêm \`this.historyPageAction\` vào pageActions (trước ...this.basePageActions)`);
    const row = getterBody(src, 'rowActions');
    if (row !== null && !allow.includes('HIS-02') && !/this\.historyRowAction\b/.test(row))
      violations.push(`${rel}\n    HIS-02 thiếu mục ⋮ "Lịch sử" của dòng → thêm \`this.historyRowAction\` vào cuối rowActions`);
  }
}

if (violations.length) {
  console.error(`✗ [check:history] ${violations.length} vi phạm (màn danh sách CRUD phải có nút Lịch sử — ngoại lệ khai ALLOW kèm lý do):`);
  for (const v of violations) console.error('  ' + v);
  process.exit(1);
}
console.log(`[check:history] ✓ ${screens} màn danh sách CRUD đều có nút Lịch sử (cả module + từng dòng); ${Object.keys(ALLOW).length} ngoại lệ đã khai.`);
