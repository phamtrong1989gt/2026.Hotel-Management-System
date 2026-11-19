// =============================================================================
// check-examples.mjs — GUARD single-source cho example của tài liệu /doc-v3.
//   Luật: src/Core/FE/knowledge/doc-library/api-page-standard-v3.md §6. Thuộc chuỗi `npm run check`. Fail (exit 1) nếu vi phạm.
//   Example = COMPONENT THẬT ở doc-v3/examples/<nhóm>/<id>/<id>.example.{ts,html,scss}; trang nhúng bằng
//   <example-viewer name="<id>">; registry doc-v3/generated/ + assets/examples-source/ do examples-build.mjs sinh.
//
//   EX-01  folder example phải có <id>.example.ts chứa `export class …Example` (codegen chọn class *Example).
//   EX-02  id kebab-case và DUY NHẤT toàn bộ (registry + assets phẳng ⇒ trùng là đè nhau).
//   EX-03  component ví dụ mang selector 'ex-<id>' (helper @Component khác trong file vẫn được).
//   EX-04  templateUrl './<id>.example.html' + file .html tồn tại (template NGOÀI → single-source).
//   EX-05  <example-viewer name> trong trang doc-v3 phải trỏ tới example có thật (chống dead-ref).
//   EX-06  registry khớp folder (thiếu/thừa → chạy `npm run examples:build`).
//   EX-07  trang doc-v3 KHÔNG dùng <doc-example> / code= / script= (cơ chế v1 đã gỡ).
//   EX-08  example không trang nào nhúng = MỒ CÔI → xoá folder (rồi examples:build) hoặc nhúng vào trang.
// =============================================================================

import { readFileSync, existsSync, readdirSync } from '../../../../0.Core/src/Core/FE/tools/fe-overlay-fs.mjs';
import { join } from 'node:path';

const DOC_DIR = 'src/app/platform/doc-v3';
const EX_DIR = join(DOC_DIR, 'examples');
const REGISTRY = join(DOC_DIR, 'generated', 'example-registry.generated.ts');
const SKIP_PAGE_DIRS = new Set(['examples', 'generated']);

let fail = false;
/** Báo một vi phạm EX-*. Tham số: `code` mã luật; `msg` nội dung. Trả về: không. Tác dụng phụ: in lỗi và đặt cờ `fail`. */
const F = (code, msg) => { console.error(`[check:examples] ✗ ${code} ${msg}`); fail = true; };

if (!existsSync(DOC_DIR)) { console.log('[check:examples] (không có doc-v3 — bỏ qua)'); process.exit(0); }

const kebab = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const seenId = new Map();   // id -> nhóm (EX-02)
const foundIds = new Set(); // example hợp lệ

// --- quét example ---
const groups = existsSync(EX_DIR) ? readdirSync(EX_DIR, { withFileTypes: true }).filter(d => d.isDirectory()) : [];
for (const grp of groups) {
  const grpDir = join(EX_DIR, grp.name);
  for (const ex of readdirSync(grpDir, { withFileTypes: true })) {
    if (!ex.isDirectory()) continue;
    const id = ex.name;
    const tsPath = join(grpDir, id, `${id}.example.ts`);
    const htmlPath = join(grpDir, id, `${id}.example.html`);

    if (!kebab.test(id)) F('EX-02', `${grp.name}/${id}: id không kebab-case.`);
    if (seenId.has(id)) F('EX-02', `id "${id}" trùng ở examples/${seenId.get(id)} và examples/${grp.name}.`);
    seenId.set(id, grp.name);

    if (!existsSync(tsPath)) { F('EX-01', `examples/${grp.name}/${id}: thiếu ${id}.example.ts.`); continue; }
    const ts = readFileSync(tsPath, 'utf8');
    const esc = id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    if (!/export class \w+Example\b/.test(ts)) F('EX-01', `${id}.example.ts: thiếu 'export class …Example'.`);
    if (!new RegExp(`selector:\\s*['"]ex-${esc}['"]`).test(ts)) F('EX-03', `${id}.example.ts: không có selector "ex-${id}".`);
    if (!new RegExp(`templateUrl:\\s*['"]\\./${esc}\\.example\\.html['"]`).test(ts)) F('EX-04', `${id}.example.ts: không có templateUrl "./${id}.example.html".`);
    if (!existsSync(htmlPath)) F('EX-04', `examples/${grp.name}/${id}: thiếu ${id}.example.html.`);
    foundIds.add(id);
  }
}

// --- quét trang doc-v3 (mọi *.component.html ngoài examples/ + generated/) ---
const VIEWER_RE = /<example-viewer[^>]*\bname\s*=\s*["']([^"']+)["']/g;
const referenced = new Set();
const stack = [DOC_DIR];
let pages = 0;
while (stack.length) {
  const cur = stack.pop();
  for (const ent of readdirSync(cur, { withFileTypes: true })) {
    const p = join(cur, ent.name);
    if (ent.isDirectory()) { if (!(cur === DOC_DIR && SKIP_PAGE_DIRS.has(ent.name))) stack.push(p); continue; }
    if (!ent.name.endsWith('.component.html')) continue;
    pages++;
    const html = readFileSync(p, 'utf8');
    if (/<doc-example[\s>]/.test(html) || /\b(code|script)\s*=\s*['"]/.test(html))
      F('EX-07', `${ent.name}: còn <doc-example>/code=/script= (cơ chế v1 đã gỡ — dùng <example-viewer>).`);
    let m;
    while ((m = VIEWER_RE.exec(html)) !== null) {
      referenced.add(m[1]);
      if (!foundIds.has(m[1])) F('EX-05', `${ent.name}: <example-viewer name="${m[1]}"> không có folder examples/<nhóm>/${m[1]}/.`);
    }
  }
}

// --- EX-06: registry khớp folder ---
const reg = existsSync(REGISTRY) ? readFileSync(REGISTRY, 'utf8') : '';
const regKeys = new Set([...reg.matchAll(/["']([\w-]+)["']\s*:/g)].map(x => x[1]));
for (const id of foundIds) if (!regKeys.has(id)) F('EX-06', `registry thiếu "${id}" — chạy: npm run examples:build.`);
for (const key of regKeys) if (!foundIds.has(key)) F('EX-06', `registry còn "${key}" nhưng không có folder — chạy: npm run examples:build.`);

// --- EX-08: example mồ côi ---
// LỖI (không chỉ cảnh báo): example không trang nào nhúng = file chết + registry/bundle phình; doc-v2 đã xoá cùng
// 213 example chỉ nó dùng (2026-09-29) — từ đây tạo example thì nhúng ngay, bỏ nhúng thì xoá folder.
const ORPHAN_IS_ERROR = true;
const orphans = [...foundIds].filter(id => !referenced.has(id)).sort();
if (orphans.length) {
  const msg = `${orphans.length} example không trang doc-v3 nào nhúng (mồ côi) — xoá folder rồi examples:build, hoặc nhúng vào trang: `
    + orphans.slice(0, 12).join(', ') + (orphans.length > 12 ? ` …(+${orphans.length - 12})` : '');
  if (ORPHAN_IS_ERROR) F('EX-08', msg); else console.warn(`[check:examples] ⚠ EX-08 ${msg}`);
}

if (!fail) console.log(`[check:examples] ✓ ${foundIds.size} example single-source, ${pages} trang doc-v3 — không dead-ref${orphans.length ? '' : ', không mồ côi'}.`);
process.exit(fail ? 1 : 0);
