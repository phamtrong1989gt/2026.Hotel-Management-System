// =============================================================================
// check-i18n.mjs — GATE bản dịch PHẢI parse được (11.140).
//
//   Vì sao: PlatformTranslateLoader nuốt lỗi tải/parse từng nguồn → trả {} (cố ý, để thiếu file không vỡ app). Hệ quả là một
//   `src/assets/i18n/vi.json` hỏng (11.138–11.139: helpBody có xuống dòng THÔ trong chuỗi do patch nuốt "\n") làm MỌI nhãn app
//   (mọi màn nghiệp vụ…) hiện khóa thô mà tsc / bundle / 8 gate còn lại đều xanh. Máy bắt được thì máy bắt.
//
//   Quét: src/assets/i18n/*.json (app) · src/app/platform/i18n/*.json (global) · src/app/modules/**/i18n/*.json (resource) · src/app/features/**/i18n/*.json (màn dự án — UNRELEASED 2026-10-20).
//   Lỗi cứng (exit 1): JSON không parse; chuỗi chứa ký tự điều khiển thô (newline/tab) — JSON.parse đã ném nhưng báo rõ dòng để sửa.
//   Thuộc chuỗi `npm run check`.
// =============================================================================

import { readFileSync, existsSync, readdirSync, statSync } from '../../../../0.Core/src/Core/FE/tools/fe-overlay-fs.mjs';
import { join, dirname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { isAllCaps, midCapWords } from './i18n-title-rule.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
/** Đường dẫn tương đối so với gốc FE, dấu `/`. Tham số: `p` đường dẫn tuyệt đối. Trả về: chuỗi. Tác dụng phụ: không. */
const rel = (p) => relative(ROOT, p).split('\\').join('/');

/** Duyệt đệ quy gom tệp `.json` nằm trong thư mục `i18n/`. Tham số: `dir` thư mục (không có ⇒ rỗng); `acc` mảng tích luỹ. Trả về: `acc`. Tác dụng phụ: đọc cây thư mục (qua overlay). */
function walk(dir, acc = []) {
  if (!existsSync(dir)) return acc;
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, acc);
    else if (name.endsWith('.json') && rel(p).includes('/i18n/')) acc.push(p);
  }
  return acc;
}

const files = [
  ...walk(join(ROOT, 'src', 'assets', 'i18n')),
  ...walk(join(ROOT, 'src', 'app', 'platform', 'i18n')),
  ...walk(join(ROOT, 'src', 'app', 'modules')),
  ...walk(join(ROOT, 'src', 'app', 'features')),
];

// ── I18N-FEATURES-PAIR (UNRELEASED 2026-10-20, _pending i18n-theo-thu-muc-tinh-nang) ────────────────────────────
//    Trước đây luật I18N-FEATURES CẤM folder `i18n/` dưới features/ vì i18n-build không quét chỗ đó (2026-09-24 dời màn ai-pipeline sang
//    features/main: mất 41 nhãn lặng lẽ). Nay i18n-build QUÉT features/**/i18n (cùng quy ước với modules/) nên nguyên nhân gốc đã hết; "nhãn
//    không vào bundle" vẫn bị canh bằng phép "bundle khớp nguồn" ở dưới (nguồn nay gồm cả features). Còn lại một lỗi dễ mắc: thư mục i18n/ của
//    màn dự án chỉ có MỘT trong hai ngôn ngữ (vi mà thiếu en, hoặc ngược lại) ⇒ ngôn ngữ kia hiện khóa thô.
const i18nCapThieu = [];
for (const f of walk(join(ROOT, 'src', 'app', 'features'))) {
  const dir = dirname(f);
  for (const lang of ['vi', 'en']) if (!existsSync(join(dir, `${lang}.json`))) i18nCapThieu.push(`${rel(dir)}: thiếu ${lang}.json`);
}
if (i18nCapThieu.length) {
  console.error('✗ [check:i18n] folder i18n/ dưới features/ phải có CẢ vi.json VÀ en.json (thiếu một ngôn ngữ ⇒ ngôn ngữ đó hiện khóa thô):');
  for (const e of [...new Set(i18nCapThieu)]) console.error(`   ${e}`);
  process.exit(1);
}

// Dòng có xuống dòng thô trong chuỗi: đi từng ký tự theo trạng thái trong/ngoài chuỗi (như JSON.parse nhưng chỉ tới lỗi đầu tiên).
function rawNewlineInString(s) {
  let inStr = false, esc = false, line = 1;
  for (const c of s) {
    if (c === '\n') line++;
    if (!inStr) { if (c === '"') inStr = true; continue; }
    if (esc) { esc = false; continue; }
    if (c === '\\') { esc = true; continue; }
    if (c === '"') { inStr = false; continue; }
    if (c === '\n' || c === '\r' || c === '\t') return line - (c === '\n' ? 1 : 0);
  }
  return 0;
}

/**
 * 11.181b: KHÓA TRÙNG trong cùng một đối tượng. `JSON.parse` KHÔNG hề báo lỗi — nó lặng lẽ giữ khóa CUỐI và vứt khóa trước, nên
 * thêm nhầm một khối `"db": { … }` thứ hai là xoá sổ toàn bộ nhãn của khối `"db"` gốc; màn hiện khóa thô mà 9 gate vẫn xanh
 * (coder phải chụp màn hình báo).
 *
 * <b>Phải quét VĂN BẢN THÔ.</b> Cách dùng reviver của `JSON.parse` KHÔNG dùng được: reviver chỉ chạy trên KẾT QUẢ đã dựng xong,
 * lúc đó khóa trùng đã bị gộp mất rồi — thử nghiệm thấy nó im lặng cho qua.
 *
 * Bộ quét: đi từng ký tự, biết đang trong chuỗi hay ngoài (có xử lý \\ escape), giữ một ngăn xếp theo tầng đối tượng; chuỗi nào
 * đứng ngay trước dấu `:` và đang ở trong `{}` thì là KHÓA — gặp lại lần hai ở cùng tầng là trùng.
 */
function duplicateKeys(text) {
  const dups = [];
  const stack = [];            // mỗi phần tử: { isObject, keys:Set } — một tầng ngoặc
  let inString = false, escaped = false, current = '', lastString = null;

  for (let k = 0; k < text.length; k++) {
    const c = text[k];
    if (inString) {
      if (escaped) { escaped = false; current += c; continue; }
      if (c === '\\') { escaped = true; continue; }
      if (c === '"') { inString = false; lastString = current; current = ''; continue; }
      current += c;
      continue;
    }
    if (c === '"') { inString = true; current = ''; continue; }
    if (c === '{') { stack.push({ isObject: true, keys: new Set() }); lastString = null; continue; }
    if (c === '[') { stack.push({ isObject: false, keys: null }); lastString = null; continue; }
    if (c === '}' || c === ']') { stack.pop(); lastString = null; continue; }
    if (c === ':') {
      const top = stack[stack.length - 1];
      if (top?.isObject && lastString !== null) {
        if (top.keys.has(lastString)) dups.push(lastString); else top.keys.add(lastString);
      }
      lastString = null;
      continue;
    }
    if (c === ',') { lastString = null; continue; }
  }
  return [...new Set(dups)];
}

const errors = [];
for (const f of files) {
  const s = readFileSync(f, 'utf8');
  try {
    JSON.parse(s);
    const dups = duplicateKeys(s);
    if (dups.length) errors.push(`${rel(f)}: KHÓA TRÙNG ${dups.map((d) => `"${d}"`).join(', ')} — JSON.parse giữ khối CUỐI và vứt khối trước, mọi nhãn của khối trước sẽ hiện khóa thô. Gộp lại làm một.`);
  }
  catch (e) {
    const ln = rawNewlineInString(s);
    errors.push(`${rel(f)}: ${ln ? `xuống dòng/tab THÔ trong chuỗi ở dòng ${ln} (viết "\\n" — patch bằng Write/Edit, không heredoc Bash)` : e.message}`);
  }
}

if (errors.length) {
  console.error(`✗ [check:i18n] ${errors.length} file bản dịch hỏng (không parse được, hoặc có khóa trùng) → nhãn sẽ hiện khóa thô:`);
  for (const e of errors) console.error('   ' + e);
  process.exit(1);
}

// ── 11.145b: bundle SINH RA (assets/i18n-platform/<lang>.json — gitignored, loader fetch) phải KHỚP nguồn (global + module). ──
//   Vì sao: i18n-build chỉ chạy qua hook prestart/prebuild; agent stack chạy `start:agent` (nay có prestart:agent) — nhãn thêm trong cycle
//   (user-session.revokedAt) nằm ở module vi.json mà bundle cũ không có → màn hiện khóa thô dù 9 gate xanh. Bundle chưa có (clone mới) → bỏ qua.
function findI18nFiles(dir, lang, acc = []) {
  if (!existsSync(dir)) return acc;
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (!statSync(p).isDirectory()) continue;
    if (name === 'i18n') { const f = join(p, `${lang}.json`); if (existsSync(f)) acc.push(f); }
    else findI18nFiles(p, lang, acc);
  }
  return acc;
}
/** San phẳng đối tượng bản dịch lồng nhau thành `{ "a.b.c": JSON-của-giá-trị }` để so bundle sinh ra với nguồn. Tham số: `obj` đối tượng; `prefix` tiền tố khoá; `acc` bảng tích luỹ. Trả về: `acc`. Tác dụng phụ: không (chỉ ghi vào `acc`). */
function flatten(obj, prefix = '', acc = {}) {
  for (const [k, v] of Object.entries(obj ?? {})) {
    const key = prefix ? `${prefix}.${k}` : k;
    if (v && typeof v === 'object' && !Array.isArray(v)) flatten(v, key, acc); else acc[key] = JSON.stringify(v);
  }
  return acc;
}
// ── I18N-TITLE: tiêu đề màn phải viết CÂU THƯỜNG (11.182c) ────────────────────────────────────────────────────────────
//    Coder chốt chuẩn sau khi thấy app tự mâu thuẫn ("Quản lý Menu" vs "Quản lý menu"): hoa chữ đầu, còn lại thường, trừ
//    danh từ riêng / viết tắt đã khai. Luật + danh sách danh từ riêng nằm ở i18n-title-rule.mjs — DÙNG CHUNG với
//    scripts/fix-i18n-titles.mjs để bên bắt và bên sửa không bao giờ lệch nhau.
//    Sửa hàng loạt: `node scripts/fix-i18n-titles.mjs --apply`.
const badTitles = [];
for (const f of files) {
  let json; try { json = JSON.parse(readFileSync(f, 'utf8')); } catch { continue; }   // JSON hỏng đã bị bắt ở trên
  if (!rel(f).endsWith('/vi.json')) continue;   // chuẩn này là của tiếng Việt; bản dịch khác có quy ước riêng
  for (const [ns, v] of Object.entries(json)) {
    if (!v || typeof v !== 'object' || typeof v.title !== 'string' || !v.title.trim()) continue;
    const t = v.title;
    if (isAllCaps(t)) badTitles.push(`${rel(f)} · ${ns}.title: "${t}" — viết hoa toàn bộ`);
    else {
      const mid = midCapWords(t);
      if (mid.length) badTitles.push(`${rel(f)} · ${ns}.title: "${t}" — hoa giữa câu: ${mid.join(', ')}`);
    }
  }
}
if (badTitles.length) {
  console.error(`✗ [check:i18n] ${badTitles.length} tiêu đề màn sai kiểu chữ (chuẩn: CÂU THƯỜNG — xem /doc-v3/ui-standards §10):`);
  for (const b of badTitles) console.error('   ' + b);
  console.error('   → sửa hàng loạt: node scripts/fix-i18n-titles.mjs --apply · tên riêng mới thì khai vào PROPER trong scripts/i18n-title-rule.mjs');
  process.exit(1);
}
// ── I18N-TWIN (UNRELEASED 2026-10-22, _bmad/_pending fe-hai-module-cung-khuon-chuoi-i18n-cung-truong-lech-nhau) ───────────────────────────
//    Dev 2026-10-21: "đồng bộ với 2 module, kể cả resource nữa cùng 1 bảng mà text sai". Các module hồ sơ (kê khai · tỉnh duyệt · TW duyệt · địa điểm
//    đã duyệt) dùng CÙNG bảng / khối nhưng chuỗi nằm ở nhiều nơi (assets/i18n và features/**/i18n) nên sửa một bên dễ quên bên kia.
//    "Module song sinh" = hai namespace gốc của màn dự án (assets/i18n hoặc features/**/i18n) có >= TWIN_MIN_SHARED đường khoá TRÙNG TÊN — tự phát hiện,
//    không phải duy trì danh sách. Luật: cùng đường khoá + cùng tiếng Việt thì tiếng Anh phải GIỐNG (tiếng Việt khác ⇒ ngữ cảnh khác, không soi).
//    Muốn gộp hẳn: chuỗi dùng chung ở features/shared/i18n (root `submission`). Khác ngữ cảnh THẬT ⇒ khai TWIN_ALLOW kèm lý do.
//    KHÔNG canh được (văn xuôi, ux/kinds/detail-dialog.md "Hàng chi tiết dùng CHUNG nhãn"): cùng khái niệm nhưng KHÁC TÊN khoá (vd section* ↔ group*).
const TWIN_MIN_SHARED = 40;
const TWIN_ALLOW = [];   // { a: 'ns-a', b: 'ns-b', key: 'đường.khoá', why: 'lý do ngữ cảnh khác thật' } — hiện rỗng
{
  const flatStr = (o, prefix = '', acc = {}) => {
    for (const [k, v] of Object.entries(o ?? {})) {
      const key = prefix ? `${prefix}.${k}` : k;
      if (v && typeof v === 'object' && !Array.isArray(v)) flatStr(v, key, acc); else acc[key] = v;
    }
    return acc;
  };
  const nsMap = {};   // namespace gốc -> { vi: {đường.khoá: chuỗi}, en: {...} }
  for (const f of files) {
    const r = rel(f);
    const lang = r.endsWith('/vi.json') ? 'vi' : r.endsWith('/en.json') ? 'en' : null;
    if (!lang || !(r.startsWith('src/assets/i18n/') || r.startsWith('src/app/features/'))) continue;
    let json; try { json = JSON.parse(readFileSync(f, 'utf8')); } catch { continue; }   // JSON hỏng đã bị bắt ở trên
    for (const [ns, v] of Object.entries(json)) if (v && typeof v === 'object') (nsMap[ns] ??= { vi: {}, en: {} })[lang] = flatStr(v);
  }
  const names = Object.keys(nsMap);
  const twinGroups = new Map();   // `đường.khoá|vi` -> Map(namespace -> en) — gộp theo khoá để một lỗi không báo lặp theo từng cặp
  let twinPairs = 0;
  for (let i = 0; i < names.length; i++) for (let j = i + 1; j < names.length; j++) {
    const a = nsMap[names[i]], b = nsMap[names[j]];
    const shared = Object.keys(a.vi).filter((k) => k in b.vi);
    if (shared.length < TWIN_MIN_SHARED) continue;
    twinPairs++;
    for (const k of shared) {
      if (a.vi[k] !== b.vi[k] || (a.en[k] ?? '') === (b.en[k] ?? '')) continue;
      if (TWIN_ALLOW.some((x) => ((x.a === names[i] && x.b === names[j]) || (x.a === names[j] && x.b === names[i])) && x.key === k)) continue;
      const g = twinGroups.get(`${k}|${a.vi[k]}`) ?? twinGroups.set(`${k}|${a.vi[k]}`, new Map()).get(`${k}|${a.vi[k]}`);
      g.set(names[i], a.en[k] ?? ''); g.set(names[j], b.en[k] ?? '');
    }
  }
  const twinErrors = [...twinGroups].map(([id, m]) => `${id.split('|')[0]} (vi "${id.slice(id.indexOf('|') + 1).slice(0, 40)}"): ${[...m].map(([ns, en]) => `${ns} = "${en}"`).join(' · ')}`);
  if (twinErrors.length) {
    console.error(`✗ [check:i18n] I18N-TWIN: ${twinErrors.length} khoá có tiếng Việt GIỐNG nhau nhưng tiếng Anh KHÁC giữa các module cùng khuôn (cùng bảng / trường ⇒ cùng chữ):`);
    for (const e of twinErrors.slice(0, 40)) console.error('   ' + e);
    console.error('   → sửa bản en của MỘT bên cho khớp bên kia, hoặc chuyển chuỗi dùng chung ra features/shared/i18n (root `submission`); khác ngữ cảnh THẬT ⇒ khai TWIN_ALLOW (a, b, key, why) trong scripts/check-i18n.mjs. Quy ước: _bmad/custom/fe/rules/R-fe.23.i18n-keys.md "Module song sinh".');
    process.exit(1);
  }
  globalThis.__twinSummary = `${twinPairs} cặp module song sinh (>= ${TWIN_MIN_SHARED} khoá trùng tên) khớp en`;
}
const stale = [];
for (const lang of ['vi', 'en']) {
  const bundlePath = join(ROOT, 'src', 'assets', 'i18n-platform', `${lang}.json`);
  if (!existsSync(bundlePath)) continue;
  const expected = { ...JSON.parse(readFileSync(join(ROOT, 'src', 'app', 'platform', 'i18n', `${lang}.json`), 'utf8')) };
  for (const f of [...findI18nFiles(join(ROOT, 'src', 'app', 'modules'), lang), ...findI18nFiles(join(ROOT, 'src', 'app', 'features'), lang)]) Object.assign(expected, JSON.parse(readFileSync(f, 'utf8')));
  const want = flatten(expected), have = flatten(JSON.parse(readFileSync(bundlePath, 'utf8')));
  const missing = Object.keys(want).filter((k) => have[k] !== want[k]);
  const extra = Object.keys(have).filter((k) => want[k] === undefined);
  if (missing.length || extra.length)
    stale.push(`${lang}: ${missing.length} khóa thiếu/lệch${missing.length ? ` (vd ${missing.slice(0, 3).join(', ')})` : ''}, ${extra.length} khóa thừa`);
}
if (stale.length) {
  console.error('✗ [check:i18n] bundle assets/i18n-platform CŨ so với nguồn — màn hiện khóa thô. Chạy `npm run i18n:build` (agent stack tự chạy qua prestart:agent):');
  for (const s of stale) console.error('   ' + s);
  process.exit(1);
}

// ── Luật "KHÔNG dùng nội dung phần tử làm khóa dịch" (2026-10-13) ───────────────────────────────────────────────────────────
// ngx-translate 18: `<span translate>KEY</span>` / `<span translate>{{ expr }}</span>` (thuộc tính `translate` TRẦN) là đường cũ, in cảnh báo
// "Using element content as a translation key is deprecated and will be removed in v19" và biến mất ở bản 19 → nhãn hiện khóa thô.
// Dùng pipe `{{ 'KEY' | translate }}` / `{{ expr | translate: params }}` hoặc `[translate]="'KEY'"` (có giá trị).
function parseOpenTag(s, i) {
  const m = /^<([A-Za-z][\w-]*)/.exec(s.slice(i, i + 80)); if (!m) return null;
  let p = i + m[0].length; const attrs = [];
  while (p < s.length) {
    while (p < s.length && /\s/.test(s[p])) p++;
    if (s[p] === '>') return { tag: m[1], attrs, end: p + 1 };
    if (s[p] === '/' && s[p + 1] === '>') return { tag: m[1], attrs, end: p + 2 };
    const st = p;
    while (p < s.length && !/[\s=>]/.test(s[p]) && !(s[p] === '/' && s[p + 1] === '>')) p++;
    const name = s.slice(st, p); if (!name) return null;
    let val = null;
    if (s[p] === '=') {
      p++; const q = s[p];
      if (q === '"' || q === "'") { const e = s.indexOf(q, p + 1); if (e < 0) return null; val = s.slice(p + 1, e); p = e + 1; }
      else { const st2 = p; while (p < s.length && !/[\s>]/.test(s[p])) p++; val = s.slice(st2, p); }
    }
    attrs.push({ name, val });
  }
  return null;
}
/** Tìm thẻ dùng thuộc tính `translate` TRẦN (nội dung phần tử làm khoá dịch — ngx-translate 19 sẽ bỏ). Tham số: `src` mã HTML. Trả về: danh sách chuỗi `<thẻ translate> (dòng N)`. Tác dụng phụ: không. */
function bareTranslateHits(src) {
  const hits = []; let i = 0;
  while ((i = src.indexOf('<', i)) >= 0) {
    const o = parseOpenTag(src, i);
    if (!o) { i++; continue; }
    if (o.attrs.some((a) => a.name === 'translate' && a.val === null)) hits.push(`<${o.tag} translate>  (dòng ${src.slice(0, i).split('\n').length})`);
    i = o.end;
  }
  return hits;
}
const contentKeyErrors = [];
(function scan(dir) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) { scan(p); continue; }
    let text;
    if (name.endsWith('.html')) text = readFileSync(p, 'utf8');
    else if (name.endsWith('.ts') && !name.endsWith('.spec.ts')) text = [...readFileSync(p, 'utf8').matchAll(/template:\s*`([\s\S]*?)`/g)].map((m) => m[1]).join('\n');
    else continue;
    if (!text) continue;
    for (const h of bareTranslateHits(text)) contentKeyErrors.push(`${rel(p)}: ${h}`);
  }
})(join(ROOT, 'src', 'app'));
if (contentKeyErrors.length) {
  console.error(`✗ [check:i18n] ${contentKeyErrors.length} chỗ dùng NỘI DUNG PHẦN TỬ làm khóa dịch (thuộc tính \`translate\` trần) — ngx-translate 19 sẽ bỏ. Đổi sang \`{{ 'KEY' | translate }}\` / \`{{ expr | translate }}\` (kèm tham số: \`| translate: { n: x }\`) hoặc \`[translate]="'KEY'"\`:`);
  for (const e of contentKeyErrors.slice(0, 40)) console.error('   ' + e);
  process.exit(1);
}

console.log(`[check:i18n] ✓ ${files.length} file bản dịch parse được (app + global + resource + features); bundle i18n-platform khớp nguồn; tiêu đề màn đúng kiểu câu thường; ${globalThis.__twinSummary}.`);
