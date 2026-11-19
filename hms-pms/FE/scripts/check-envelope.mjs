#!/usr/bin/env node
// check-envelope — chặn tái phạm: code HẠ TẦNG dùng chung (platform/) KHÔNG được dot-access
// THẲNG field envelope BE (res.data / res.status / res.totalRecord / body.encryptData…). Phải đi qua
// ResponseAdapter (core/base/response-adapter.ts) → BE khác envelope chỉ provide RESPONSE_ADAPTER khác.
//
// VÌ SAO chỉ platform/: đây là kit tái dùng (base list/dialog/column-config…). Nếu nó dot-access
// envelope, lời hứa "swap envelope" vỡ cho MỌI form/list. `modules/` (copy-rồi-sở-hữu) + `features/`
// (app tiêu thụ) + `platform/doc-v3/` (tài liệu/showcase — TOP consumer, không phải infra tái dùng)
// tự chịu trách nhiệm response của mình → KHÔNG enforce.
//
// 3 TẦNG PHÁT HIỆN (v2 — vá lỗ "tên biến đánh bại regex"):
//   T1  field ĐẶC-TRƯNG-envelope (encryptData/encrypting/totalRecord/errorCode) trên MỌI biến
//       → gần như chắc chắn là envelope, bắt rộng (trừ `this.` = field nội bộ đã adapt).
//   T2  field MƠ HỒ (data/status/message/page/limit/language) chỉ trên biến HÌNH-DẠNG-RESPONSE
//       (res/response/resp/rs/r/body + mọi định danh kết thúc Res/Response/Resp/Rs, vd initRes,
//        statusRes, chunkRes, completeRes) → tránh false-positive với this.data/form.status.
//   T3  destructuring `const {data,status,totalRecord…} = <respVar|httpCall>`.
//
// Chạy: `node scripts/check-envelope.mjs` (gộp trong `npm run check`).

import { readFileSync, readdirSync, statSync } from '../../../../0.Core/src/Core/FE/tools/fe-overlay-fs.mjs';
import { join, sep, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const PLATFORM = join(ROOT, 'src', 'app', 'platform');

// File ĐƯỢC PHÉP đọc envelope (định nghĩa adapter/seam — nơi DUY NHẤT biết shape envelope).
const ALLOW = new Set(['response-adapter.ts']);

// ── Tập field ──────────────────────────────────────────────────────────────
// STRONG: chỉ tồn tại trên envelope Gradus → dot-access = leak, ở bất kỳ biến nào (trừ this.*).
const STRONG = 'encryptData|encrypting|totalRecord|errorCode';
// WEAK: field phổ thông, dễ trùng object khác → chỉ bắt khi biến có hình-dạng-response.
const WEAK = 'data|status|message|page|limit|language';
// Biến "hình dạng response": tên gốc quen thuộc + MỌI định danh kết thúc Res/Response/Resp/Rs/Data
// (vd initRes, statusRes, chunkRes, completeRes, outData, respData) → chặn "đổi tên biến để né guard".
const RESP_VAR = '(?:res|response|resp|rs|r|body|[\\w$]*(?:Res|Response|Resp|Rs|Data))';

// T1 — <ident>.<STRONG>, nhưng KHÔNG phải this.<STRONG> (field nội bộ đã adapt xong).
const T1 = new RegExp(`(?<!\\.)\\b(?!this\\b)[\\w$]+\\??\\.(?:${STRONG})\\b`);
// T2 — <respVar>.<WEAK>.
const T2 = new RegExp(`\\b${RESP_VAR}\\??\\.(?:${WEAK})\\b`);
// T3a — destructuring có field STRONG (đủ đặc trưng, không cần soi RHS).
const T3_STRONG = new RegExp(`\\{[^}]*\\b(?:${STRONG})\\b[^}]*\\}\\s*=`);
// T3b — destructuring data/status/message từ RHS hình-dạng-response (hoặc lời gọi http/service).
const T3_WEAK = new RegExp(`\\{[^}]*\\b(?:data|status|message)\\b[^}]*\\}\\s*=\\s*(?:await\\s+)?[^;=]*\\b${RESP_VAR}\\b`);

// Loại `//` comment đuôi dòng nhưng KHÔNG cắt nhầm `://` trong URL/string.
function stripTrailingComment(line) {
  const m = line.match(/(^|[^:])\/\//);
  return m ? line.slice(0, m.index + m[1].length) : line;
}

/** Duyệt đệ quy gom tệp `.ts` (bỏ `.spec.ts`). Tham số: `dir` thư mục gốc; `acc` mảng tích luỹ. Trả về: `acc`. Tác dụng phụ: đọc cây thư mục (qua overlay). */
function walk(dir, acc) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    const st = statSync(p);
    if (st.isDirectory()) walk(p, acc);
    else if (name.endsWith('.ts') && !name.endsWith('.spec.ts')) acc.push(p);
  }
  return acc;
}

const violations = [];
for (const file of walk(PLATFORM, [])) {
  // platform/doc-v3/ (tài liệu + example) = showcase/demo (TOP consumer, KHÔNG phải infra tái dùng) → không enforce,
  // như features/. Example có thể giả lập response thô để minh hoạ.
  { const np = file.split(sep).join('/'); if (np.includes('/src/app/platform/doc-v3/')) continue; }
  if (ALLOW.has(file.split(sep).pop())) continue;
  const lines = readFileSync(file, 'utf8').split('\n');
  let inBlockComment = false;
  lines.forEach((line, i) => {
    const t = line.trim();
    // Bỏ qua comment: block /* */, dòng JSDoc *, line //.
    if (inBlockComment) { if (t.includes('*/')) inBlockComment = false; return; }
    if (t.startsWith('/*')) { if (!t.includes('*/')) inBlockComment = true; return; }
    if (t.startsWith('//') || t.startsWith('*')) return;
    const code = stripTrailingComment(line);
    const hit = T1.test(code) ? 'T1:strong-field'
      : T2.test(code) ? 'T2:response-var'
      : (T3_STRONG.test(code) || T3_WEAK.test(code)) ? 'T3:destructure'
      : null;
    if (hit) {
      violations.push({
        file: file.split(sep).join('/').replace(/.*\/src\/app\//, 'src/app/'),
        line: i + 1, rule: hit, text: t.slice(0, 100),
      });
    }
  });
}

if (violations.length === 0) {
  console.log('✓ Envelope OK — platform/ không dot-access envelope (đi qua ResponseAdapter).');
  process.exit(0);
}
console.error(`✗ ${violations.length} chỗ platform/ dot-access envelope THẲNG (phải dùng responseAdapter.paged/mutation/payload):\n`);
for (const v of violations) console.error(`  ${v.file}:${v.line}  [${v.rule}]\n      ${v.text}`);
console.error('\nDùng `this.responseAdapter.{paged|mutation|payload}(res)` thay vì res.data/status/… Xem core/base/response-adapter.ts.');
process.exit(1);
