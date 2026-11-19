#!/usr/bin/env node
// i18n-build — gộp bản dịch thành file served per-lang cho FE.
//   nguồn (file vi.json + en.json RIÊNG trong folder i18n/, MỖI RESOURCE 1 folder):
//     • platform/i18n/{lang}.json              — GLOBAL ui-shared (button/base/validate/ct-password)
//     • modules/<x>/<resource>/i18n/{lang}.json — mỗi RESOURCE (banner/menu/city/users…) 1 folder i18n/
//     • features/<m>/<resource>/i18n/{lang}.json — màn DỰ ÁN (UNRELEASED 2026-10-20, _pending i18n-theo-thu-muc-tinh-nang): cùng quy ước, để mỗi dev một module KHÔNG sửa chung một tệp nhãn
//   đích: src/assets/i18n-platform/<lang>.json  (PlatformTranslateLoader fetch; gitignored)
//
// Chạy `npm run i18n:build` (TỰ chạy qua pre-hook prestart/prebuild/prewatch).
// Mỗi resource 1 folder i18n/ → dev ốp resource nào commit file đó, KHÔNG conflict chéo. File served = sinh, không commit.

import { readFileSync, writeFileSync, existsSync, readdirSync, statSync, mkdirSync } from '../../../../0.Core/src/Core/FE/tools/fe-overlay-fs.mjs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const PLATFORM_I18N = join(ROOT, 'src', 'app', 'platform', 'i18n');
const MODULES = join(ROOT, 'src', 'app', 'modules');
const FEATURES = join(ROOT, 'src', 'app', 'features');
const OUT = join(ROOT, 'src', 'assets', 'i18n-platform');
const LANGS = ['vi', 'en'];

/** Đọc một tệp JSON; không có tệp ⇒ `{}`. Tham số: `p` đường dẫn. Trả về: đối tượng. Tác dụng phụ: đọc đĩa; JSON hỏng thì ném lỗi. */
const readJSON = (p) => (existsSync(p) ? JSON.parse(readFileSync(p, 'utf8')) : {});

// Tìm ĐỆ QUY mọi folder tên 'i18n' dưới `dir` → trả các file <lang>.json.
function findI18nFiles(dir, lang, acc = []) {
  if (!existsSync(dir)) return acc;
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (!statSync(p).isDirectory()) continue;
    if (name === 'i18n') {
      const f = join(p, `${lang}.json`);
      if (existsSync(f)) acc.push(f);
    } else {
      findI18nFiles(p, lang, acc);
    }
  }
  return acc;
}

mkdirSync(OUT, { recursive: true });
const collisions = [];
for (const lang of LANGS) {
  const merged = { ...readJSON(join(PLATFORM_I18N, `${lang}.json`)) };  // global ui-shared
  let modKeys = 0, files = 0;
  for (const f of [...findI18nFiles(MODULES, lang), ...findI18nFiles(FEATURES, lang)]) {
    files++;
    const data = readJSON(f);
    for (const k of Object.keys(data)) {
      if (merged[k] !== undefined) collisions.push(`${lang}: namespace "${k}" trùng (${f.replace(ROOT, '')}) — 2 nơi khai cùng key`);
      merged[k] = data[k];
      modKeys++;
    }
  }
  writeFileSync(join(OUT, `${lang}.json`), JSON.stringify(merged, null, 2) + '\n', 'utf8');
  console.log(`✔ ${lang}: ${Object.keys(merged).length} key → assets/i18n-platform/${lang}.json (global + ${modKeys} key từ ${files} resource: modules + features)`);
}
if (collisions.length) {
  // Key trùng = đè im lặng = MẤT dịch âm thầm → LỖI CỨNG (đổi tên namespace cho không trùng).
  console.error(`\n✗ ${collisions.length} KEY TRÙNG cross-resource (1 đè 1 → mất dịch):`);
  for (const c of collisions) console.error('   ' + c);
  process.exit(1);
}
console.log('Xong. (Tự chạy qua pre-hook; chạy tay khi cần: npm run i18n:build.)');
