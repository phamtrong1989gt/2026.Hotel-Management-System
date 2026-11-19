#!/usr/bin/env node
// =============================================================================
// check-export.mjs — GATE "xuất Excel dùng đường của lõi" cho mã dự án (features/**).
//
//   Nguồn luật: `_bmad/custom/fe/rules/R-fe.21.extend-base-classes.md` ("KHÔNG viết lại thứ base đã cho: exportRequest …" + ngoại lệ lớp bọc) và
//   `_bmad/_pending/2026-10-23_PlaceStatistics_fe-run-export-khong-cho-chon-duong-dan-xuat` (dev duyệt thêm tham số `endpoint` cho `runExport`).
//   Lõi: `service.exportRequest(req, endpoint = '/Export')` gửi POST + giữ header; `runExport(req, fallbackName, endpoint?)` tải tệp + báo lỗi 404/429/503 thống nhất.
//   Màn có HAI endpoint xuất (báo cáo tổng hợp `/Export` + biểu mẫu `/ExportForm`) ⇒ truyền `endpoint` vào `runExport`, KHÔNG ghi đè để đổi đường dẫn.
//
//   PHẠM VI: `src/app/features/**/*.ts` (bỏ *.spec.ts, *.d.ts). KHÔNG quét `modules/` + `platform/` — mã LÕI.
//   LUẬT (quét theo văn bản đã bỏ chú thích; thân hàm = từ `{` đầu tiên sau danh sách tham số tới `}` cân ngoặc):
//     EXP-01  `override exportRequest(` mà thân KHÔNG gọi `super.exportRequest(` — viết lại việc gửi yêu cầu xuất (tự `http.post`) thay vì BỌC lớp nền
//             (lớp bọc hợp lệ: bật cờ bận, đo thời gian… rồi vẫn `super.exportRequest(req, endpoint)`).
//     EXP-02  `override runExport(` mà thân KHÔNG gọi `super.runExport(` — viết lại việc tải tệp + báo lỗi của lõi.
//
//   GIỚI HẠN (nói thẳng): không bắt được lớp bọc gọi `super` NHƯNG vẫn tự đổi đường dẫn theo nội dung `req` (cách vòng cũ của PlaceStatistics trước 2026-10-23) — luật đó
//   là văn xuôi (R-fe.21 + fe-review), không có máy kiểm; cũng không bắt `http.post` tới `/Export…` nằm ngoài `exportRequest` (đo 2026-10-23: 0 chỗ trong features/**).
//
//   Ngoại lệ có LÝ DO thật khai ở ALLOW (file + luật). Hiện rỗng. Mã thoát: 1 khi có vi phạm · 0 khi sạch. Thuộc chuỗi `npm run check`.
//   Thử gate: `_bmad/tests/probes/fe-gate-export.mjs` (ca PASS + ca phá trên cây giả).
// =============================================================================

import { readFileSync, readdirSync, statSync, existsSync } from '../../../../0.Core/src/Core/FE/tools/fe-overlay-fs.mjs';
import { join, sep, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const FEATURES = join(ROOT, 'src', 'app', 'features');

/** Ngoại lệ có lý do thật: { file: 'features/…/x.ts', rule: 'EXP-01', why: '…' }. Rỗng = mọi ghi đè đều phải bọc lớp nền. */
const ALLOW = [];

const RULES = [
  { id: 'EXP-01', name: 'exportRequest', calls: 'super.exportRequest(', fix: 'bọc lớp nền: gọi super.exportRequest(req, endpoint); muốn đổi đường dẫn xuất ⇒ runExport(req, tênDựPhòng, endpoint)' },
  { id: 'EXP-02', name: 'runExport', calls: 'super.runExport(', fix: 'dùng runExport của lõi (tải tệp + báo lỗi 404/429/503 thống nhất); muốn đổi đường dẫn ⇒ tham số endpoint, không viết lại' },
];

/** Rút gọn đường dẫn để in lỗi. Tham số: `p` đường dẫn tuyệt đối. Trả về: chuỗi tính từ sau `src/app/` (dấu `/`). Tác dụng phụ: không. */
const rel = (p) => p.split(sep).join('/').replace(/.*\/src\/app\//, '');

// Bỏ chú thích khối và chú thích dòng (bỏ qua `://` của URL) nhưng GIỮ newline để số dòng không lệch.
export function stripComments(s) {
  let r = s.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '));
  r = r.replace(/(^|[^:])\/\/[^\n]*/g, (m, p) => p + ' '.repeat(m.length - p.length));
  return r;
}

/** Vị trí `}` đóng của khối mở tại `open` (`{`); -1 nếu không cân. Bỏ qua dấu ngoặc trong chuỗi '…' "…" `…`. */
function matchBrace(src, open) {
  let depth = 0;
  for (let i = open; i < src.length; i++) {
    const c = src[i];
    if (c === "'" || c === '"' || c === '`') {
      for (i++; i < src.length && src[i] !== c; i += src[i] === '\\' ? 2 : 1);
      continue;
    }
    if (c === '{') depth++;
    else if (c === '}' && --depth === 0) return i;
  }
  return -1;
}

/** Vị trí `)` đóng của ngoặc mở tại `open` (`(`); -1 nếu không cân. */
function matchParen(src, open) {
  let depth = 0;
  for (let i = open; i < src.length; i++) {
    const c = src[i];
    if (c === "'" || c === '"' || c === '`') {
      for (i++; i < src.length && src[i] !== c; i += src[i] === '\\' ? 2 : 1);
      continue;
    }
    if (c === '(') depth++;
    else if (c === ')' && --depth === 0) return i;
  }
  return -1;
}

/**
 * Hàm làm gì: tìm vi phạm EXP-01 / EXP-02 trong MỘT tệp. Tham số: `text` nội dung tệp. Trả về: danh sách `{ id, line, fix }`.
 * Mỗi lần gặp `override <tên>(`: lấy thân hàm (sau `)` đóng của tham số, `{` đầu tiên tới `}` cân) rồi xét thân có chứa lời gọi lớp nền không.
 */
export function findViolations(text) {
  const src = stripComments(text);
  const out = [];
  for (const rule of RULES) {
    const re = new RegExp(`\\boverride\\s+${rule.name}\\s*\\(`, 'g');
    let m;
    while ((m = re.exec(src)) !== null) {
      const paren = m.index + m[0].length - 1;
      const close = matchParen(src, paren);
      const open = close < 0 ? -1 : src.indexOf('{', close);
      const end = open < 0 ? -1 : matchBrace(src, open);
      const body = end < 0 ? '' : src.slice(open, end + 1);
      if (!body.includes(rule.calls)) {
        out.push({ id: rule.id, line: src.slice(0, m.index).split('\n').length, fix: rule.fix });
      }
    }
  }
  return out;
}

/** Duyệt đệ quy gom tệp `.ts` (bỏ `.spec.ts`, `.d.ts`). Tham số: `dir` thư mục (không có ⇒ rỗng); `files` mảng tích luỹ. Trả về: `files`. Tác dụng phụ: đọc cây thư mục. */
function walk(dir, files = []) {
  if (!existsSync(dir)) return files;
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, files);
    else if (name.endsWith('.ts') && !name.endsWith('.spec.ts') && !name.endsWith('.d.ts')) files.push(p);
  }
  return files;
}

// Chạy gate khi gọi trực tiếp (không khi import để thử hàm).
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const files = walk(FEATURES);
  const bad = [];
  for (const f of files) {
    const text = readFileSync(f, 'utf8');
    if (!/\boverride\s+(exportRequest|runExport)\s*\(/.test(text)) continue;
    for (const v of findViolations(text)) {
      if (ALLOW.some((a) => a.rule === v.id && rel(f) === a.file)) continue;
      bad.push(`${v.id}  ${rel(f)}:${v.line} — ${v.fix}`);
    }
  }
  if (bad.length) {
    console.log(`✗ [check:export] ${bad.length} chỗ viết lại đường xuất Excel của lõi:`);
    for (const b of bad) console.log('  ' + b);
    process.exit(1);
  }
  console.log(`✓ [check:export] ${files.length} tệp features/** — không chỗ nào viết lại exportRequest / runExport (lớp bọc gọi super thì được).`);
}
