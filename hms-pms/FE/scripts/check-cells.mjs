#!/usr/bin/env node
// check-cells — chặn ORPHAN cell_type/find_type: literal dùng trong column-config nhưng KHÔNG có
// renderer → rơi @default im lặng (render raw/rỗng), build VẪN xanh. Đúng class bug review tìm ra
// (một màn cũ dùng updatedUser/managerDepartmentId). Chạy: npm run check:cells.
//
// "Có renderer" = 1 trong:
//   • GENERIC (text/number/index/action/'' …) — @default @else render value thô hoặc cột table-level
//   • prefix ĐỘNG (cc-/sfs-/tags-/bool-icon/st-) — @default lo
//   • có @case ở renderer g-cell (hiển thị) / g-cell-find (lọc)
//   • có @case BESPOKE ở template module (vd languageVersion ở banner/menu/static-html; healthStatus ở màn thiết bị)
//   ✖ ORPHAN = không thuộc nhóm nào → LỖI (exit 1)
// (Renderer legacy base-cell-table/base-cell-find-table ĐÃ XOÁ — chỉ còn g-cell/g-cell-find.)
// Cột dùng builder `cell: cellXxx()`/`find: findSelect()` (object) không set chuỗi → không bị soi (đúng).
// STT-01: lưới của features/** (columnConfigs không rỗng) phải mở bằng colStt() — xem khối riêng bên dưới.
// PILL-01: chữ trong cellPill / cellIcon / cellBoolPill / cellBoolIcon KHÔNG được là khoá i18n (ô vẽ nguyên văn, không dịch) — khối riêng bên dưới.

import { readFileSync, readdirSync, statSync, existsSync } from '../../../../0.Core/src/Core/FE/tools/fe-overlay-fs.mjs';
import { join, dirname, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { findI18nKeyInVerbatimCells } from './pill-i18n-rule.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const APP = join(ROOT, 'src', 'app');
const T = join(APP, 'platform', 'ui', 'table');

// GENERIC = @default render thô / cột table-level. 'status' = g-cell applyLegacy remap→'bool' +
// g-cell-find @case('status') (ct-select-for-bool) → LUÔN có renderer, không phải @case literal ở g-cell.
const GENERIC = new Set(['', 'text', 'number', 'index', 'action', 'stt', 'status']);
const DISPLAY_DYN = ['cc-', 'tags-', 'tags:', 'bool-icon-', 'bool-icon:', 'st-', 'text-'];
const FIND_DYN = ['sfs-'];

/** Đọc một tệp văn bản UTF-8. Tham số: `p` đường dẫn (logic, qua overlay). Trả về: nội dung chuỗi. Tác dụng phụ: đọc đĩa. */
const read = (p) => readFileSync(p, 'utf8');
/** Rút gọn đường dẫn để in lỗi. Tham số: `p` đường dẫn tuyệt đối. Trả về: chuỗi dạng `src/app/...` (dấu `/`). Tác dụng phụ: không. */
const rel = (p) => p.split(sep).join('/').replace(/.*\/src\/app\//, 'src/app/');
/** Gom mọi nhãn `@case ('…')` trong một tệp template. Tham số: `text` nội dung HTML / TS. Trả về: `Set` các nhãn. Tác dụng phụ: không. */
function casesOf(text) {
  const set = new Set();
  for (const m of text.matchAll(/@case\s*\(\s*'([^']*)'\s*\)/g)) set.add(m[1]);
  return set;
}

const fR = {
  dispG: join(T, 'g-cell', 'g-cell.component.ts'),
  findG: join(T, 'g-cell-find', 'g-cell-find.component.ts'),
};
const DISPLAY_GCELL = casesOf(read(fR.dispG));
const FIND_GCELL = casesOf(read(fR.findG));
const RENDERER_PATHS = new Set(Object.values(fR).map((p) => p.split(sep).join('/')));

// @case BESPOKE: gom từ MỌI *.component.html (trừ 4 renderer) — module tự render type theo col.key
const BESPOKE = new Set();
// usages: cell_type/find_type literal đang dùng
const uses = { cell: new Map(), find: new Map() };
/** Ghi một lần dùng của literal `v` kèm vị trí `loc` vào bảng `map` (khoá → danh sách vị trí). Trả về: độ dài danh sách sau khi thêm. Tác dụng phụ: sửa `map`. */
const add = (map, v, loc) => (map.get(v) ?? map.set(v, []).get(v)).push(loc);

(function walk(dir) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) { if (name !== 'vendor') walk(p); continue; }
    const norm = p.split(sep).join('/');
    if (name.endsWith('.component.html') && !RENDERER_PATHS.has(norm)) {
      for (const c of casesOf(read(p))) BESPOKE.add(c);
    }
    if (name.endsWith('.ts') && !name.endsWith('.spec.ts')) {
      read(p).split(/\r?\n/).forEach((line, i) => {
        const tr = line.trim();
        if (tr.startsWith('//') || tr.startsWith('*') || tr.startsWith('/*')) return;
        for (const m of line.matchAll(/\bcell_type:\s*'([^']+)'/g)) if (m[1]) add(uses.cell, m[1], rel(p) + ':' + (i + 1));
        for (const m of line.matchAll(/\bfind_type:\s*'([^']+)'/g)) if (m[1]) add(uses.find, m[1], rel(p) + ':' + (i + 1));
      });
    }
  }
})(APP);

// 11.93: cột DATA dùng key cấu trúc (select/stt/action) → trùng matColumnDef với colSelect/colStt/colAction (trang chết
// "Duplicate column definition") hoặc cell action đè cell data. Đúng: col('actionText', { field: 'action' }).
const STRUCTURAL = ['select', 'stt', 'action'];
const structuralMisuse = [];
(function walk2(dir) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) { if (name !== 'vendor') walk2(p); continue; }
    if (!name.endsWith('.component.ts')) continue;
    read(p).split(/\r?\n/).forEach((line, i) => {
      const tr = line.trim();
      if (tr.startsWith('//') || tr.startsWith('*') || tr.startsWith('/*')) return;
      const m = line.match(/\bcol\(\s*'(select|stt|action)'/);
      if (m) structuralMisuse.push(`${rel(p)}:${i + 1} col('${m[1]}') → dùng colSelect()/colStt()/colAction() hoặc col('${m[1]}Text', { field: '${m[1]}' })`);
    });
  }
})(APP);
if (structuralMisuse.length) {
  console.error(`✗ ${structuralMisuse.length} cột sai cấu trúc (key cấu trúc ${STRUCTURAL.join('/')} trùng matColumnDef):`);
  for (const s of structuralMisuse) console.error('   ' + s);
  process.exit(1);
}

// STT-01 (UNRELEASED 2026-10-22, _bmad/_pending fe-luoi-con-thieu-cot-stt-khuon-child-table-khong-sinh-colstt; dev: "yêu cầu bắt buộc phải có cột stt chứ"):
// MỌI lưới của màn dự án (features/**) có `columnConfigs` KHÔNG rỗng phải mở bằng `colStt()` (đứng sau `colSelect()` nếu có). Lưới con trong tab
// (camera, nhật ký) từng sinh ra thiếu STT vì khuôn child-table không có. `columnConfigs = []` = màn không dùng máy bảng (workspace / chi tiết / lưới
// thẻ) KHÔNG phải lưới ⇒ không áp. Phạm vi KHÔNG gồm `modules/` + `platform/` (mã lõi: đo 2026-10-22 có 7 lưới `modules/**` + 1 `platform/**` cũng
// thiếu STT — sửa lõi cần dev duyệt). Lúc thêm luật: features/** thiếu 0 ⇒ để ERROR ngay, không cần nới.
const STT_SCOPE = join(APP, 'features');
const sttMissing = [];
// kho chưa có features/ (khung trắng) ⇒ không có lưới nào để kiểm
if (existsSync(STT_SCOPE)) (function walk3(dir) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) { walk3(p); continue; }
    if (!name.endsWith('.ts') || name.endsWith('.spec.ts')) continue;
    const src = read(p);
    const m = /columnConfigs\s*(?::\s*TableColumnConfig\[\])?\s*=\s*\[/.exec(src);
    if (!m) continue;
    let depth = 1, j = m.index + m[0].length;
    while (j < src.length && depth > 0) {   // lấy thân mảng bằng đếm ngoặc vuông, bỏ qua chuỗi
      const c = src[j];
      if (c === "'" || c === '"' || c === '`') { j++; while (j < src.length && src[j] !== c) j += src[j] === '\\' ? 2 : 1; }
      else if (c === '[') depth++;
      else if (c === ']') depth--;
      j++;
    }
    const body = src.slice(m.index + m[0].length, j - 1).replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/[^\n]*/g, '$1').trim();
    if (!body) continue;                                   // columnConfigs rỗng — không phải lưới
    if (!/^(?:colSelect\(\)\s*,\s*)?colStt\(\)/.test(body)) {
      const line = src.slice(0, m.index).split('\n').length;
      sttMissing.push(`${rel(p)}:${line} — columnConfigs không rỗng nhưng KHÔNG mở bằng colStt() (hoặc colSelect(), colStt())`);
    }
  }
})(STT_SCOPE);
if (sttMissing.length) {
  console.error(`✗ STT-01: ${sttMissing.length} lưới thiếu cột STT (ux/kinds/list.md "Cột STT"):`);
  for (const s of sttMissing) console.error('   ' + s);
  console.error("\nFix: thêm `colStt(),` làm cột ĐẦU (sau colSelect() nếu có) + import colStt từ '@ui/base/base-main-module.component'. STT là cột cấu trúc — KHÔNG khai ở screens.yaml columns[].");
  process.exit(1);
}

// PILL-01 (UNRELEASED 2026-11-03, _bmad/_pending fe-cellpill-text-khong-duoc-dich-nen-khoa-i18n-hien-tho-khong-co-may-bat): chữ trong cellPill / cellIcon / cellBoolPill /
// cellBoolIcon được vẽ NGUYÊN VĂN (g-cell không qua pipe translate) — điền KHOÁ i18n vào đó thì giao diện hiện khoá thô mà check:i18n + check:cells ở trên vẫn xanh
// (ca thật: màn Đồng bộ hệ thống phân tích hiện `analysis-sync.statusName.0`). Nhãn từ danh mục / enum ⇒ cellCategory(source, { pill: true, colors, icons }); còn lại ghi
// chữ tiếng Việt nguyên văn. Hàm thuần + ca phá: scripts/pill-i18n-rule.mjs, scripts/tests/pill-i18n-rule.test.mjs. Đo 2026-11-03: features/** vi phạm 0 ⇒ để ERROR ngay.
const pillKeyHits = [];
if (existsSync(STT_SCOPE)) (function walk4(dir) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) { walk4(p); continue; }
    if (!name.endsWith('.ts') || name.endsWith('.spec.ts')) continue;
    for (const h of findI18nKeyInVerbatimCells(read(p))) pillKeyHits.push(`${rel(p)}:${h.line} — ${h.fn}(…) chứa khoá i18n '${h.key}' (chữ trong ô được vẽ NGUYÊN VĂN, không dịch)`);
  }
})(STT_SCOPE);
if (pillKeyHits.length) {
  console.error(`✗ PILL-01: ${pillKeyHits.length} ô pill / icon chứa KHOÁ i18n (giao diện sẽ hiện khoá thô):`);
  for (const s of pillKeyHits) console.error('   ' + s);
  console.error("\nFix: nhãn lấy từ enum / danh mục ⇒ cellCategory(source, { pill: true, colors, icons }) + findSelect(<cùng khoá>) (nhãn do BE trả qua [CategoryEnum] + [Display]); nhãn cố định ⇒ chữ tiếng Việt nguyên văn trong text.");
  process.exit(1);
}

/** Literal `v` có bắt đầu bằng một tiền tố ĐỘNG trong `dyn` không (renderer mặc định lo). Trả về: boolean. Tác dụng phụ: không. */
const isDyn = (v, dyn) => dyn.some((p) => v.startsWith(p));
const orphans = [];

/** Kiểm từng literal đã dùng: không thuộc nhóm chung / tiền tố động và không có `@case` (renderer lõi `gSet` hoặc template module) ⇒ ghi vào `orphans`. Tham số: `map` bảng literal → vị trí; `dyn` tiền tố động; `gSet` tập `@case` của renderer. Trả về: không. Tác dụng phụ: thêm vào mảng `orphans`. */
function check(map, dyn, gSet) {
  for (const [val, locs] of map) {
    if (GENERIC.has(val) || isDyn(val, dyn)) continue;
    const inG = gSet.has(val), inBespoke = BESPOKE.has(val);
    if (!inG && !inBespoke) orphans.push({ val, locs });
  }
}
check(uses.cell, DISPLAY_DYN, DISPLAY_GCELL);
check(uses.find, FIND_DYN, FIND_GCELL);

if (orphans.length) {
  console.error(`✗ ${orphans.length} ORPHAN — KHÔNG renderer nào có @case (rơi @default → raw/rỗng):`);
  for (const o of orphans) console.error(`   ${o.val}\n      ${o.locs.join(', ')}`);
  console.error('\nFix: thêm @case ở renderer, đổi sang cc-/sfs- (lookup động), hoặc dùng builder cell:/find:.');
  process.exit(1);
}
console.log(`✓ check:cells OK — ${uses.cell.size} cell + ${uses.find.size} find literal đều có renderer; 0 cột data dùng key cấu trúc; mọi lưới features/** (columnConfigs không rỗng) mở bằng colStt() (STT-01); 0 ô pill / icon chứa khoá i18n (PILL-01).`);
