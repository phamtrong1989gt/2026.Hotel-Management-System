#!/usr/bin/env node
// fe-node-modules — cài phụ thuộc FE MỘT LẦN ở lõi và dùng chung cho mọi FE của dự án (bố cục tách kho 2026-11-18).
//
// Vì sao: mã FE dùng chung (lõi: src/Core/FE) nằm NGOÀI cây của từng app và lấy `@angular/*` từ `node_modules` đứng trên nó (lõi: src/node_modules). Nếu mỗi app tự `npm install`,
//   mã app lấy bản Angular của app còn mã lõi lấy bản của lõi ⇒ có nguy cơ HAI bản Angular (kiểm kiểu lỗi «private property», hoặc hỏng DI lúc chạy). Cài một lần ở lõi rồi cho từng FE
//   của phần mềm một liên kết `FE/node_modules` → `<lõi>/src/node_modules` thì chỉ còn MỘT bản. Điều kiện: phụ thuộc của mọi FE phải GIỐNG HỆT nhau (cùng gói, cùng phiên bản) — công cụ này canh điều đó.
//
// Dùng (ở thư mục dự án):
//   node scripts/fe-node-modules.mjs            = --check: CHỈ ĐỌC. Mã thoát 1 khi phụ thuộc các FE lệch nhau; in trạng thái node_modules từng FE (liên kết đúng · thiếu · cài riêng = CẢNH BÁO).
//   node scripts/fe-node-modules.mjs --link     tạo liên kết cho FE nào CHƯA có node_modules (không bao giờ đè thư mục thật; cần đã `npm install` ở <lõi>/src). Windows: junction (không cần quyền quản trị).
//   node scripts/fe-node-modules.mjs --selftest tự kiểm trên cây giả trong thư mục tạm.
// KHÔNG chạy npm, KHÔNG xoá gì.

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { pathToFileURL } from 'node:url';
import { PLATFORM_ROOT, WS, apps, isSplit } from './lib/workspace.mjs';

/**
 * Hàm làm gì: đọc phụ thuộc (dependencies + devDependencies) của một package.json.
 * @param {string} file Đường dẫn package.json.
 * @returns {Record<string,string>} Bảng gói → phiên bản; rỗng nếu không có khai báo. Ném lỗi nếu tệp không đọc được / không phải JSON.
 */
export function readDeps(file) {
  const j = JSON.parse(fs.readFileSync(file, 'utf8'));
  return { ...(j.dependencies ?? {}), ...(j.devDependencies ?? {}) };
}

/**
 * Hàm làm gì: so phụ thuộc của nhiều FE với nhau — mọi FE phải khai CÙNG tập gói với CÙNG phiên bản (điều kiện để dùng chung một bản cài).
 * @param {{name:string, deps:Record<string,string>}[]} fes Danh sách FE kèm bảng phụ thuộc.
 * @returns {string[]} Danh sách lệch (mỗi phần tử một dòng, tiếng Việt); rỗng nếu giống hệt. Lấy FE đầu tiên làm chuẩn so sánh.
 */
export function compareDeps(fes) {
  const problems = [];
  if (fes.length < 2) return problems;
  const [base, ...rest] = fes;
  for (const fe of rest) {
    for (const k of Object.keys(base.deps)) {
      if (!(k in fe.deps)) problems.push(`${fe.name}: thiếu gói «${k}» (${base.name} có ${base.deps[k]})`);
      else if (fe.deps[k] !== base.deps[k]) problems.push(`${fe.name}: «${k}» ${fe.deps[k]} ≠ ${base.deps[k]} (${base.name})`);
    }
    for (const k of Object.keys(fe.deps)) if (!(k in base.deps)) problems.push(`${fe.name}: thừa gói «${k}» ${fe.deps[k]} (${base.name} không có)`);
  }
  return problems;
}

/**
 * Hàm làm gì: cho biết trạng thái `node_modules` của một FE so với bản cài chung.
 * @param {string} feRoot Thư mục FE.
 * @param {string} shared Thư mục node_modules dùng chung (của lõi).
 * @returns {'linked'|'missing'|'own-install'|'wrong-link'} linked = liên kết đúng tới bản chung · missing = chưa có · own-install = thư mục THẬT (cài riêng ⇒ nguy cơ hai bản Angular) · wrong-link = liên kết trỏ chỗ khác.
 */
export function stateOf(feRoot, shared) {
  const nm = path.join(feRoot, 'node_modules');
  let st;
  try { st = fs.lstatSync(nm); } catch { return 'missing'; }
  if (!st.isSymbolicLink()) return 'own-install';   // junction của Windows cũng được Node báo là symbolic link
  try { return fs.realpathSync(nm) === fs.realpathSync(shared) ? 'linked' : 'wrong-link'; } catch { return 'wrong-link'; }
}

/**
 * Hàm làm gì: tạo liên kết `<feRoot>/node_modules` → `shared` cho FE CHƯA có node_modules. Không bao giờ đè / xoá thư mục hoặc liên kết đã có.
 * @param {string} feRoot Thư mục FE.
 * @param {string} shared Thư mục node_modules dùng chung (phải tồn tại — đã `npm install`).
 * @returns {'linked'|'exists'|'no-shared'} linked = vừa tạo · exists = đã có gì đó ở đó (giữ nguyên) · no-shared = bản cài chung chưa có.
 * @throws {Error} lỗi hệ thống khi tạo liên kết.
 */
export function linkOne(feRoot, shared) {
  if (!fs.existsSync(shared)) return 'no-shared';
  const nm = path.join(feRoot, 'node_modules');
  if (fs.existsSync(nm) || isLink(nm)) return 'exists';
  fs.symlinkSync(shared, nm, 'junction');   // 'junction' chỉ có nghĩa trên Windows; nơi khác Node tự dùng liên kết thư mục thường
  return 'linked';
}

/**
 * Hàm làm gì: kiểm `p` có phải liên kết (kể cả liên kết gãy) mà không ném lỗi.
 * @param {string} p Đường dẫn.
 * @returns {boolean} true nếu là liên kết.
 */
function isLink(p) {
  try { return fs.lstatSync(p).isSymbolicLink(); } catch { return false; }
}

/**
 * Hàm làm gì: gom các FE của dự án — FE của từng phần mềm (theo workspace.json) và FE của dịch vụ cùng lõi (SSO) — kèm đường dẫn package.json.
 * @returns {{name:string, root:string, pkg:string, ownedByCore:boolean}[]} Danh sách FE (có package.json); `ownedByCore` = nằm trong cây lõi (đã thuộc workspace npm của lõi, không cần liên kết).
 */
function collectFes() {
  const out = [];
  for (const a of apps()) {
    const root = path.join(a.repoRoot, a.fe ?? 'FE');
    if (fs.existsSync(path.join(root, 'package.json'))) out.push({ name: `Apps/${a.code}`, root, pkg: path.join(root, 'package.json'), ownedByCore: false });
  }
  const svc = path.join(PLATFORM_ROOT, 'src', 'Services');
  if (fs.existsSync(svc)) {
    for (const d of fs.readdirSync(svc)) {
      const root = path.join(svc, d, 'FE');
      if (fs.existsSync(path.join(root, 'package.json'))) out.push({ name: `Services/${d}`, root, pkg: path.join(root, 'package.json'), ownedByCore: true });
    }
  }
  return out;
}

/**
 * Hàm làm gì: chạy công cụ ở chế độ --check hoặc --link trên dự án thật.
 * @param {string[]} argv Đối số dòng lệnh (không gồm node và tên tệp).
 * @returns {number} Mã thoát: 0 ok · 1 phụ thuộc lệch (hoặc --link thất bại) · 2 không ở bố cục tách.
 */
export function main(argv) {
  if (!isSplit) { console.error('fe-node-modules: không ở bố cục tách (thiếu workspace.json) — công cụ chỉ dành cho kho đã tách.'); return 2; }
  const shared = path.join(PLATFORM_ROOT, 'src', 'node_modules');
  const fes = collectFes();
  if (fes.length === 0) { console.error(`fe-node-modules: không thấy FE nào (workspace: ${WS?.projectRoot}) — dừng thay vì báo xanh.`); return 1; }
  const problems = compareDeps(fes.map((f) => ({ name: f.name, deps: readDeps(f.pkg) })));
  console.log(`Phụ thuộc của ${fes.length} FE (${fes.map((f) => f.name).join(', ')}): ${problems.length === 0 ? `GIỐNG HỆT (${Object.keys(readDeps(fes[0].pkg)).length} gói)` : `${problems.length} chỗ LỆCH`}`);
  for (const p of problems) console.log(`  ✗ ${p}`);
  console.log(`Bản cài chung: ${shared} — ${fs.existsSync(shared) ? 'có' : 'CHƯA có (chạy `npm install` ở <lõi>/src)'}`);
  let code = problems.length ? 1 : 0;
  for (const f of fes.filter((x) => !x.ownedByCore)) {
    let s = stateOf(f.root, shared);
    if (argv.includes('--link') && s === 'missing') {
      const r = linkOne(f.root, shared);
      console.log(`  ${f.name}: ${r === 'linked' ? 'ĐÃ tạo liên kết node_modules → bản cài chung' : r === 'no-shared' ? 'chưa tạo được — bản cài chung chưa có' : 'giữ nguyên'}`);
      if (r === 'no-shared') code = 1;
      s = stateOf(f.root, shared);
    }
    const label = { linked: '✓ liên kết tới bản cài chung — ĐỪNG chạy `npm install` trong FE này (sẽ XOÁ gói của bản chung); cài ở lõi', missing: '· chưa có node_modules (chạy --link sau khi cài ở lõi)', 'own-install': '⚠ CÀI RIÊNG — nguy cơ hai bản Angular (mã lõi dùng bản của lõi)', 'wrong-link': '⚠ liên kết trỏ chỗ khác' }[s];
    console.log(`  ${f.name}: ${label}`);
  }
  return code;
}

/**
 * Hàm làm gì: tự kiểm trên cây giả trong thư mục tạm (ca thuận + ca âm). Tác dụng phụ: tạo và xoá thư mục tạm; in từng ca.
 * @returns {number} Số ca sai (0 = đạt).
 */
export function selftest() {
  let bad = 0;
  const ok = (name, cond) => { if (!cond) bad++; console.log(`${cond ? 'OK  ' : 'BAD '}${name}`); };
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'fe-nm-'));
  try {
    const mk = (rel, deps) => { const d = path.join(tmp, rel); fs.mkdirSync(d, { recursive: true }); fs.writeFileSync(path.join(d, 'package.json'), JSON.stringify({ dependencies: deps })); return d; };
    const shared = path.join(tmp, 'core', 'node_modules'); fs.mkdirSync(shared, { recursive: true });
    const a = mk('a/FE', { x: '1.0.0', y: '2.0.0' }), b = mk('b/FE', { x: '1.0.0', y: '2.0.0' });
    ok('giống hệt ⇒ không lệch', compareDeps([{ name: 'a', deps: readDeps(path.join(a, 'package.json')) }, { name: 'b', deps: readDeps(path.join(b, 'package.json')) }]).length === 0);
    ok('khác phiên bản ⇒ lệch', compareDeps([{ name: 'a', deps: { x: '1' } }, { name: 'b', deps: { x: '2' } }]).length === 1);
    ok('thiếu gói ⇒ lệch', compareDeps([{ name: 'a', deps: { x: '1', y: '1' } }, { name: 'b', deps: { x: '1' } }]).some((p) => p.includes('thiếu')));
    ok('thừa gói ⇒ lệch', compareDeps([{ name: 'a', deps: { x: '1' } }, { name: 'b', deps: { x: '1', z: '1' } }]).some((p) => p.includes('thừa')));
    ok('chưa có node_modules ⇒ missing', stateOf(a, shared) === 'missing');
    ok('--link tạo liên kết', linkOne(a, shared) === 'linked' && stateOf(a, shared) === 'linked');
    ok('--link không đè khi đã có', linkOne(a, shared) === 'exists');
    fs.mkdirSync(path.join(b, 'node_modules'));
    ok('thư mục THẬT ⇒ own-install, --link KHÔNG đè', stateOf(b, shared) === 'own-install' && linkOne(b, shared) === 'exists' && fs.lstatSync(path.join(b, 'node_modules')).isDirectory());
    const c = mk('c/FE', { x: '1.0.0' }); const other = path.join(tmp, 'other'); fs.mkdirSync(other);
    fs.symlinkSync(other, path.join(c, 'node_modules'), 'junction');
    ok('liên kết trỏ chỗ khác ⇒ wrong-link', stateOf(c, shared) === 'wrong-link');
    const d = mk('d/FE', {});
    ok('bản cài chung chưa có ⇒ no-shared', linkOne(d, path.join(tmp, 'khong-co')) === 'no-shared');
  } finally { fs.rmSync(tmp, { recursive: true, force: true }); }
  console.log(bad ? `${bad} ca SAI` : 'fe-node-modules selftest: tất cả ca đúng kỳ vọng');
  return bad;
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  process.exit(process.argv.includes('--selftest') ? (selftest() ? 1 : 0) : main(process.argv.slice(2)));
}
