// check-apps — GATE hồ sơ ứng dụng `src/Apps/*/app.yaml` (D-CORE-77, P1; đề xuất mục 3 "Gate mới check-apps").
//
// Kiểm (ERROR làm gate đỏ; WARN không làm đỏ):
//   A1 ERROR  mỗi thư mục `src/Apps/<Mã>/` có `app.yaml` ĐỌC ĐƯỢC và hợp lệ (cú pháp YAML chặt; trường bắt buộc; khoá lạ; `code` KHỚP tên thư mục; `paths.*` đúng khuôn và nằm dưới `src/Apps/<Mã>/` — xem validateAppData ở scripts/lib/apps.mjs); không có phần mềm nào cũng là A1
//   A2 ERROR  `code` duy nhất (không phân biệt hoa thường); `sso_code` / `sso_app_id` (khi có) không trùng giữa các phần mềm
//   A3 ERROR  mọi `paths.*` đã khai TỒN TẠI trên đĩa (riêng `session` null = chưa có ⇒ bỏ qua)
//   A4 ERROR  `host_project` có tệp dự án: `<paths.api>/<host_project>.csproj`; dự án test: `<paths.tests>/<tên thư mục tests>.csproj`
//   A5 ERROR  cổng khai trong `ports` KHÔNG trùng nhau (giữa các phần mềm VÀ giữa các nhóm cùng một phần mềm)
//   A6 ERROR  thư mục dưới `src/Apps` không có `app.yaml` mà CÓ nội dung (tệp hoặc thư mục con);  WARN nếu RỖNG (vd thư mục giữ chỗ cho phần mềm sắp thêm)
//   A7 WARN   trường được phép để trống mà đang trống (sso_code, sso_app_id, display_name, config_key, ports, paths.session). (P2 2026-11-01: `paths.contracts` PHẢI nằm dưới `src/Apps/<Mã>/` — `_contracts` ở gốc kho là A1 ERROR, không còn là cảnh báo chuyển tiếp)
// Không có `src/Apps` ⇒ mã thoát 2 (đỏ rõ ràng), KHÔNG báo "0 phần mềm, đạt". Kho có `src/Apps` nhưng KHÔNG có phần mềm nào ⇒ ERROR (một kho nghiệp vụ phải có ít nhất một phần mềm).
//
// Dùng:  node scripts/check-apps.mjs [--root <gốc kho>] [--json]       node scripts/check-apps.mjs --selftest
// Mã thoát: 0 đạt (WARN không làm đỏ) · 1 có ERROR · 2 sai đối số / không có src/Apps.

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { AppsError, APP_FILE, REQUIRED_PATH_KEYS, OPTIONAL_PATH_KEYS, ZONE_APPS, appPaths, findRepoRoot, scanApps } from './lib/apps.mjs';

/**
 * Hàm làm gì: kiểm `p` là thư mục tồn tại (không ném lỗi).
 * @param {string} p Đường dẫn tuyệt đối.
 * @returns {boolean} true nếu là thư mục.
 */
const isDir = (p) => { try { return fs.statSync(p).isDirectory(); } catch { return false; } };
/**
 * Hàm làm gì: kiểm `p` là tệp tồn tại (không ném lỗi).
 * @param {string} p Đường dẫn tuyệt đối.
 * @returns {boolean} true nếu là tệp.
 */
const isFile = (p) => { try { return fs.statSync(p).isFile(); } catch { return false; } };

/**
 * Hàm làm gì: phân tích kết quả quét thành danh sách phát hiện (A1–A7). Hàm THUẦN trên dữ liệu quét + đĩa của `repoRoot`; không ghi gì.
 * @param {{apps: object[], errors: {dirName:string, message:string, problems:string[]}[], strays: {dirName:string, relDir:string, empty:boolean}[]}} scan Kết quả {@link scanApps}.
 * @param {string} repoRoot Gốc kho (để kiểm tồn tại các đường dẫn).
 * @returns {{level:'ERROR'|'WARN', rule:string, where:string, message:string}[]} Phát hiện theo thứ tự quy tắc; rỗng = sạch hoàn toàn.
 */
export function analyze(scan, repoRoot) {
  const out = [];
  /** Hàm làm gì: ghi một phát hiện (mức, mã quy tắc, vị trí, nội dung) vào mảng `out`. */
  const add = (level, rule, where, message) => out.push({ level, rule, where, message });

  for (const e of scan.errors) for (const p of (e.problems.length ? e.problems : [e.message])) add('ERROR', 'A1', `${ZONE_APPS}/${e.dirName}/${APP_FILE}`, p.replace(/^[^:]*app\.yaml:?\d*:\s*/, ''));
  if (scan.apps.length === 0 && scan.errors.length === 0) add('ERROR', 'A1', ZONE_APPS, 'không có phần mềm nào (không thư mục con nào có app.yaml)');

  const seen = { code: new Map(), sso_code: new Map(), sso_app_id: new Map() };
  /** Hàm làm gì: kiểm khoá `key` của loại `kind` (code | sso_code | sso_app_id) chưa dùng bởi phần mềm khác; trùng ⇒ ghi lỗi A2, chưa ⇒ nhớ chủ sở hữu. Bỏ qua khi `key` rỗng. */
  const dup = (kind, key, app, label) => {
    if (key === null || key === undefined) return;
    const k = typeof key === 'string' ? key.toLowerCase() : key;
    if (seen[kind].has(k)) add('ERROR', 'A2', app.relDir, `${label} "${key}" trùng với ${seen[kind].get(k)}`);
    else seen[kind].set(k, app.relDir);
  };
  const portOwner = new Map();

  for (const app of scan.apps) {
    const where = `${app.relDir}/${APP_FILE}`;
    dup('code', app.code, app, 'code');
    dup('sso_code', app.ssoCode, app, 'sso_code');
    dup('sso_app_id', app.ssoAppId, app, 'sso_app_id');

    const ap = appPaths(app);
    for (const k of [...REQUIRED_PATH_KEYS, ...OPTIONAL_PATH_KEYS]) {
      if (app.paths[k] === null) continue;
      if (!isDir(ap[k])) add('ERROR', 'A3', where, `paths.${k} = "${app.paths[k]}" không tồn tại trên đĩa`);
    }
    if (isDir(ap.api) && !isFile(path.join(ap.api, `${app.hostProject}.csproj`))) add('ERROR', 'A4', where, `host_project "${app.hostProject}": không có ${app.paths.api}/${app.hostProject}.csproj`);
    if (isDir(ap.tests)) {
      const tp = path.basename(ap.tests);
      if (!isFile(path.join(ap.tests, `${tp}.csproj`))) add('ERROR', 'A4', where, `paths.tests: không có ${app.paths.tests}/${tp}.csproj`);
    }

    if (app.ports) for (const [g, grp] of Object.entries(app.ports)) for (const [n, v] of Object.entries(grp)) {
      const label = `${app.code}.ports.${g}.${n}`;
      if (portOwner.has(v)) add('ERROR', 'A5', where, `cổng ${v} (${label}) trùng với ${portOwner.get(v)}`);
      else portOwner.set(v, label);
    }

    for (const [field, val] of [['sso_code', app.ssoCode], ['sso_app_id', app.ssoAppId], ['display_name', app.displayName], ['config_key', app.configKey], ['ports', app.ports]]) {
      if (val === null) add('WARN', 'A7', where, `${field} đang để trống (chưa khai)`);
    }
    if (app.paths.session === null) add('WARN', 'A7', where, 'paths.session đang để trống (sổ phiên ứng dụng — tạo ở P3)');
  }

  for (const s of scan.strays) {
    if (s.empty) add('WARN', 'A6', s.relDir, 'thư mục rỗng, không có app.yaml (giữ chỗ?) — bỏ qua; xoá hoặc thêm app.yaml khi dùng thật');
    else add('ERROR', 'A6', s.relDir, `thư mục có nội dung nhưng KHÔNG có ${APP_FILE} — thêm hồ sơ ứng dụng hoặc dời nội dung đi`);
  }
  return out;
}

/**
 * Hàm làm gì: chạy gate trên một kho — quét `src/Apps` rồi phân tích.
 * @param {string} repoRoot Gốc kho.
 * @returns {{code:number, findings:object[], apps:number}} `code`: 0 đạt · 1 có ERROR · 2 không có `src/Apps` (không quét được). `findings` xem {@link analyze}.
 */
export function checkRepo(repoRoot) {
  let scan;
  try { scan = scanApps(repoRoot); }
  catch (e) { if (e instanceof AppsError) return { code: 2, findings: [{ level: 'ERROR', rule: 'A1', where: ZONE_APPS, message: e.message }], apps: 0 }; throw e; }
  const findings = analyze(scan, repoRoot);
  return { code: findings.some((f) => f.level === 'ERROR') ? 1 : 0, findings, apps: scan.apps.length };
}

/**
 * Hàm làm gì: tự kiểm gate bằng kho GIẢ trong thư mục tạm, dựng từ mẫu `app.yaml` viết sẵn trong mã (KHÔNG đọc hồ sơ phần mềm thật nào, không phụ thuộc đĩa của dự án):
 * ca thuận + các ca PHÁ (đổi tên host, trùng mã, bỏ trường, thiếu thư mục, cổng trùng, thư mục lạ có tệp…) — mỗi ca phá PHẢI đỏ đúng quy tắc (A1…A7).
 * Kho giả dùng bố cục kho gộp (`src/Apps/<Mã>/…`) dưới thư mục tạm — gốc lạ nên {@link scanApps} nối thẳng, không dịch theo workspace.json của dự án.
 * Tác dụng phụ: tạo và xoá thư mục tạm; in từng ca ra stdout.
 * @returns {number} Số ca sai (0 = đạt).
 */
export function selftest() {
  let bad = 0;
  /** Hàm làm gì: ghi kết quả MỘT ca (in OK / BAD kèm ghi chú khi sai). Tác dụng phụ: tăng `bad` khi sai, in ra stdout. */
  const ok = (name, cond, extra = '') => { if (!cond) bad++; console.log(`${cond ? 'OK  ' : 'BAD '}${name}${cond || !extra ? '' : '  ← ' + extra}`); };
  // Thư mục tạm tạo NGOÀI mọi lệnh có thể ném lỗi trước `try` — `finally` luôn dọn.
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'check-apps-'));
  let n = 0;
  /**
   * Hàm làm gì: dựng văn bản `app.yaml` hợp lệ cho phần mềm giả `code` (đường dẫn dưới `src/Apps/<code>`, nhóm cổng `dev` + `agent` theo quy tắc khối).
   * Tham số: `code` mã phần mềm; `o.ssoId` / `o.ssoCode` đổi định danh SSO; `o.http` cổng http của nhóm dev (https = +1, FE = −800, agent = +10).
   * Trả về: chuỗi YAML. Tác dụng phụ: không.
   */
  const yamlOf = (code, { ssoId = 6, ssoCode = code.toLowerCase(), http = 5400 } = {}) => [
    `code: ${code}`, `sso_code: ${ssoCode}`, `sso_app_id: ${ssoId}`, `display_name: PM ${code}`, 'module_prefix: App.Modules.', `host_project: App.Api.${code}`, 'config_key: Main',
    'paths:', `  be: src/Apps/${code}/BE`, `  fe: src/Apps/${code}/FE`, `  api: src/Apps/${code}/BE/App.Api.${code}`, `  modules: src/Apps/${code}/BE/Modules`,
    `  tests: src/Apps/${code}/BE/Tests/App.Tests.${code}`, `  contracts: src/Apps/${code}/_contracts`, '  session: null',
    'ports:', '  dev:', `    be_http: ${http}`, `    be_https: ${http + 1}`, `    fe: ${http - 800}`, '  agent:', `    be_http: ${http + 10}`, `    be_https: ${http + 11}`, `    fe: ${http - 790}`, '',
  ].join('\n');
  /**
   * Hàm làm gì: dựng phần mềm giả `code` dưới `root`: thư mục `BE/App.Api.<code>` + `BE/Modules` + `BE/Tests/App.Tests.<code>` + `FE` + `_contracts`, hai csproj rỗng và `app.yaml`.
   * Tham số: `yamlText` thay hồ sơ mặc định (để dựng ca hỏng). Tác dụng phụ: ghi đĩa trong thư mục tạm.
   */
  const mkApp = (root, code, yamlText = yamlOf(code)) => {
    const base = path.join(root, 'src/Apps', code);
    for (const d of [`BE/App.Api.${code}`, 'BE/Modules', `BE/Tests/App.Tests.${code}`, 'FE', '_contracts']) fs.mkdirSync(path.join(base, d), { recursive: true });
    fs.writeFileSync(path.join(base, `BE/App.Api.${code}/App.Api.${code}.csproj`), '<Project/>');
    fs.writeFileSync(path.join(base, `BE/Tests/App.Tests.${code}/App.Tests.${code}.csproj`), '<Project/>');
    fs.writeFileSync(path.join(base, APP_FILE), yamlText);
  };
  /** Hàm làm gì: dựng kho giả MỘT phần mềm `ZED` (hồ sơ đã qua `mut`), rồi chạy `extra(root)` để phá thêm. Trả về gốc kho giả. Tác dụng phụ: ghi đĩa trong thư mục tạm. */
  const mkRepo = (mut = (t) => t, extra = () => {}) => {
    const root = path.join(tmp, `r${++n}`);
    mkApp(root, 'ZED', mut(yamlOf('ZED')));
    extra(root);
    return root;
  };
  /** Hàm làm gì: tạo hàm biến đổi văn bản thay MỌI `a` bằng `b` (split/join, không diễn giải `$`); ném lỗi nếu `a` không có trong hồ sơ mẫu (tránh ca phá vô tác dụng). */
  const sub = (a, b) => (t) => { if (!t.includes(a)) throw new Error(`mẫu thay không có trong app.yaml mẫu: ${a}`); return t.split(a).join(b); };
  /** Hàm làm gì: ca PHÁ — chạy gate trên `root`, PHẢI có ERROR đúng quy tắc `rule` (nội dung chứa `text` nếu có) và thoát `code`. Tác dụng phụ: gọi `ok`. */
  const expectRed = (name, root, rule, text, code = 1) => {
    const r = checkRepo(root);
    const hit = r.findings.find((f) => f.level === 'ERROR' && f.rule === rule && (!text || (f.where + ' ' + f.message).includes(text)));
    ok(name, r.code === code && !!hit, `exit ${r.code}; ${r.findings.filter((f) => f.level === 'ERROR').map((f) => f.rule + ':' + f.message).join(' | ') || 'không có ERROR'}`);
  };
  try {
    const base = checkRepo(mkRepo());
    ok('thuan: hồ sơ mẫu dựng sẵn trên kho giả ⇒ exit 0, 0 ERROR', base.code === 0 && base.apps === 1 && !base.findings.some((f) => f.level === 'ERROR'), JSON.stringify(base.findings));
    ok('thuan: WARN A7 nhắc session trống (không làm đỏ); không cảnh báo nào về paths.contracts', base.findings.some((f) => f.level === 'WARN' && f.rule === 'A7' && f.message.includes('paths.session')) && !base.findings.some((f) => f.message.includes('paths.contracts')));
    const stray = checkRepo(mkRepo((t) => t, (r) => fs.mkdirSync(path.join(r, 'src/Apps/GIUCHO'))));
    ok('thuan: thư mục dưới src/Apps RỖNG không app.yaml ⇒ chỉ WARN A6, exit 0', stray.code === 0 && stray.findings.some((f) => f.level === 'WARN' && f.rule === 'A6'), JSON.stringify(stray.findings.filter((f) => f.rule === 'A6')));

    expectRed('phá: đổi tên host (host_project không còn csproj) ⇒ A4', mkRepo(sub('host_project: App.Api.ZED', 'host_project: App.Api.Zzz')), 'A4', 'App.Api.Zzz');
    expectRed('phá: bỏ trường bắt buộc module_prefix ⇒ A1', mkRepo((t) => t.split('\n').filter((l) => !l.startsWith('module_prefix:')).join('\n')), 'A1', 'module_prefix');
    expectRed('phá: code khác tên thư mục ⇒ A1', mkRepo(sub('code: ZED', 'code: KHAC')), 'A1', 'không khớp tên thư mục');
    expectRed('phá: thư mục paths.fe bị xoá ⇒ A3', mkRepo((t) => t, (r) => fs.rmSync(path.join(r, 'src/Apps/ZED/FE'), { recursive: true })), 'A3', 'paths.fe');
    expectRed('phá: thiếu csproj dự án test ⇒ A4', mkRepo((t) => t, (r) => fs.rmSync(path.join(r, 'src/Apps/ZED/BE/Tests/App.Tests.ZED/App.Tests.ZED.csproj'))), 'A4', 'App.Tests.ZED.csproj');
    expectRed('phá: thư mục lạ CÓ tệp, không app.yaml ⇒ A6', mkRepo((t) => t, (r) => { fs.mkdirSync(path.join(r, 'src/Apps/LAL'), { recursive: true }); fs.writeFileSync(path.join(r, 'src/Apps/LAL/x.txt'), 'x'); }), 'A6', 'src/Apps/LAL');
    expectRed('phá: paths.contracts quay về `_contracts` ở gốc kho (cách cũ) ⇒ A1', mkRepo(sub('  contracts: src/Apps/ZED/_contracts', '  contracts: _contracts')), 'A1', 'paths.contracts');
    expectRed('phá: thư mục paths.contracts bị xoá ⇒ A3', mkRepo((t) => t, (r) => fs.rmSync(path.join(r, 'src/Apps/ZED/_contracts'), { recursive: true })), 'A3', 'paths.contracts');
    expectRed('phá: YAML có Tab ⇒ A1', mkRepo(sub('paths:\n  be:', 'paths:\n\tbe:')), 'A1', 'Tab');
    expectRed('phá: khoá YAML trùng ⇒ A1', mkRepo((t) => t + '\ncode: ZED\n'), 'A1', 'khoá trùng');
    expectRed('phá: cổng ngoài khoảng ⇒ A1', mkRepo(sub('be_http: 5400', 'be_http: 70000')), 'A1', '1–65535');
    expectRed('phá: paths.be chứa ".." ⇒ A1', mkRepo(sub('  be: src/Apps/ZED/BE\n', '  be: ../x\n')), 'A1', 'paths.be');
    expectRed('phá: cổng trùng GIỮA HAI NHÓM của cùng phần mềm (agent = dev) ⇒ A5', mkRepo(sub('be_http: 5410', 'be_http: 5400')), 'A5', '5400');
    // hai phần mềm: trùng sso_app_id / sso_code / cổng
    /** Hàm làm gì: dựng kho giả có HAI phần mềm — `ZED` (hồ sơ mẫu) và `YAK` (hồ sơ `yakYaml`). Trả về gốc kho giả. */
    const twoApps = (yakYaml) => mkRepo((t) => t, (r) => mkApp(r, 'YAK', yakYaml));
    const okTwo = checkRepo(twoApps(yamlOf('YAK', { ssoId: 7, http: 5500 })));
    ok('thuan: hai phần mềm khác id / mã / cổng ⇒ exit 0', okTwo.code === 0 && okTwo.apps === 2, JSON.stringify(okTwo.findings.filter((f) => f.level === 'ERROR')));
    expectRed('phá: trùng sso_app_id giữa hai phần mềm ⇒ A2', twoApps(yamlOf('YAK', { ssoId: 6, http: 5500 })), 'A2', 'sso_app_id');
    expectRed('phá: trùng sso_code giữa hai phần mềm ⇒ A2', twoApps(yamlOf('YAK', { ssoId: 7, ssoCode: 'zed', http: 5500 })), 'A2', 'sso_code');
    expectRed('phá: trùng cổng 5400 giữa hai phần mềm ⇒ A5', twoApps(yamlOf('YAK', { ssoId: 7, http: 5400 })), 'A5', '5400');
    // trùng code (không phân biệt hoa thường): dữ liệu quét tổng hợp vì hệ tệp Windows không cho hai thư mục chỉ khác hoa thường
    {
      const root = mkRepo();
      const scan = scanApps(root);
      const clone = { ...scan.apps[0], dirName: 'zed2', relDir: 'src/Apps/zed2', code: 'zed' };
      const f = analyze({ apps: [scan.apps[0], clone], errors: [], strays: [] }, root).find((x) => x.rule === 'A2' && x.message.includes('code'));
      ok('phá: trùng code (không phân biệt hoa thường) ⇒ A2', !!f, 'không thấy A2 code');
    }
    ok('phá: kho KHÔNG có src/Apps ⇒ exit 2 (không báo đạt)', (() => { const root = path.join(tmp, 'no-apps'); fs.mkdirSync(path.join(root, 'src/Core'), { recursive: true }); const r = checkRepo(root); return r.code === 2; })());
    ok('phá: src/Apps rỗng (0 phần mềm) ⇒ ERROR A1, không đạt', (() => { const root = path.join(tmp, 'zero'); fs.mkdirSync(path.join(root, 'src/Apps'), { recursive: true }); const r = checkRepo(root); return r.code === 1 && r.apps === 0; })());
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
    console.log(`(đã dọn thư mục tạm: ${fs.existsSync(tmp) ? 'CHƯA' : 'rồi'})`);
  }
  console.log(bad ? `${bad} ca SAI` : 'check-apps selftest: mọi ca phá đều đỏ đúng chỗ, ca thuận xanh');
  return bad;
}

/**
 * Hàm làm gì: điểm vào dòng lệnh của gate.
 * @param {string[]} argv Đối số sau tên tệp: `--root <dir>`, `--json`, `--selftest`.
 * @returns {number} Mã thoát: 0 đạt · 1 có ERROR / selftest sai · 2 sai đối số hoặc không có `src/Apps`.
 */
function main(argv) {
  const here = path.dirname(fileURLToPath(import.meta.url));
  const ri = argv.indexOf('--root');
  const repoRoot = path.resolve(ri >= 0 ? (argv[ri + 1] ?? '') : (findRepoRoot(here) ?? path.join(here, '..')));
  if (ri >= 0 && !argv[ri + 1]) { console.error('--root cần một đường dẫn'); return 2; }
  if (argv.includes('--selftest')) return selftest() ? 1 : 0;
  const r = checkRepo(repoRoot);
  if (argv.includes('--json')) { console.log(JSON.stringify(r, null, 2)); return r.code; }
  console.log(`check-apps: ${r.apps} phần mềm dưới ${ZONE_APPS} (gốc kho ${repoRoot})`);
  for (const f of r.findings) console.log(`${f.level === 'ERROR' ? 'ERROR' : 'WARN '} ${f.rule} ${f.where} — ${f.message}`);
  const errs = r.findings.filter((f) => f.level === 'ERROR').length, warns = r.findings.length - errs;
  console.log(r.code === 0 ? `PASS check-apps (${r.apps} phần mềm · ${warns} cảnh báo)` : `FAIL check-apps (${errs} lỗi · ${warns} cảnh báo)`);
  return r.code;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) process.exit(main(process.argv.slice(2)));
