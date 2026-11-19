#!/usr/bin/env node
// =============================================================================
// check-method-docs.mjs — GATE "mọi hàm có chú thích nói hàm làm gì" cho mã dự án (features/**).
//
//   Nguồn luật: `_bmad/custom/conventions.yaml → codeComments` (dev 2026-10-22: "comment chi tiết từng hàm làm chức năng gì, cho vào luật").
//   Phía BE canh bằng `App.Tests.PMS/Architecture/AppMethodDocRulesTests`; tệp này là phía FE (TypeScript).
//
//   PHẠM VI: `src/app/features/**/*.ts` (bỏ *.spec.ts, *.d.ts). KHÔNG quét `modules/` + `platform/` — mã LÕI, không do bộ sinh viết (7 lưới của `modules/`
//   cũng thiếu chú thích, nhưng sửa lõi cần dev duyệt).
//   CẦN chú thích liền trên (dòng `//`, `/** … */` hoặc `*`; bỏ qua dòng decorator `@…` đứng giữa):
//     • method của lớp (thụt lề đúng 2 khoảng) — kể cả `private` / `protected` / `static` / `override` / `async`;
//     • get / set;  • hook vòng đời (ngOnInit…);  • hàm `function` ở gốc tệp;
//     • `constructor` CÓ logic. `constructor` chỉ chuyển DI (thân rỗng hoặc chỉ `super(...)`) được miễn — chú thích kiểu "Khởi tạo component" là
//       chữ máy móc, đúng điều luật cấm (không lặp tên hàm).
//   GATE CHỈ KIỂM CÓ chú thích — chất lượng (nói hàm LÀM GÌ, KHỚP mã, không lặp tên) do `/fe-review` đọc.
//
//   GIỚI HẠN (nói thẳng): quét theo văn bản, không dựng cây cú pháp ⇒ KHÔNG thấy method có kiểu trả về chứa `{`/`=` (vd `Promise<{ a: number }>`),
//   hàm mũi tên gán biến (`export const f = () =>`), thành viên lớp thụt lề khác 2 khoảng. Muốn bắt hết ⇒ dùng ESLint `jsdoc/require-jsdoc`.
//
//   Ngoại lệ có LÝ DO thật khai ở ALLOW (file + tên hàm). Hiện rỗng. Mã thoát: 1 khi có vi phạm · 0 khi sạch. Thuộc chuỗi `npm run check`.
// =============================================================================

import { readFileSync, readdirSync, statSync, existsSync } from '../../../../0.Core/src/Core/FE/tools/fe-overlay-fs.mjs';
import { join, sep, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SCOPE = ['main', 'shared'].map((d) => join(ROOT, 'src', 'app', 'features', d));

/** Ngoại lệ có lý do thật: { file: 'features/…/x.ts', name: 'tênHàm', why: '…' }. Rỗng = mọi hàm trong phạm vi đều phải có chú thích. */
const ALLOW = [];

const CONTROL = new Set(['if', 'for', 'while', 'switch', 'return', 'catch', 'function', 'super', 'this', 'new', 'else', 'do', 'try', 'typeof', 'await']);
const MODIFIERS = /^(?:(?:public|private|protected|static|override|async|abstract)\s+)*/;
const DECORATOR = /^@\w+(?:\([^)]*\))?\s+/;   // `@Input(…) ` đứng cùng dòng với setter

/** Rút gọn đường dẫn để in lỗi. Tham số: `p` đường dẫn tuyệt đối. Trả về: chuỗi tính từ sau `src/app/` (dấu `/`). Tác dụng phụ: không. */
const rel = (p) => p.split(sep).join('/').replace(/.*\/src\/app\//, '');

/** Thay nội dung chuỗi bằng `""` (giữ độ dài dòng không quan trọng) để đếm ngoặc không bị chuỗi làm lệch. */
const stripStrings = (s) => s.replace(/'(?:\\.|[^'\\])*'|"(?:\\.|[^"\\])*"|`(?:\\.|[^`\\])*`/g, '""');

// Dòng `prev` (đã trim) có phải là chú thích không: bắt đầu bằng `//`, `/*`, `*` hoặc kết thúc bằng dấu đóng khối chú thích.
const isDocLine = (prev) => {
  // Dòng kẻ phân khu (`// ── Đổi thứ tự ──`, `// ----`) đứng sát hàm KHÔNG phải chú thích của hàm đó.
  if (/^\/\/\s*[─━═\-=_*#~]{2,}/.test(prev)) return false;
  return prev.startsWith('//') || prev.startsWith('/*') || prev.startsWith('*') || prev.endsWith('*/');
};

/**
 * Từ vị trí `open` (chỉ vào `{`) tìm `}` khớp trong `text`, bỏ qua chuỗi + chú thích. Trả vị trí `}` hoặc -1.
 * Dùng để lấy thân `constructor` xem có logic hay chỉ chuyển DI.
 */
function matchBrace(text, open) {
  let depth = 0;
  for (let i = open; i < text.length; i++) {
    const c = text[i];
    if (c === '/' && text[i + 1] === '/') { while (i < text.length && text[i] !== '\n') i++; continue; }
    if (c === '/' && text[i + 1] === '*') { i = text.indexOf('*/', i + 2); if (i < 0) return -1; i++; continue; }
    if (c === "'" || c === '"' || c === '`') { const q = c; i++; while (i < text.length && text[i] !== q) i += text[i] === '\\' ? 2 : 1; continue; }
    if (c === '{') depth++;
    else if (c === '}') { depth--; if (depth === 0) return i; }
  }
  return -1;
}

/** Thân `constructor` chỉ chuyển DI: rỗng hoặc đúng một lệnh `super(…);` (đã bỏ chú thích + khoảng trắng). */
function isDiOnlyBody(body) {
  const b = body.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '').replace(/\s+/g, ' ').trim();
  return b === '' || /^super\([^;]*\);?$/.test(b);
}

/**
 * Quét một tệp, trả danh sách { line, name, kind } của hàm thiếu chú thích. `kind` = method | accessor | ctor | function.
 */
function scanFile(text) {
  const lines = text.split(/\r?\n/);
  const offsets = [];
  { let o = 0; for (const l of text.split(/\r?\n/)) { offsets.push(o); o += l.length + (text[o + l.length] === '\r' ? 2 : 1); } }
  const out = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    let head, indentOk = false, topLevel = false;
    if (/^  \S/.test(line) && !/^  (\/\/|\/\*|\*|\}|\)|\])/.test(line)) { head = line.slice(2); indentOk = true; }
    else if (/^(?:export\s+)?(?:async\s+)?function\s/.test(line)) { head = line; topLevel = true; }
    if (!indentOk && !topLevel) continue;
    head = head.replace(DECORATOR, '');
    let name, kind;
    if (topLevel) {
      const m = /^(?:export\s+)?(?:async\s+)?function\s+([A-Za-z_$][\w$]*)\s*(?:<[^>(]*>)?\s*\(/.exec(head);
      if (!m) continue;
      name = m[1]; kind = 'function';
    } else {
      const mod = MODIFIERS.exec(head)[0];
      let rest = head.slice(mod.length);
      let acc = false;
      const g = /^(get|set)\s+(?=[A-Za-z_$])/.exec(rest);
      if (g) { acc = true; rest = rest.slice(g[0].length); }
      const m = /^([A-Za-z_$][\w$]*)\s*(?:<[^>(]*>)?\s*\(/.exec(rest);
      if (!m || CONTROL.has(m[1])) continue;
      name = m[1];
      kind = name === 'constructor' ? 'ctor' : acc ? 'accessor' : 'method';
    }
    // gom chữ ký đến `)` khớp (tối đa 14 dòng) rồi đòi `{` (khai báo có thân) — loại lời gọi hàm / phần tử mảng / thuộc tính
    let depth = 0, closed = false, tail = '', endLine = i, bracePos = -1;
    for (let k = i; k < Math.min(lines.length, i + 14) && !closed; k++) {
      const clean = stripStrings(lines[k]);
      for (let c = 0; c < clean.length; c++) {
        if (clean[c] === '(') depth++;
        else if (clean[c] === ')') { depth--; if (depth === 0) { closed = true; tail = clean.slice(c + 1); endLine = k; break; } }
      }
    }
    if (!closed) continue;
    const bm = /^\s*(?::[^{;=]*?)?\{/.exec(tail);
    if (!bm) continue;
    bracePos = offsets[endLine] + (stripStrings(lines[endLine]).length - tail.length) + bm[0].length - 1;
    // chú thích liền trên (bỏ dòng decorator `@…`)
    let p = i - 1;
    while (p >= 0 && /^\s*@\w+/.test(lines[p])) p--;
    const prev = p >= 0 ? lines[p].trim() : '';
    if (isDocLine(prev)) continue;
    if (kind === 'ctor') {
      const close = matchBrace(text, bracePos);
      if (close > 0 && isDiOnlyBody(text.slice(bracePos + 1, close))) continue;
    }
    out.push({ line: i + 1, name, kind });
  }
  return out;
}

/** Duyệt đệ quy gom tệp `.ts` (bỏ `.spec.ts`, `.d.ts`). Tham số: `dir` thư mục (không có ⇒ rỗng); `files` mảng tích luỹ. Trả về: `files`. Tác dụng phụ: đọc cây thư mục. */
function walk(dir, files = []) {
  if (!existsSync(dir)) return files;
  for (const n of readdirSync(dir)) {
    const p = join(dir, n);
    if (statSync(p).isDirectory()) walk(p, files);
    else if (n.endsWith('.ts') && !n.endsWith('.spec.ts') && !n.endsWith('.d.ts')) files.push(p);
  }
  return files;
}

let scanned = 0, found = 0;
const violations = [];
for (const dir of SCOPE) {
  for (const f of walk(dir)) {
    const file = rel(f);
    for (const v of scanFile(readFileSync(f, 'utf8'))) {
      found++;
      if (ALLOW.some((a) => file.endsWith(a.file) && a.name === v.name)) continue;
      violations.push({ file, ...v });
    }
    scanned++;
  }
}

if (violations.length) {
  console.log(`✗ [check:method-docs] ${violations.length} hàm thiếu chú thích liền trên (luật: conventions.yaml → codeComments):`);
  for (const v of violations) console.log(`   ${v.file}:${v.line}  ${v.name}  (${v.kind})`);
  console.log('\n→ viết 1 dòng `/** … */` (hoặc `//`) NGAY TRÊN hàm: hàm LÀM GÌ bằng động từ nghiệp vụ (không lặp tên hàm), tham số đặc biệt, tác dụng phụ (gọi API nào, đóng hộp, phát sự kiện). Chỉ viết điều đã ĐỌC trong thân hàm.');
  process.exit(1);
}
console.log(`[check:method-docs] ✓ ${scanned} tệp features/**: mọi method / get / set / hook / hàm gốc tệp / constructor-có-logic đều có chú thích (${ALLOW.length} ngoại lệ khai).`);
