#!/usr/bin/env node
// =============================================================================
// check-doc-v3.mjs — GUARD "thống nhất giao diện" cho trang API doc-v3 (chuẩn 3-box).
//   Luật: src/Core/FE/knowledge/doc-library/api-page-standard-v3.md.
//   OPT-IN: chỉ soi trang ĐÃ theo chuẩn (có class `doc-block`). Trang api-* chưa ốp → WARN
//   (bảng theo dõi migrate), KHÔNG fail.
//
//   Mỗi component = 1 <doc-section> có ĐỦ 3 box theo thứ tự:
//     .doc-block        (API — @Input, xanh primary)
//     .doc-block--use   (Khi nào dùng, amber)
//     .doc-block--demo  (Ví dụ chạy thật, xanh lá — chứa <example-viewer>)
//   BỎ hẳn "Snippet chuẩn"/<pre> (live example thay thế). Brace/@block PHẢI escape.
// =============================================================================

import { readFileSync, readdirSync, existsSync } from '../../../../0.Core/src/Core/FE/tools/fe-overlay-fs.mjs';
import { join } from 'node:path';

const V3 = 'src/app/platform/doc-v3';
let fail = false;
/** Báo một vi phạm DOCV3-*. Tham số: `code` mã luật; `f` tên tệp rút gọn; `msg` nội dung. Trả về: không. Tác dụng phụ: in lỗi và đặt cờ `fail`. */
const F = (code, f, msg) => { console.error(`[check:doc-v3] ✗ ${code} ${f}: ${msg}`); fail = true; };

/** Duyệt đệ quy gom tệp `*.component.html`. Tham số: `dir` thư mục gốc; `acc` mảng tích luỹ. Trả về: `acc`. Tác dụng phụ: đọc cây thư mục (qua overlay). */
function walk(dir, acc) {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) walk(p, acc);
    else if (e.name.endsWith('.component.html')) acc.push(p);
  }
  return acc;
}

if (existsSync(V3)) {
  let checked = 0, pending = 0;
  for (const file of walk(V3, [])) {
    const html = readFileSync(file, 'utf8');
    const rel = file.split(/[\\/]/).slice(-2).join('/');
    const isApiPage = /[\\/]api-[^\\/]+\.component\.html$/.test(file);

    // OPT-IN: trang không dùng .doc-block = chưa ốp (landing/layout) → bỏ qua (đếm nếu là api-*).
    if (!html.includes('doc-block')) { if (isApiPage) pending++; continue; }
    checked++;

    // DOCV3-01 — brace thô: trang API v3 KHÔNG có interpolation/ICU → mọi { } phải escape &#123;/&#125;.
    const braces = (html.match(/[{}]/g) || []).length;
    if (braces) F('DOCV3-01', rel, `còn ${braces} ký tự { } thô → escape &#123;/&#125; (tránh lỗi ICU + đồng nhất).`);

    // DOCV3-02 — @block thô (@if/@for/@switch/@case/@default/@empty/@let/@defer…) phải escape &#64;.
    if (/@(if|for|switch|case|default|empty|let|defer|placeholder|loading|error)\b/.test(html))
      F('DOCV3-02', rel, `còn @block thô (vd @if/@case/@default) → escape &#64;.`);

    // DOCV3-03 — KHÔNG section "Snippet chuẩn (copy nhanh)" trùng lặp (control trực quan đã có ví dụ live).
    //   `<pre>` VẪN cho phép TRONG box Ví dụ của control phi trực quan (service) làm code-example.
    if (/Snippet chuẩn/i.test(html)) F('DOCV3-03', rel, `còn section "Snippet chuẩn" → chuẩn v3 bỏ (control trực quan dùng <example-viewer>; service dùng <pre> trong box Ví dụ).`);

    // DOCV3-04 — trang phải có ≥1 box "Khi nào dùng"; mỗi box Ví dụ (--demo) chứa demo:
    //   <example-viewer> (trực quan) HOẶC <pre> code (service). Box Ví dụ TUỲ CHỌN → không ép #use===#demo.
    const nUse = (html.match(/doc-block--use/g) || []).length;
    const nDemo = (html.match(/doc-block--demo/g) || []).length;
    const nViewer = (html.match(/<example-viewer/g) || []).length;
    const nPre = (html.match(/<pre[\s>]/g) || []).length;
    if (nUse === 0)
      F('DOCV3-04', rel, `không có box "Khi nào dùng" (.doc-block--use) nào — mỗi component cần box API + Khi nào dùng.`);
    if (nDemo > 0 && (nViewer + nPre) < nDemo)
      F('DOCV3-04', rel, `${nDemo} box Ví dụ nhưng chỉ ${nViewer + nPre} demo (<example-viewer>/<pre>) — box Ví dụ phải chứa demo.`);

    // DOCV3-05 — mỗi box có header: #(.doc-block__head) === #box.
    const nBox = (html.match(/class="doc-block\b/g) || []).length;
    const nHead = (html.match(/doc-block__head/g) || []).length;
    if (nHead < nBox) F('DOCV3-05', rel, `${nBox} box nhưng chỉ ${nHead} .doc-block__head — mỗi box phải có header.`);
  }

  if (pending) console.warn(`[check:doc-v3] ⚠ ${pending} trang api-* chưa "ốp" sang chuẩn 3-box (.doc-block) — migrate dần (api-page-standard-v3.md §3).`);
  if (!fail) console.log(`[check:doc-v3] ✓ ${checked} trang doc-v3 hợp chuẩn 3-box.`);
}

process.exit(fail ? 1 : 0);
