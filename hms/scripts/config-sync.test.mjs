// Test cho scripts/config-sync.mjs — dựng một "kho giả" trong thư mục tạm (manifest + bản mẫu + 2 phần mềm) rồi thử từng tình huống. KHÔNG đọc phần mềm / manifest thật của dự án.
// Chạy: node --test scripts/config-sync.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { evaluate, syncAll, normalize, leafMap, loadManifest, mergeManifest, OVERLAY_FILE, TEMPLATE_DIR } from './config-sync.mjs';

const CLOCK = '// Giờ hệ thống\n{\n  // Nhãn — Loại giờ\n  "Clock": { "Kind": "Local" }\n}\n';

/**
 * Dựng kho giả: 2 phần mềm A, B; shared Clock (bytes) + Srv (values); perApp Brand; removed appsettings.Api.json.
 * @param {(root:string)=>void} [tweak] chỉnh kho sau khi dựng (để tạo tình huống lỗi)
 * @returns {string} thư mục gốc kho giả
 */
function makeRepo(tweak) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'cfgsync-'));
  const put = (rel, text) => { const p = path.join(root, rel); fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, text); };
  const manifest = {
    apps: { A: 'apps/A', B: 'apps/B' },
    ignoreLocal: ['appsettings.Development.json'],
    removed: [{ name: 'appsettings.Api.json', why: 'x' }],
    shared: [
      { name: 'appsettings.Clock.json', mode: 'bytes', apps: ['A', 'B'] },
      { name: 'appsettings.Srv.json', mode: 'values', apps: ['A', 'B'] },
    ],
    perApp: { A: ['appsettings.Brand.json'], B: ['appsettings.Brand.json'] },
  };
  put(`${TEMPLATE_DIR}/manifest.json`, JSON.stringify(manifest));
  put(`${TEMPLATE_DIR}/appsettings.Clock.json`, CLOCK);
  for (const app of ['A', 'B']) {
    put(`apps/${app}/appsettings.Clock.json`, CLOCK);
    put(`apps/${app}/appsettings.Srv.json`, `// chú thích riêng của ${app}\n{ "Srv": { "Url": "", "N": 3 } }\n`);
    put(`apps/${app}/appsettings.Brand.json`, `{ "Brand": { "Name": "${app}" } }`);
  }
  tweak?.(root);
  return root;
}

const failsOf = (r) => r.rows.filter((x) => x.level === 'FAIL').map((x) => `${x.app}:${x.file}`);

test('kho nhất quán ⇒ không lỗi, không cảnh báo', () => {
  const r = evaluate(makeRepo());
  assert.equal(r.fail, 0);
  assert.equal(r.warn, 0);
});

test('chuẩn hoá: BOM và CRLF khác nhau KHÔNG bị tính là lệch', () => {
  const root = makeRepo((x) => fs.writeFileSync(path.join(x, 'apps/B/appsettings.Clock.json'), '﻿' + CLOCK.replace(/\n/g, '\r\n')));
  assert.equal(evaluate(root).fail, 0);
  assert.equal(normalize('﻿a\r\nb\r\n\r\n'), 'a\nb\n');
});

test('PHÁ: sửa một giá trị ở một phần mềm ⇒ ĐỎ đúng phần mềm đó', () => {
  const root = makeRepo((x) => fs.writeFileSync(path.join(x, 'apps/B/appsettings.Clock.json'), CLOCK.replace('Local', 'Utc')));
  assert.deepEqual(failsOf(evaluate(root)), ['B:appsettings.Clock.json']);
});

test('PHÁ: sửa mỗi chú thích (nhãn màn cấu hình) ở mode bytes cũng ĐỎ', () => {
  const root = makeRepo((x) => fs.writeFileSync(path.join(x, 'apps/A/appsettings.Clock.json'), CLOCK.replace('Loại giờ', 'Kiểu giờ')));
  assert.deepEqual(failsOf(evaluate(root)), ['A:appsettings.Clock.json']);
});

test('mode values: chú thích khác nhau thì được, giá trị khác nhau thì ĐỎ', () => {
  assert.equal(evaluate(makeRepo()).fail, 0, 'chú thích riêng của A và B khác nhau mà vẫn xanh');
  const root = makeRepo((x) => fs.writeFileSync(path.join(x, 'apps/B/appsettings.Srv.json'), '{ "Srv": { "Url": "", "N": 4 } }'));
  assert.deepEqual(failsOf(evaluate(root)), ['B:appsettings.Srv.json']);
});

test('PHÁ: thêm tệp mới chưa xếp loại ⇒ ĐỎ', () => {
  const root = makeRepo((x) => fs.writeFileSync(path.join(x, 'apps/A/appsettings.Moi.json'), '{}'));
  const r = evaluate(root);
  assert.deepEqual(failsOf(r), ['A:appsettings.Moi.json']);
  assert.match(r.rows.find((x) => x.level === 'FAIL').msg, /chưa xếp loại/);
});

test('PHÁ: tệp đã gỡ (removed) bị thêm lại ⇒ ĐỎ', () => {
  const root = makeRepo((x) => fs.writeFileSync(path.join(x, 'apps/B/appsettings.Api.json'), '{ "ApiSettings": {} }'));
  assert.deepEqual(failsOf(evaluate(root)), ['B:appsettings.Api.json']);
});

test('PHÁ: manifest khai tệp mà thư mục không có ⇒ ĐỎ', () => {
  const root = makeRepo((x) => fs.rmSync(path.join(x, 'apps/B/appsettings.Brand.json')));
  assert.deepEqual(failsOf(evaluate(root)), ['B:appsettings.Brand.json']);
});

test('tệp riêng của máy (Development…) không bị tính là chưa xếp loại', () => {
  const root = makeRepo((x) => fs.writeFileSync(path.join(x, 'apps/A/appsettings.Development.json'), '{}'));
  assert.equal(evaluate(root).fail, 0);
});

test('knownDrift: lệch đã biết ⇒ VÀNG (không đỏ); hết lệch mà còn khai ⇒ ĐỎ để dọn sổ', () => {
  const withKnown = (x) => {
    const p = path.join(x, TEMPLATE_DIR, 'manifest.json');
    const m = JSON.parse(fs.readFileSync(p, 'utf8'));
    m.shared[0].knownDrift = { B: 'chờ quyết' };
    fs.writeFileSync(p, JSON.stringify(m));
  };
  const drifting = makeRepo((x) => { withKnown(x); fs.writeFileSync(path.join(x, 'apps/B/appsettings.Clock.json'), CLOCK.replace('Local', 'Utc')); });
  const r1 = evaluate(drifting);
  assert.equal(r1.fail, 0);
  assert.equal(r1.warn, 1);
  const stale = makeRepo(withKnown);
  assert.deepEqual(failsOf(evaluate(stale)), ['B:appsettings.Clock.json']);
});

test('--sync: chép bản mẫu vào phần mềm lệch, bỏ qua knownDrift, rồi kiểm xanh; --dry không ghi', () => {
  const root = makeRepo((x) => fs.writeFileSync(path.join(x, 'apps/B/appsettings.Clock.json'), CLOCK.replace('Local', 'Utc')));
  assert.deepEqual(syncAll(root, { dry: true }), ['apps/B/appsettings.Clock.json']);
  assert.equal(evaluate(root).fail, 1, 'dry không được ghi');
  assert.deepEqual(syncAll(root), ['apps/B/appsettings.Clock.json']);
  assert.equal(evaluate(root).fail, 0);
  assert.deepEqual(syncAll(root), [], 'chạy lần hai không còn gì để ghi');

  const p = path.join(root, TEMPLATE_DIR, 'manifest.json');
  const m = JSON.parse(fs.readFileSync(p, 'utf8'));
  m.shared[0].knownDrift = { B: 'chờ quyết' };
  fs.writeFileSync(p, JSON.stringify(m));
  fs.writeFileSync(path.join(root, 'apps/B/appsettings.Clock.json'), CLOCK.replace('Local', 'Utc'));
  assert.deepEqual(syncAll(root), [], 'mục knownDrift không bị ghi đè');
});

test('leafMap: nội dung chuỗi có ", }" hoặc "//" KHÔNG bị coi là dấu phẩy thừa / chú thích', () => {
  const m = leafMap('{ "A": "x, }", "U": "http://h:1/", "B": [1, 2,], }');
  assert.equal(m.get('A'), '"x, }"');
  assert.equal(m.get('U'), '"http://h:1/"');
  assert.equal(m.get('B'), '[1,2]');
});

test('leafMap: bỏ chú thích, giữ giá trị lá và mảng', () => {
  const m = leafMap('// c\n{ /* x */ "A": { "B": [1, 2], "C": "t" }, }');
  assert.equal(m.get('A:B'), '[1,2]');
  assert.equal(m.get('A:C'), '"t"');
});

// ───────── LUẬT «PHẦN MỀM MỚI KHÔNG ĐƯỢC THIẾU CẤU HÌNH» (R1–R5) — cùng ca với ConfigParityTests.KhoGia_LuatPhanMemMoi_… ─────────

/**
 * Dựng kho giả ĐỦ khung cho R1–R5: phần mềm A (khung đầy đủ) + máy chủ S (miễn khung), lõi nạp 3 tệp, SecretsValidator nhắc 2 khoá.
 * @param {(root:string)=>void} [tweak] chỉnh kho sau khi dựng
 * @returns {string} thư mục gốc kho giả
 */
function makeFullRepo(tweak) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'cfgsync-new-'));
  const put = (rel, text) => { const p = path.join(root, rel); fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, text); };
  const clock = '{ "Clock": { "Kind": "Local" } }\n';
  put(`${TEMPLATE_DIR}/manifest.json`, JSON.stringify({
    apps: { A: 'src/Apps/A/BE/App.Api.A', S: 'svc/S' },
    ignoreLocal: ['appsettings.Development.json'],
    removed: [{ name: 'appsettings.json', why: 'x' }],
    shared: [{ name: 'appsettings.Clock.json', mode: 'bytes', apps: ['A', 'S'] }],
    perApp: { A: ['appsettings.Brand.json'], S: [] },
    discover: { appsDir: 'src/Apps', hostDir: 'BE/App.Api.{code}' },
    coreLoader: { file: 'core/CoreProgram.cs', coreOnly: [] },
    scaffold: {
      appliesTo: ['A'], exempt: { S: 'máy chủ SSO' }, hostFiles: ['web.config'], programMustContain: ['HostDeployment'],
      registrations: [{ file: 'scripts/dev-stack.ps1', needle: '{code}', what: 'dev-stack' }],
    },
    envKeys: { source: 'core/Secrets.cs', example: '.env.example', ignore: { Sec__Hidden: 'chỉ-triển-khai' } },
  }));
  put(`${TEMPLATE_DIR}/appsettings.Clock.json`, clock);
  put('core/CoreProgram.cs', 'config.AddJsonFile("appsettings.json", true, true);\nconfig.AddJsonFile("appsettings.Clock.json", true, true);\nconfig.AddJsonFile("appsettings.Brand.json", true, true);\n');
  put('core/Secrets.cs', '("A:B", "Sec__Token", "x"), ("C", "Sec__Hidden", "y")');
  put('.env.example', '# mẫu\nSec__Token=\n');
  put('scripts/dev-stack.ps1', '# khoá a có mặt\n');
  put('src/Apps/A/BE/App.Api.A/Program.cs', 'public static readonly HostDeployment Deployment = new(DeploymentMode.Linked);');
  put('src/Apps/A/BE/App.Api.A/web.config', '<configuration/>');
  put('src/Apps/A/BE/App.Api.A/appsettings.Clock.json', clock);
  put('src/Apps/A/BE/App.Api.A/appsettings.Brand.json', '{}');
  put('svc/S/appsettings.Clock.json', clock);
  tweak?.(root);
  return root;
}
const editFile = (root, rel, change) => { const p = path.join(root, rel); fs.writeFileSync(p, change(fs.readFileSync(p, 'utf8'))); };
const editManifest = (root, change) => editFile(root, `${TEMPLATE_DIR}/manifest.json`, (s) => JSON.stringify(change(JSON.parse(s))));

test('R1–R5: kho giả đủ khung ⇒ xanh', () => {
  const r = evaluate(makeFullRepo());
  assert.deepEqual(failsOf(r), []);
  assert.equal(r.warn, 0);
});

test('R1 PHÁ: thư mục phần mềm MỚI có host API mà chưa khai ở manifest.apps ⇒ ĐỎ', () => {
  const root = makeFullRepo((x) => { fs.mkdirSync(path.join(x, 'src/Apps/Moi/BE/App.Api.Moi'), { recursive: true }); fs.writeFileSync(path.join(x, 'src/Apps/Moi/BE/App.Api.Moi/Program.cs'), 'x'); });
  assert.deepEqual(failsOf(evaluate(root)), ['Moi:manifest.apps']);
  const noHost = makeFullRepo((x) => fs.mkdirSync(path.join(x, 'src/Apps/ChuaCoHost'), { recursive: true }));
  assert.deepEqual(failsOf(evaluate(noHost)), [], 'thư mục chưa có host API thì chưa tính là phần mềm');
});

test('R2 PHÁ: bản mẫu mồ côi (có ở ConfigTemplates, không khai ở shared) ⇒ ĐỎ', () => {
  const root = makeFullRepo((x) => fs.writeFileSync(path.join(x, TEMPLATE_DIR, 'appsettings.Mau.json'), '{}'));
  assert.deepEqual(failsOf(evaluate(root)), ['-:appsettings.Mau.json']);
});

test('R3 PHÁ: LÕI nạp thêm tệp cấu hình mà luật chưa biết ⇒ ĐỎ; khai coreOnly thì xanh', () => {
  const addCore = (x) => editFile(x, 'core/CoreProgram.cs', (s) => s + 'config.AddJsonFile("appsettings.Moi.json", true, true);\n');
  assert.deepEqual(failsOf(evaluate(makeFullRepo(addCore))), ['core:appsettings.Moi.json']);
  const ok = makeFullRepo((x) => { addCore(x); editManifest(x, (m) => { m.coreLoader.coreOnly = ['appsettings.Moi.json']; return m; }); });
  assert.deepEqual(failsOf(evaluate(ok)), []);
});

test('R3 PHÁ: lõi thôi nạp tệp mà manifest còn xếp loại (cấu hình chết) ⇒ ĐỎ', () => {
  const root = makeFullRepo((x) => editFile(x, 'core/CoreProgram.cs', (s) => s.replace('config.AddJsonFile("appsettings.Brand.json", true, true);\n', '')));
  assert.deepEqual(failsOf(evaluate(root)), ['core:appsettings.Brand.json']);
});

test('R4 PHÁ: thiếu tệp host · thiếu khai HostDeployment · chưa đăng ký ở công cụ dùng chung ⇒ ĐỎ đúng chỗ', () => {
  assert.deepEqual(failsOf(evaluate(makeFullRepo((x) => fs.rmSync(path.join(x, 'src/Apps/A/BE/App.Api.A/web.config'))))), ['A:web.config']);
  assert.deepEqual(failsOf(evaluate(makeFullRepo((x) => editFile(x, 'src/Apps/A/BE/App.Api.A/Program.cs', (s) => s.replace('HostDeployment', 'Khac'))))), ['A:Program.cs']);
  assert.deepEqual(failsOf(evaluate(makeFullRepo((x) => fs.writeFileSync(path.join(x, 'scripts/dev-stack.ps1'), '# xyz\n')))), ['A:scripts/dev-stack.ps1']);
});

test('R4: knownGap ⇒ VÀNG (không đỏ); đã đủ mà còn khai ⇒ ĐỎ để dọn sổ; phần mềm ở apps mà chưa xếp khung ⇒ ĐỎ', () => {
  const gap = (m) => { m.scaffold.registrations[0].knownGap = { A: 'chờ làm' }; return m; };
  const gapped = makeFullRepo((x) => { fs.writeFileSync(path.join(x, 'scripts/dev-stack.ps1'), '# xyz\n'); editManifest(x, gap); });
  const r = evaluate(gapped);
  assert.equal(r.fail, 0);
  assert.equal(r.warn, 1);
  assert.match(r.rows.find((y) => y.level === 'WARN').msg, /^lệch đã biết/);
  assert.deepEqual(failsOf(evaluate(makeFullRepo((x) => editManifest(x, gap)))), ['A:scripts/dev-stack.ps1']);
  assert.deepEqual(failsOf(evaluate(makeFullRepo((x) => editManifest(x, (m) => { m.scaffold.appliesTo = []; return m; })))), ['A:manifest.scaffold']);
});

test('R5 PHÁ: lõi nhắc khoá env mới mà .env.example chưa có ⇒ ĐỎ; ignore dọn sổ hai chiều', () => {
  assert.deepEqual(failsOf(evaluate(makeFullRepo((x) => editFile(x, 'core/Secrets.cs', (s) => s + ', ("D", "Sec__Moi", "z")')))), ['core:Sec__Moi']);
  assert.deepEqual(failsOf(evaluate(makeFullRepo((x) => editFile(x, '.env.example', (s) => s + '# Sec__Hidden=\n')))), ['core:Sec__Hidden']);
  assert.deepEqual(failsOf(evaluate(makeFullRepo((x) => editFile(x, 'core/Secrets.cs', (s) => s.replace('Sec__Hidden', 'Sec__Khac'))))).sort(), ['core:Sec__Hidden', 'core:Sec__Khac']);
});

// ───────── --sync SINH khung host còn thiếu (scaffold.generate) ─────────

test('--sync SINH khung host còn thiếu: tạo libman · web.config · Branding từ mẫu, thay {{App}} / {{AppName}}, KHÔNG ghi đè tệp đã có', () => {
  const root = makeFullRepo((x) => {
    editManifest(x, (m) => {
      m.scaffold.generate = [
        { file: 'libman.json', template: 'host/libman.json.template' },
        { file: 'web.config', template: 'host/web.config.template' },
        { file: 'appsettings.Brand2.json', template: 'host/brand.template' },
      ];
      return m;
    });
    fs.mkdirSync(path.join(x, TEMPLATE_DIR, 'host'), { recursive: true });
    fs.writeFileSync(path.join(x, TEMPLATE_DIR, 'host/libman.json.template'), '{ "libraries": [] }');
    fs.writeFileSync(path.join(x, TEMPLATE_DIR, 'host/web.config.template'), '<!-- App.Api.{{App}} -->');
    fs.writeFileSync(path.join(x, TEMPLATE_DIR, 'host/brand.template'), '{ "AppName": "{{AppName}}", "ShortName": "{{ShortName}}" }');
    fs.writeFileSync(path.join(x, 'src/Apps/A/app.yaml'), 'code: A\ndisplay_name: Phần mềm "Một"   # chú thích\n');
    fs.rmSync(path.join(x, 'src/Apps/A/BE/App.Api.A/web.config'));
    fs.writeFileSync(path.join(x, 'src/Apps/A/BE/App.Api.A/libman.json'), 'GIỮ NGUYÊN');
  });
  assert.deepEqual(failsOf(evaluate(root)), ['A:web.config'], 'trước khi sinh: thiếu web.config');
  assert.deepEqual(syncAll(root, { dry: true }), ['src/Apps/A/BE/App.Api.A/web.config', 'src/Apps/A/BE/App.Api.A/appsettings.Brand2.json'], 'dry chỉ liệt kê');
  assert.equal(fs.existsSync(path.join(root, 'src/Apps/A/BE/App.Api.A/web.config')), false);
  const done = syncAll(root);
  assert.equal(done.length, 2);
  const dir = path.join(root, 'src/Apps/A/BE/App.Api.A');
  assert.equal(fs.readFileSync(path.join(dir, 'web.config'), 'utf8'), '<!-- App.Api.A -->');
  assert.equal(fs.readFileSync(path.join(dir, 'libman.json'), 'utf8'), 'GIỮ NGUYÊN', 'tệp đã có không bị ghi đè');
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(dir, 'appsettings.Brand2.json'), 'utf8')), { AppName: 'Phần mềm "Một"', ShortName: 'A' }, 'AppName lấy từ app.yaml, dấu " được thoát');
  assert.deepEqual(syncAll(root), [], 'chạy lần hai không còn gì để sinh');
  assert.deepEqual(failsOf(evaluate(root)), ['A:appsettings.Brand2.json'], 'sau khi sinh hết đỏ web.config; tệp appsettings sinh ra vẫn phải được xếp loại ở manifest (cổng không nới)');
});

// ───────── R6 (bộ khoá .env.example theo mẫu chuẩn) — coder 2026-11-17 ─────────

const ENV_TPL = '# mẫu chuẩn\n# Khoá một.\nZed__One=\n\n# Mật khẩu ứng dụng (bí mật — để trống).\nZed__AppPassword=\n\nASPNETCORE_ENVIRONMENT=Production\n\n# Tên {{App}}.\nZed__Name={{App}}_Dev\n';
const A_EXAMPLE = '# ví dụ A\nZed__One=\nZed__AppPassword=\nASPNETCORE_ENVIRONMENT=Development\nZed__Name=A_Dev\n';
const A_EXAMPLE_PATH = 'src/Apps/A/BE/App.Api.A/.env.example';

/**
 * Dựng kho giả ĐỦ khung R1–R5 (makeFullRepo) cộng R6: mẫu chuẩn ConfigTemplates/env/app.env.example (4 khoá) + .env.example của phần mềm A đủ khoá.
 * @param {(root:string)=>void} [tweak] chỉnh kho sau khi dựng
 * @returns {string} thư mục gốc kho giả
 */
function makeEnvRepo(tweak) {
  return makeFullRepo((root) => {
    editManifest(root, (m) => { m.envExample = { template: 'env/app.env.example', file: '.env.example', appOnly: {}, knownGap: {} }; return m; });
    fs.mkdirSync(path.join(root, TEMPLATE_DIR, 'env'), { recursive: true });
    fs.writeFileSync(path.join(root, TEMPLATE_DIR, 'env/app.env.example'), ENV_TPL);
    fs.writeFileSync(path.join(root, A_EXAMPLE_PATH), A_EXAMPLE);
    tweak?.(root);
  });
}
const exampleFails = (r) => failsOf(r).filter((x) => x.endsWith('.env.example') || x.endsWith('app.env.example'));

test('R6: kho giả đủ khoá (kể cả khoá dạng chú thích) ⇒ xanh', () => {
  assert.deepEqual(failsOf(evaluate(makeEnvRepo())), []);
  const commented = makeEnvRepo((x) => editFile(x, A_EXAMPLE_PATH, (s) => s.replace('Zed__One=', '# Zed__One=')));
  assert.deepEqual(failsOf(evaluate(commented)), [], 'khoá nằm trong dòng chú thích «# KHOÁ=» vẫn tính là có');
});

test('R6 PHÁ: phần mềm thiếu khoá của mẫu chuẩn ⇒ ĐỎ nêu đúng khoá; thiếu hẳn tệp ⇒ ĐỎ', () => {
  const r = evaluate(makeEnvRepo((x) => editFile(x, A_EXAMPLE_PATH, (s) => s.replace('Zed__One=\n', ''))));
  assert.deepEqual(exampleFails(r), ['A:' + A_EXAMPLE_PATH]);
  assert.match(r.rows.find((y) => y.level === 'FAIL').msg, /thiếu khoá Zed__One/);
  assert.deepEqual(exampleFails(evaluate(makeEnvRepo((x) => fs.rmSync(path.join(x, A_EXAMPLE_PATH))))), ['A:' + A_EXAMPLE_PATH]);
});

test('R6 PHÁ: khoá phần mềm TỰ THÊM mà mẫu chưa có ⇒ ĐỎ; khai appOnly thì xanh; appOnly khai mà không có khoá nào ⇒ ĐỎ', () => {
  const extra = (x) => editFile(x, A_EXAMPLE_PATH, (s) => s + 'Zed__ChiCoO_A=1\n');
  const r = evaluate(makeEnvRepo(extra));
  assert.deepEqual(exampleFails(r), ['A:' + A_EXAMPLE_PATH]);
  assert.match(r.rows.find((y) => y.level === 'FAIL').msg, /Zed__ChiCoO_A.*mẫu chuẩn chưa có/);
  const only = makeEnvRepo((x) => { extra(x); editManifest(x, (m) => { m.envExample.appOnly['Zed__ChiCoO'] = ['A']; return m; }); });
  assert.deepEqual(failsOf(evaluate(only)), []);
  assert.deepEqual(exampleFails(evaluate(makeEnvRepo((x) => editManifest(x, (m) => { m.envExample.appOnly['Zed__KhongCo'] = ['A']; return m; })))), ['A:' + A_EXAMPLE_PATH]);
});

test('R6: knownGap ⇒ VÀNG (không đỏ); đã có khoá mà còn khai ⇒ ĐỎ để dọn sổ', () => {
  const gap = (m) => { m.envExample.knownGap = { A: { Zed__One: 'chờ làm' } }; return m; };
  const gapped = evaluate(makeEnvRepo((x) => { editFile(x, A_EXAMPLE_PATH, (s) => s.replace('Zed__One=\n', '')); editManifest(x, gap); }));
  assert.equal(gapped.fail, 0);
  assert.equal(gapped.warn, 1);
  assert.deepEqual(exampleFails(evaluate(makeEnvRepo((x) => editManifest(x, gap)))), ['A:' + A_EXAMPLE_PATH]);
});

test('--sync (R6): BỔ SUNG khoá thiếu kèm chú thích vào cuối tệp, KHÔNG sửa dòng đã có; --dry không ghi; knownGap bỏ qua; chạy lại không đổi', () => {
  const root = makeEnvRepo((x) => editFile(x, A_EXAMPLE_PATH, (s) => s.replace('Zed__One=\n', '').replace('ASPNETCORE_ENVIRONMENT=Development', 'ASPNETCORE_ENVIRONMENT=Development # giữ')));
  const before = fs.readFileSync(path.join(root, A_EXAMPLE_PATH), 'utf8');
  assert.deepEqual(syncAll(root, { dry: true }).filter((f) => f.endsWith('.env.example')), [A_EXAMPLE_PATH]);
  assert.equal(fs.readFileSync(path.join(root, A_EXAMPLE_PATH), 'utf8'), before, '--dry không ghi');
  assert.deepEqual(syncAll(root).filter((f) => f.endsWith('.env.example')), [A_EXAMPLE_PATH]);
  const after = fs.readFileSync(path.join(root, A_EXAMPLE_PATH), 'utf8');
  assert.ok(after.startsWith(before.replace(/\s+$/, '')), 'dòng đã có giữ nguyên, khoá mới chỉ NỐI vào cuối');
  assert.match(after, /# Khoá một\.\nZed__One=\n/, 'khoá bổ sung mang theo chú thích của mẫu');
  assert.deepEqual(failsOf(evaluate(root)), []);
  assert.deepEqual(syncAll(root).filter((f) => f.endsWith('.env.example')), [], 'chạy lại không đổi gì');
  const skip = makeEnvRepo((x) => { editFile(x, A_EXAMPLE_PATH, (s) => s.replace('Zed__One=\n', '')); editManifest(x, (m) => { m.envExample.knownGap = { A: { Zed__One: 'chờ' } }; return m; }); });
  assert.deepEqual(syncAll(skip).filter((f) => f.endsWith('.env.example')), [], 'khoá ở knownGap không bị bổ sung');
});

test('--sync (R6): phần mềm CHƯA có .env.example ⇒ SINH từ mẫu chuẩn, thay {{App}}; không ghi đè tệp đã có', () => {
  const root = makeEnvRepo((x) => fs.rmSync(path.join(x, A_EXAMPLE_PATH)));
  assert.deepEqual(syncAll(root).filter((f) => f.endsWith('.env.example')), [A_EXAMPLE_PATH]);
  const made = fs.readFileSync(path.join(root, A_EXAMPLE_PATH), 'utf8');
  assert.match(made, /Zed__Name=A_Dev/);
  assert.ok(!made.includes('{{App}}'));
  assert.deepEqual(failsOf(evaluate(root)), []);
});

// ───────── Gộp manifest LÕI + manifest BỔ SUNG của dự án (tách kho 2026-11-18) ─────────

/** Manifest lõi giả: chỉ biết SSO. */
const CORE_MANIFEST = {
  apps: { SSO: 'svc/SSO' },
  ignoreLocal: [],
  removed: [],
  shared: [{ name: 'appsettings.Clock.json', mode: 'bytes', apps: ['SSO'] }, { name: 'appsettings.Media.json', mode: 'bytes', apps: [] }],
  perApp: { SSO: ['appsettings.Sso.json'] },
  scaffold: { appliesTo: [], exempt: { SSO: 'máy chủ SSO' }, hostFiles: ['web.config'], registrations: [] },
  envExample: { template: 'env/app.env.example', file: '.env.example', appOnly: {}, knownGap: {} },
};
/** Manifest bổ sung giả của dự án: thêm phần mềm A, B. */
const OVERLAY = {
  apps: { A: 'src/Apps/A/BE/App.Api.A', B: 'src/Apps/B/BE/App.Api.B' },
  shared: { 'appsettings.Clock.json': { apps: ['A', 'B'] }, 'appsettings.Media.json': { apps: ['A'], knownDrift: { A: 'chờ quyết' } } },
  perApp: { A: ['appsettings.Branding.json'], B: [] },
  scaffold: { appliesTo: ['A', 'B'], registrations: [{ file: 'scripts/dev-stack.ps1', needle: '{code}', what: 'dev-stack' }] },
  envExample: { appOnly: { Zed__: ['A'] }, knownGap: { B: { Zed__One: 'chờ' } } },
};

test('GỘP: apps · shared.apps (phần mềm dự án đứng TRƯỚC) · perApp · scaffold · envExample hợp đúng, lõi không bị sửa', () => {
  const frozen = JSON.stringify(CORE_MANIFEST);
  const m = mergeManifest(CORE_MANIFEST, OVERLAY);
  assert.equal(JSON.stringify(CORE_MANIFEST), frozen, 'bản của lõi bị sửa tại chỗ');
  assert.deepEqual(Object.keys(m.apps), ['A', 'B', 'SSO'], 'thứ tự: phần mềm của dự án trước, dịch vụ của lõi sau');
  assert.deepEqual(m.shared.find((s) => s.name === 'appsettings.Clock.json').apps, ['A', 'B', 'SSO']);
  assert.deepEqual(m.shared.find((s) => s.name === 'appsettings.Media.json').apps, ['A']);
  assert.deepEqual(m.shared.find((s) => s.name === 'appsettings.Media.json').knownDrift, { A: 'chờ quyết' });
  assert.deepEqual(Object.keys(m.perApp), ['A', 'B', 'SSO']);
  assert.deepEqual(m.scaffold.appliesTo, ['A', 'B']);
  assert.deepEqual(m.scaffold.exempt, { SSO: 'máy chủ SSO' });
  assert.equal(m.scaffold.registrations.length, 1);
  assert.deepEqual(m.envExample.appOnly, { Zed__: ['A'] });
  assert.deepEqual(m.envExample.knownGap, { B: { Zed__One: 'chờ' } });
});

test('GỘP: không có bản bổ sung ⇒ trả bản sao của lõi (kho giả của ca phá dùng MỘT manifest đầy đủ như cũ)', () => {
  const m = mergeManifest(CORE_MANIFEST, null);
  assert.deepEqual(m, CORE_MANIFEST);
  assert.notEqual(m, CORE_MANIFEST, 'phải là bản sao');
});

test('GỘP PHÁ: khoá lạ ở bản bổ sung · phần mềm trùng với lõi · shared khai tệp lõi không có ⇒ NÉM LỖI (không bỏ qua lặng lẽ)', () => {
  assert.throws(() => mergeManifest(CORE_MANIFEST, { ...OVERLAY, aps: {} }), /khoá lạ: aps/);
  assert.throws(() => mergeManifest(CORE_MANIFEST, { apps: { SSO: 'x' } }), /apps «SSO» mà manifest lõi đã có/);
  assert.throws(() => mergeManifest(CORE_MANIFEST, { perApp: { SSO: [] } }), /perApp «SSO» mà manifest lõi đã có/);
  assert.throws(() => mergeManifest(CORE_MANIFEST, { shared: { 'appsettings.Khong.json': { apps: ['A'] } } }), /không có mục shared/);
});

test('GỘP: loadManifest ở gốc LẠ đọc bản bổ sung services-config/config-manifest.json nếu có; thiếu thì chỉ manifest lõi', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'cfgsync-merge-'));
  fs.mkdirSync(path.join(root, TEMPLATE_DIR), { recursive: true });
  fs.writeFileSync(path.join(root, TEMPLATE_DIR, 'manifest.json'), JSON.stringify(CORE_MANIFEST));
  assert.deepEqual(Object.keys(loadManifest(root).apps), ['SSO'], 'chưa có bản bổ sung ⇒ chỉ SSO');
  fs.mkdirSync(path.join(root, path.dirname(OVERLAY_FILE)), { recursive: true });
  fs.writeFileSync(path.join(root, OVERLAY_FILE), JSON.stringify(OVERLAY));
  assert.deepEqual(Object.keys(loadManifest(root).apps), ['A', 'B', 'SSO']);
});

