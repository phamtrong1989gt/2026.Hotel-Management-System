#!/usr/bin/env node
// check-architecture — "đóng băng" luật phụ thuộc 1 chiều: features → ui → core.
// Không cần ESLint/dependency. Chạy: `node scripts/check-architecture.mjs` (hoặc `npm run check:arch`).
//
// Luật vàng (PROPOSAL_ARCHITECTURE §2):
//   core   KHÔNG được import ui / layout / features(pages)
//   ui     KHÔNG được import layout / features(pages)
//   layout KHÔNG được import features(pages)
//   platform/doc-v3/ = tài liệu (trang + example + khung doc) → TOP consumer (được import mọi layer để demo),
//                   nhưng KHÔNG layer nào (core/ui/layout/theme/vendor/modules/features) được import doc.
//                   (doc/ v1 và doc-v2/ đã xoá hẳn — 2026-07-14 và 2026-09-29.)
// (theme/ = utilities tầng thấp, ai import cũng được — không tính vi phạm.)

import { readFileSync, readdirSync, statSync } from '../../../../0.Core/src/Core/FE/tools/fe-overlay-fs.mjs';
import { join, sep, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const APP = join(ROOT, 'src', 'app');

// layer của 1 file theo đường dẫn. MỌI .ts dưới src/app PHẢI ra 1 layer (fail-closed):
// file thư mục lạ → null → guard BÁO LỖI (rename/di chuyển desync sẽ đỏ, không lọt im lặng).
function fileLayer(p) {
  const n = p.split(sep).join('/');
  if (n.includes('/src/app/platform/core/')) return 'core';
  if (n.includes('/src/app/platform/ui/')) return 'ui';
  if (n.includes('/src/app/platform/layout/')) return 'layout';
  if (n.includes('/src/app/platform/theme/')) return 'theme';   // utility tầng thấp — chỉ được import core
  if (n.includes('/src/app/platform/doc-v3/')) return 'doc';   // ⭐ tài liệu /doc-v3 (trang + example + khung doc) — TOP consumer (import mọi layer), KHÔNG ai ngoài doc được import doc
  if (n.includes('/src/app/platform/')) return 'vendor';   // platform-root/vendor (vd versions.ts) = infra tầng thấp
  if (n.includes('/src/app/modules/')) return 'modules';   // ⭐ tách khỏi platform/ (starter business modules)
  if (n.includes('/src/app/features/')) return 'features';
  if (/\/src\/app\/[^/]+\.ts$/.test(n)) return 'approot';   // app.config/app.routes/app.component — được import tất cả
  return null; // .ts trong thư mục LẠ dưới src/app → fail-closed (báo lỗi)
}

// layer của 1 import string. `fromFile` = file nguồn (để resolve relative chính xác).
function importLayer(spec, fromFile) {
  if (spec.startsWith('@core/')) return 'core';
  if (spec.startsWith('@ui/')) return 'ui';
  if (spec.startsWith('@modules/')) return 'modules';
  if (spec.startsWith('@layout/')) return 'layout';
  if (spec.startsWith('@theme/')) return 'theme';
  if (spec.startsWith('@features/')) return 'features';
  // Relative ('./' hoặc '../') → resolve về path tuyệt đối rồi phân loại bằng fileLayer.
  // Bắt MỌI hướng rò qua relative (../../ui, ../../core, ../../modules…), không chỉ features/layout.
  if (spec.startsWith('.') && fromFile) return fileLayer(resolve(dirname(fromFile), spec));
  return null;
}

// vi phạm: nguồn -> các đích CẤM. Tầng: core < ui < {modules, layout} < features.
// modules & layout là PEER (đều dùng ui/core, KHÔNG import nhau); features dùng tất cả.
const FORBIDDEN = {
  vendor: new Set(['ui', 'modules', 'layout', 'features', 'doc']),   // platform-root infra — chỉ core/theme
  theme: new Set(['ui', 'modules', 'layout', 'features', 'doc']),   // utility tầng thấp nhất — chỉ core
  core: new Set(['ui', 'modules', 'layout', 'features', 'doc']),
  ui: new Set(['modules', 'layout', 'features', 'doc']),
  modules: new Set(['layout', 'features', 'doc']),   // module tái dùng KHÔNG biết app-shell/app-features/showcase
  layout: new Set(['modules', 'features', 'doc']),
  doc: new Set(), // showcase/tài liệu = TOP consumer (import mọi layer để demo), nhưng KHÔNG layer nào được import doc
  features: new Set(['doc']), // features import gì cũng được, TRỪ doc (doc là showcase độc lập)
  approot: new Set(), // app.config/app.routes bootstrap — ráp mọi layer, không cấm
};

/** Duyệt đệ quy `dir` gom mọi tệp `.ts` (bỏ `.spec.ts`). Tham số: `dir` thư mục cần quét; `acc` mảng tích luỹ. Trả về: `acc` đã đầy. Tác dụng phụ: đọc cây thư mục (qua lớp overlay của lõi). */
function walk(dir, acc) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    const st = statSync(p);
    if (st.isDirectory()) walk(p, acc);
    else if (name.endsWith('.ts') && !name.endsWith('.spec.ts')) acc.push(p);
  }
  return acc;
}

const IMPORT_RE = /(?:import|export)\s[^'"]*from\s*['"]([^'"]+)['"]|import\s*\(\s*['"]([^'"]+)['"]\s*\)/g;

const violations = [];
const unclassified = [];
for (const file of walk(APP, [])) {
  const src = fileLayer(file);
  if (src === null) { unclassified.push(file.split(sep).join('/').replace(/.*\/src\/app\//, 'src/app/')); continue; }
  if (FORBIDDEN[src].size === 0) continue;
  const code = readFileSync(file, 'utf8');
  let m;
  while ((m = IMPORT_RE.exec(code)) !== null) {
    const spec = m[1] || m[2];
    if (!spec) continue;
    const tgt = importLayer(spec, file);
    if (tgt && FORBIDDEN[src].has(tgt)) {
      violations.push({ file: file.split(sep).join('/').replace(/.*\/src\/app\//, 'src/app/'), src, tgt, spec });
    }
  }
}

if (violations.length === 0 && unclassified.length === 0) {
  console.log('✓ Architecture OK — không vi phạm luật features → ui → core.');
  process.exit(0);
}
if (unclassified.length > 0) {
  console.error(`✗ ${unclassified.length} file .ts dưới src/app KHÔNG phân loại được layer (fail-closed — có thể do rename/di chuyển folder):\n`);
  for (const f of unclassified) console.error(`  ${f}`);
  console.error('\nMỗi .ts dưới src/app phải thuộc platform(core/ui/layout/theme/vendor)/modules/features/approot. Thêm nhánh vào fileLayer() hoặc dời file đúng chỗ.');
}
if (violations.length > 0) {
  console.error(`✗ ${violations.length} vi phạm luật phụ thuộc:\n`);
  for (const v of violations) {
    console.error(`  [${v.src} → ${v.tgt}]  ${v.file}\n      import '${v.spec}'`);
  }
  console.error('\nLuật: features → ui → core (1 chiều). Xem src/Core/FE/knowledge/PROPOSAL_ARCHITECTURE.md §2.');
}
process.exit(1);
