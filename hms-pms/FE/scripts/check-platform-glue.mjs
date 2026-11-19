#!/usr/bin/env node
// check-platform-glue — "đóng băng" PHẦN GLUE thủ công mà ứng dụng FE cần để BUILD với nguồn chung (src/Core/FE).
// Chạy: `node scripts/check-platform-glue.mjs` (gộp trong `npm run check`).
//
// VÌ SAO: từ bước 1 (D-CORE-81 / D-CORE-84) `platform/` không còn là bản chép trong ứng dụng mà là MỘT nguồn chung ở src/Core/FE; ngoài nó, ứng dụng
// còn vài mảnh glue THỦ CÔNG, nếu thiếu → build vỡ ÂM THẦM / nhãn i18n trắng / bản production vẫn mang theo cả cây tài liệu doc-v3:
//   1) tsconfig path alias (@platform/@core/@ui/@layout/@theme → nguồn chung; @modules → cục bộ TRƯỚC, nguồn chung SAU; @features → ứng dụng).
//   2) hook i18n (postinstall/prestart/prebuild/prewatch) — thiếu = fresh-clone mất TOÀN BỘ nhãn (file i18n gộp gitignored, chỉ sinh qua hook).
//   3) angular.json assets có 'src/assets' — thiếu = file i18n-platform sinh ra KHÔNG được serve.
//   4) angular.json: monaco assets lấy từ thư mục SINH <FE>/.generated/monaco-vs (hook npm chạy Core/FE/tools/sync-monaco-assets.mjs chép từ node_modules hoist ở src/;
//      builder Angular từ chối asset nằm ngoài gốc dự án, nên KHÔNG trỏ thẳng node_modules) · scss includePaths có nguồn chung.
//   5) angular.json: cấu hình production thay doc-v3.routes.ts bằng doc-v3.routes.off.ts (doc-v3 không phát hành), và app.routes.ts nạp doc-v3 đúng
//      đường dẫn được thay (@platform/doc-v3/doc-v3.routes) — nếu import chỗ khác thì phép thay thế vô tác dụng.
//   6) angular.json: cấu hình production GHI ĐÈ `assets` để LOẠI src/assets/examples-source/** (339 tệp JSON mã ví dụ của doc-v3, ≈1,75 MB, sinh bởi examples-build;
//      doc-v3 đã tắt ở production nên chỉ làm phình bản phát hành + lộ cấu trúc bộ control — review an ninh 2026-11-04) mà VẪN giữ i18n/img (src/assets), monaco (assets/vs), public, web.config.
//      Cấu hình dev (development/agent/linked/gateway/local) KHÔNG ghi đè `assets` ⇒ doc-v3 ở dev vẫn đọc được ví dụ.
// Guard này bắt cấu hình thiếu NGAY, thay vì để dev mới mò.

import { existsSync, readFileSync, FE_APP } from '../../../../0.Core/src/Core/FE/tools/fe-overlay-fs.mjs';
import { join, dirname, resolve, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

/**
 * Đọc một tệp JSON có chú thích (tsconfig / angular.json): bỏ chú thích dòng và chú thích khối (tôn trọng chuỗi) và dấu phẩy thừa trước khi parse.
 * @param rel đường dẫn tương đối so với gốc ứng dụng
 * @returns đối tượng đã parse
 */
function readJsonc(rel) {
  const raw = readFileSync(join(ROOT, rel), 'utf8');
  let out = '', inStr = false, q = '', i = 0;
  while (i < raw.length) {
    const c = raw[i], n = raw[i + 1];
    if (inStr) {
      out += c;
      if (c === '\\') { out += n; i += 2; continue; }
      if (c === q) inStr = false;
      i++; continue;
    }
    if (c === '"' || c === "'") { inStr = true; q = c; out += c; i++; continue; }
    if (c === '/' && n === '/') { while (i < raw.length && raw[i] !== '\n') i++; continue; }
    if (c === '/' && n === '*') { i += 2; while (i < raw.length && !(raw[i] === '*' && raw[i + 1] === '/')) i++; i += 2; continue; }
    out += c; i++;
  }
  // bỏ trailing comma (hợp lệ trong jsonc, vỡ JSON.parse)
  out = out.replace(/,(\s*[}\]])/g, '$1');
  return JSON.parse(out);
}

const errors = [];

// 1) tsconfig path alias — alias → thư mục ĐÍCH BẮT BUỘC (tính từ tsconfig.json). Nguồn chung = <kit>/platform (src/Core/FE); KHÔNG chấp nhận bản chép cục bộ.
const KIT = resolve(ROOT, FE_APP.kit);
const EXPECT_ALIAS = {
  '@platform/*': join(KIT, 'platform'),
  '@core/*': join(KIT, 'platform', 'core'),
  '@ui/*': join(KIT, 'platform', 'ui'),
  '@layout/*': join(KIT, 'platform', 'layout'),
  '@theme/*': join(KIT, 'platform', 'theme'),
  '@features/*': join(ROOT, 'src/app/features'),
};
/** Đổi dấu phân cách đường dẫn về '/' để so sánh không phụ thuộc hệ điều hành. */
const slash = (p) => p.split(sep).join('/');
/** Bỏ đuôi '/*' của một mục trong `paths` rồi đổi thành đường dẫn tuyệt đối (tính từ thư mục chứa tsconfig.json). */
const target = (p) => slash(resolve(ROOT, p.endsWith('/*') ? p.slice(0, -2) : p));
try {
  const ts = readJsonc('tsconfig.json');
  const paths = ts.compilerOptions?.paths || {};
  for (const [alias, want] of Object.entries(EXPECT_ALIAS)) {
    const got = paths[alias]?.[0];
    if (!got) errors.push(`tsconfig.json: THIẾU path alias "${alias}"`);
    else if (target(got) !== slash(want)) errors.push(`tsconfig.json: alias "${alias}" trỏ "${got}" — kỳ vọng ${slash(relative(ROOT, want))}`);
  }
  const mods = paths['@modules/*'] || [];
  if (!mods[0] || target(mods[0]) !== slash(join(ROOT, 'src/app/modules'))) errors.push('tsconfig.json: alias "@modules/*" phải trỏ ./src/app/modules/* ĐẦU TIÊN (cục bộ thắng)');
  if (!mods.slice(1).some((m) => target(m) === slash(join(KIT, 'modules')))) errors.push('tsconfig.json: alias "@modules/*" thiếu mục dự phòng trỏ nguồn chung (<kit>/modules/*)');
} catch (e) { errors.push(`tsconfig.json: không đọc được (${e.message})`); }

// 2) package.json hook i18n — 4 hook đều phải gọi i18n-build (fresh-clone an toàn).
const EXPECT_HOOKS = ['postinstall', 'prestart', 'prebuild', 'prewatch'];
try {
  const pkg = readJsonc('package.json');
  const scripts = pkg.scripts || {};
  for (const h of EXPECT_HOOKS) {
    if (!scripts[h]) errors.push(`package.json: THIẾU hook "${h}" (cần chạy i18n-build → fresh-clone mất nhãn)`);
    else if (!scripts[h].includes('i18n-build')) errors.push(`package.json: hook "${h}" KHÔNG gọi i18n-build ("${scripts[h]}")`);
    // Cùng bốn hook phải chép asset Monaco vào .generated/monaco-vs (angular.json trỏ vào đó) — thiếu = ng serve / build chết ngay ("asset path must be within the workspace root")
    else if (!scripts[h].includes('sync-monaco-assets')) errors.push(`package.json: hook "${h}" KHÔNG gọi sync-monaco-assets ("${scripts[h]}") — angular.json lấy monaco từ .generated/monaco-vs`);
  }
} catch (e) { errors.push(`package.json: không đọc được (${e.message})`); }

// 3) + 4) + 5) angular.json
try {
  const ng = readJsonc('angular.json');
  const projects = ng.projects || {};
  const proj = projects[ng.defaultProject] || Object.values(projects)[0];
  const build = proj?.architect?.build || proj?.targets?.build;
  const assets = build?.options?.assets || [];
  const hasSrcAssets = assets.some(a => a === 'src/assets' || a?.input === 'src/assets' || a?.glob && a?.input?.includes('src/assets'));
  if (!hasSrcAssets) errors.push(`angular.json: build.assets THIẾU "src/assets" → i18n-platform sinh ra không được serve.`);

  // 4) monaco từ thư mục SINH trong chính FE (.generated/monaco-vs — do sync-monaco-assets chép từ node_modules hoist ở src/) ; scss includePaths có nguồn chung
  const MONACO_INPUT = join(ROOT, '.generated', 'monaco-vs');
  const monaco = assets.find((a) => typeof a === 'object' && /monaco/.test(a.input ?? ''));
  if (!monaco) errors.push('angular.json: build.assets THIẾU monaco (editor nhúng nạp assets/vs).');
  else {
    if (slash(resolve(ROOT, monaco.input)) !== slash(MONACO_INPUT))
      errors.push(`angular.json: monaco assets input "${monaco.input}" — kỳ vọng ${slash(relative(ROOT, MONACO_INPUT))} (Angular cấm asset ngoài gốc dự án; node_modules hoist ở src/ nằm NGOÀI nên phải chép vào đây bằng sync-monaco-assets)`);
    if (monaco.output !== 'assets/vs') errors.push(`angular.json: monaco assets output "${monaco.output}" — kỳ vọng "assets/vs" (editor nhúng nạp từ đó).`);
  }
  // Thư mục sinh phải bị .gitignore (≈25 MB, không commit)
  try {
    if (!/^\/\.generated\/?\s*$/m.test(readFileSync(join(ROOT, '.gitignore'), 'utf8'))) errors.push('.gitignore: THIẾU dòng "/.generated/" (thư mục sinh monaco ≈25 MB sẽ bị commit).');
  } catch (e) { errors.push(`.gitignore: không đọc được (${e.message})`); }
  const inc = build?.options?.stylePreprocessorOptions?.includePaths ?? [];
  if (!inc.some((p) => slash(resolve(ROOT, p)) === slash(KIT))) errors.push(`angular.json: stylePreprocessorOptions.includePaths phải có "${FE_APP.kit}" (scss của ứng dụng @import "platform/theme/…" phân giải qua đây).`);

  // 5) doc-v3 không phát hành trong bản production
  const repl = build?.configurations?.production?.fileReplacements ?? [];
  const wantReplace = slash(join(KIT, 'platform/doc-v3/doc-v3.routes.ts'));
  const wantWith = slash(join(KIT, 'platform/doc-v3/doc-v3.routes.off.ts'));
  if (!repl.some((r) => slash(resolve(ROOT, r.replace)) === wantReplace && slash(resolve(ROOT, r.with)) === wantWith))
    errors.push('angular.json: cấu hình production THIẾU fileReplacements doc-v3.routes.ts → doc-v3.routes.off.ts (doc-v3 sẽ lọt vào bản phát hành).');
  if (!existsSync(wantWith)) errors.push(`${FE_APP.kit}/platform/doc-v3/doc-v3.routes.off.ts không tồn tại.`);
  const routes = readFileSync(join(ROOT, 'src/app/app.routes.ts'), 'utf8');
  if (!/import\(\s*['"]@platform\/doc-v3\/doc-v3\.routes['"]\s*\)/.test(routes))
    errors.push("src/app/app.routes.ts: phải nạp doc-v3 bằng import('@platform/doc-v3/doc-v3.routes') — đường khác không bị fileReplacements thay.");

  // 6) bản production không mang ví dụ doc-v3 (examples-source) — cấu hình production ghi đè `assets` và loại thư mục đó; cấu hình dev không đụng `assets`.
  const prodAssets = build?.configurations?.production?.assets;
  if (!Array.isArray(prodAssets)) errors.push('angular.json: cấu hình production THIẾU khoá "assets" ghi đè → src/assets/examples-source/** (339 tệp mã ví dụ doc-v3) lọt vào bản phát hành.');
  else {
    // Mục kéo thư mục src/assets: dạng chuỗi (không loại được gì) KHÔNG đạt; dạng đối tượng phải có ignore chứa examples-source.
    const assetsEntry = prodAssets.find((a) => typeof a === 'object' && slash(String(a.input ?? '')).replace(/\/+$/, '') === 'src/assets');
    if (prodAssets.some((a) => a === 'src/assets')) errors.push('angular.json: production.assets còn mục chuỗi "src/assets" (kéo nguyên thư mục) — phải dùng dạng {glob,input,ignore:["examples-source/**"]}.');
    if (!assetsEntry) errors.push('angular.json: production.assets THIẾU mục {input:"src/assets"} (i18n-platform sinh ra không được serve).');
    else {
      if (assetsEntry.output !== 'assets') errors.push(`angular.json: production.assets mục src/assets có output "${assetsEntry.output}" — kỳ vọng "assets" (đường chuỗi cũ "src/assets" xuất ra assets/).`);
      if (!(assetsEntry.ignore ?? []).some((g) => /^examples-source(\/\*\*(\/\*)?)?$/.test(String(g)))) errors.push('angular.json: production.assets mục src/assets THIẾU ignore "examples-source/**" — 339 tệp mã ví dụ doc-v3 lọt vào bản phát hành.');
    }
    // Ba mục còn lại của options.assets không được rơi mất khi ghi đè: favicon, monaco → assets/vs, public, web.config.
    if (!prodAssets.includes('src/favicon.ico')) errors.push('angular.json: production.assets THIẾU "src/favicon.ico" (options.assets bị ghi đè nhưng thiếu mục này).');
    const pMonaco = prodAssets.find((a) => typeof a === 'object' && /monaco/.test(a.input ?? ''));
    if (!pMonaco || pMonaco.output !== 'assets/vs' || slash(resolve(ROOT, pMonaco.input)) !== slash(MONACO_INPUT)) errors.push('angular.json: production.assets THIẾU/sai mục monaco (.generated/monaco-vs → assets/vs) — editor nhúng chết ở bản phát hành.');
    if (!prodAssets.some((a) => typeof a === 'object' && a.input === 'public')) errors.push('angular.json: production.assets THIẾU mục {input:"public"}.');
    if (!prodAssets.some((a) => typeof a === 'object' && a.glob === 'web.config' && a.input === 'src')) errors.push('angular.json: production.assets THIẾU mục web.config (CSP/HSTS sinh ra bởi web-config-build không vào bản phát hành).');
  }
  for (const [name, conf] of Object.entries(build?.configurations ?? {})) {
    if (name !== 'production' && name !== 'uat' && conf && 'assets' in conf) errors.push(`angular.json: cấu hình "${name}" ghi đè "assets" — doc-v3 ở dev cần src/assets/examples-source đầy đủ (chỉ production và uat — cấu hình phát hành — được loại).`);
  }
  // 7) cấu hình `uat` (bản phát hành thử nghiệm; tệp environment.uat.ts do công cụ triển khai sinh, gitignore) là BẢN SAO của production, CHỈ khác tệp environment.
  //    Lõi nâng cấp mà thêm / đổi gì ở production (budgets, assets, fileReplacements, outputHashing…) quên uat ⇒ bản UAT lệch bản phát hành mà build vẫn xanh — nên so sánh sâu ở đây.
  const uat = build?.configurations?.uat;
  if (uat) {
    const stable = (v) => (Array.isArray(v) ? v.map(stable) : v && typeof v === 'object' ? Object.fromEntries(Object.keys(v).sort().map((k) => [k, stable(v[k])])) : v);
    const withoutEnvironment = (c) => stable({ ...c, fileReplacements: (c?.fileReplacements ?? []).filter((r) => !/environment\.(prod|uat)\.ts$/.test(String(r.with))) });
    if (JSON.stringify(withoutEnvironment(uat)) !== JSON.stringify(withoutEnvironment(build?.configurations?.production))) errors.push('angular.json: cấu hình "uat" LỆCH production ngoài tệp environment — uat phải là bản sao production (chỉ environment.prod.ts → environment.uat.ts); sao lại cấu hình production sang uat (tài liệu triển khai của dự án).');
    const envReplacements = (uat.fileReplacements ?? []).filter((r) => /environment\.uat\.ts$/.test(String(r.with)));
    if (envReplacements.length !== 1 || envReplacements[0].replace !== 'src/environments/environment.ts') errors.push('angular.json: cấu hình "uat" phải có đúng MỘT fileReplacements src/environments/environment.ts → src/environments/environment.uat.ts.');
  }
} catch (e) { errors.push(`angular.json: không đọc được (${e.message})`); }

if (errors.length === 0) {
  console.log('✓ Platform glue OK — tsconfig alias + i18n hook + angular.json (assets, monaco .generated, includePaths, doc-v3 off + loại examples-source ở production) đủ.');
  process.exit(0);
}
console.error(`✗ ${errors.length} thiếu sót GLUE (ứng dụng sẽ build lỗi/mất nhãn/mang theo doc-v3):\n`);
for (const e of errors) console.error('  • ' + e);
console.error('\nXem comment đầu file + src/Core/FE/README.md.');
process.exit(1);
