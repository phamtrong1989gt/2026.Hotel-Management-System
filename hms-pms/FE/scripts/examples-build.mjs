// =============================================================================
// examples-build.mjs — SINGLE SOURCE OF TRUTH cho ExampleViewer (kiểu Angular Material).
// -----------------------------------------------------------------------------
// Quét doc-v3/examples/<nhóm>/<id>/<id>.example.{ts,html,scss} (COMPONENT THẬT), rồi:
//   1. Ghi RAW source ra assets/examples-source/<id>.json  → ExampleViewer FETCH hiển thị (cách A).
//   2. Sinh registry doc-v3/generated/example-registry.generated.ts (id -> component class) → NgComponentOutlet render.
// Cùng 1 file vật lý vừa render demo vừa là source hiển thị → demo & code KHÔNG BAO GIỜ lệch.
// Chạy ở prebuild/prestart/prewatch (xem package.json). Luật: src/Core/FE/knowledge/doc-library/api-page-standard-v3.md §6.
// =============================================================================

import { readFileSync, writeFileSync, readdirSync, existsSync, mkdirSync, rmSync, watch } from '../../../../0.Core/src/Core/FE/tools/fe-overlay-fs.mjs';
import { join } from 'node:path';

const DOC_DIR = 'src/app/platform/doc-v3';
const EX_DIR = join(DOC_DIR, 'examples');
const ASSETS_DIR = 'src/assets/examples-source';
const GEN_DIR = join(DOC_DIR, 'generated');
const REGISTRY_FILE = join(GEN_DIR, 'example-registry.generated.ts');

// --- snapshot: quét + ghi assets + registry (chạy 1 lần, hoặc mỗi lần file đổi ở --watch) ---
function snapshot() {
const examples = [];
const groups = existsSync(EX_DIR) ? readdirSync(EX_DIR, { withFileTypes: true }).filter(d => d.isDirectory()) : [];
for (const grp of groups) {
  const grpDir = join(EX_DIR, grp.name);
  for (const ex of readdirSync(grpDir, { withFileTypes: true })) {
    if (!ex.isDirectory()) continue;
    const id = ex.name;
    const dir = join(grpDir, id);
    const files = {};
    for (const ext of ['ts', 'html', 'scss']) {
      const p = join(dir, `${id}.example.${ext}`);
      if (existsSync(p)) files[ext] = readFileSync(p, 'utf8').replace(/\s+$/, '');
    }
    if (!files.ts) { console.warn(`[examples] BỎ QUA ${id}: thiếu ${id}.example.ts`); continue; }
    // Ưu tiên class `<Pascal>Example` (convention) — tránh grab nhầm helper `export class` (vd
    // MockHttpClient / PaginatorIntl) đứng TRƯỚC @Component ⇒ registry trỏ sai class → NgComponentOutlet fail.
    const className = (files.ts.match(/export class (\w+Example)\b/) || files.ts.match(/export class (\w+)/) || [])[1];
    if (!className) { console.warn(`[examples] BỎ QUA ${id}: không thấy 'export class'`); continue; }
    examples.push({ id, group: grp.name, files, className });
  }
}
examples.sort((a, b) => a.id.localeCompare(b.id));

// --- 1) RAW source → assets/examples-source/<id>.json (cách A: fetch) --------
// INCREMENTAL (2026-09-15): trước đây rmSync cả thư mục rồi ghi lại ~500 file mỗi lần dù không đổi → ~1 000 sự kiện
// file → VS Code (TS server / Angular LS / watcher extension Claude — cùng extension host) phân tích lại → host đứng
// vài chục giây. Giờ: chỉ ghi khi nội dung đổi, chỉ xóa file mồ côi → chạy lại không đổi gì = 0 sự kiện.
mkdirSync(ASSETS_DIR, { recursive: true });
/** Ghi tệp chỉ khi nội dung khác bản đang có (chạy lại không đổi gì ⇒ 0 sự kiện tệp, IDE không phân tích lại). Tham số: `file` đường dẫn; `content` nội dung mới. Trả về: true nếu đã ghi. Tác dụng phụ: ghi đĩa. */
const writeIfChanged = (file, content) => {
  if (existsSync(file) && readFileSync(file, 'utf8') === content) return false;
  writeFileSync(file, content, 'utf8');
  return true;
};
let written = 0, removed = 0;
const keep = new Set(examples.map(e => `${e.id}.json`));
for (const e of examples) if (writeIfChanged(join(ASSETS_DIR, `${e.id}.json`), JSON.stringify(e.files))) written++;
for (const f of readdirSync(ASSETS_DIR)) if (f.endsWith('.json') && !keep.has(f)) { rmSync(join(ASSETS_DIR, f), { force: true }); removed++; }

// --- 2) registry (id -> component class) → NgComponentOutlet -----------------
if (!existsSync(GEN_DIR)) mkdirSync(GEN_DIR, { recursive: true });
let imports = '', map = '';
for (const e of examples) {
  imports += `import { ${e.className} } from '../examples/${e.group}/${e.id}/${e.id}.example';\n`;
  map += `  ${JSON.stringify(e.id)}: ${e.className},\n`;
}
const reg = `// AUTO-GENERATED bởi scripts/examples-build.mjs — KHÔNG SỬA TAY.
// id ví dụ -> component class THẬT. ExampleViewer render qua NgComponentOutlet.
// Source code hiển thị: fetch assets/examples-source/<id>.json (KHÔNG hardcode).
import { Type } from '@angular/core';
${imports}
export const EXAMPLE_REGISTRY: Record<string, Type<unknown>> = {
${map}};
`;
const regChanged = writeIfChanged(REGISTRY_FILE, reg);

console.log(`[examples] ${examples.length} example → ghi ${written} json đổi, xóa ${removed} mồ côi, registry ${regChanged ? 'đổi' : 'giữ'}`);
}

snapshot();

// --watch : re-snapshot mỗi khi file *.example.* đổi (dev-sync tức thì, code tab luôn = file thật)
if (process.argv.includes('--watch')) {
  console.log('[examples] watch mode — theo dõi *.example.*');
  let t;
  watch(EX_DIR, { recursive: true }, (_evt, file) => {
    if (!file || !String(file).includes('.example.')) return;
    clearTimeout(t);
    t = setTimeout(snapshot, 150);
  });
}
