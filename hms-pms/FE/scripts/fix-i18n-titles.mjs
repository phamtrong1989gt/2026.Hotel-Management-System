#!/usr/bin/env node
// =============================================================================
// fix-i18n-titles.mjs — QUÉT TOÀN BỘ nhãn tiêu đề màn và sửa về CÂU THƯỜNG (11.182c).
//
//   Coder: "Tôi cần 1 tiêu chuẩn, nếu cần sửa có thể quét hết để sửa."
//   Luật ở i18n-title-rule.mjs (dùng chung với gate check-i18n — một nguồn, không lệch).
//
//   Quét CẢ HAI hệ resource cùng tồn tại trong dự án:
//     • src/app/platform/i18n + src/app/modules/**/i18n/vi.json — bộ theo module (gộp qua i18n-build)
//     • src/assets/i18n/vi.json                                  — bộ cũ của app (màn trong features/)
//   Bỏ sót một hệ là sửa nửa vời, màn cũ vẫn lệch.
//
//   Chạy:  node scripts/fix-i18n-titles.mjs          → chỉ LIỆT KÊ, không đụng tệp
//          node scripts/fix-i18n-titles.mjs --apply  → ghi thật
// =============================================================================

import { readFileSync, writeFileSync, existsSync, readdirSync, statSync } from '../../../../0.Core/src/Core/FE/tools/fe-overlay-fs.mjs';
import { join } from 'node:path';
import { isAllCaps, midCapWords, isOk, toSentenceCase, OVERRIDES } from './i18n-title-rule.mjs';

const APPLY = process.argv.includes('--apply');
/** Đổi dấu phân cách đường dẫn về `/`. Tham số: `p` đường dẫn. Trả về: chuỗi. Tác dụng phụ: không. */
const norm = (p) => p.replace(/\\/g, '/');

const files = [];
(function walk(dir) {
  if (!existsSync(dir)) return;
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p);
    else if (norm(p).endsWith('/i18n/vi.json')) files.push(p);
  }
})('src/app');
if (existsSync('src/assets/i18n/vi.json')) files.push('src/assets/i18n/vi.json');

let scanned = 0, changed = 0, manual = 0;
for (const file of files) {
  const raw = readFileSync(file, 'utf8');
  let next = raw;
  let json;
  try { json = JSON.parse(raw); } catch { console.warn(`⚠ bỏ qua (JSON hỏng): ${norm(file)}`); continue; }

  for (const [ns, v] of Object.entries(json)) {
    if (!v || typeof v !== 'object' || typeof v.title !== 'string') continue;
    const old = v.title;
    if (!old.trim()) continue;
    scanned++;
    if (isOk(old)) continue;

    const fixed = OVERRIDES[old] ?? toSentenceCase(old);
    const why = isAllCaps(old) ? 'viết hoa toàn bộ' : 'hoa giữa câu: ' + midCapWords(old).join(', ');
    const tag = OVERRIDES[old] ? ' (khai tay)' : '';
    if (OVERRIDES[old]) manual++;
    console.log(`${norm(file).replace(/^.*?src\//, 'src/')}  ${ns}\n    ${old}\n  → ${fixed}   [${why}]${tag}`);

    // Thay ĐÚNG chuỗi giá trị trong văn bản gốc để giữ nguyên thứ tự khóa, thụt lề và chú thích của tệp.
    const needle = `"title": ${JSON.stringify(old)}`;
    if (!next.includes(needle)) { console.warn(`    ⚠ không định vị được trong văn bản gốc — bỏ qua`); continue; }
    next = next.replace(needle, `"title": ${JSON.stringify(fixed)}`);
    changed++;
  }

  if (APPLY && next !== raw) writeFileSync(file, next, 'utf8');
}

console.log('');
console.log(`Quét ${files.length} tệp resource · ${scanned} tiêu đề · ${changed} cần sửa (${manual} khai tay).`);
console.log(APPLY ? '→ ĐÃ GHI.' : '→ Chỉ liệt kê. Thêm --apply để ghi thật.');
