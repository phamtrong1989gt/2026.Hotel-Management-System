// Test cách `scripts/lib/workspace.mjs` và `scripts/lib/Workspace.ps1` NHẬN DIỆN LÕI và xử lý `PTCORE_PROJECT_ROOT` (sau khi tách kho 2026-11-18).
// Thứ tự lõi (CÙNG với `PTCore.Tests.WorkspaceLayout` và `platform.mjs` của repo phần mềm): platform.local.props → PLATFORM_ROOT → workspace.json `platform.path`. KHÔNG có ứng viên mặc định cứng:
// không nơi nào cho ra lõi hợp lệ ⇒ ĐỎ nêu từng nơi đã thử + cách sửa.
// Lý do có: `platform.local.props` phải được tôn trọng; `workspace.json` có chú thích (hoặc BOM) mà bị `JSON.parse` thô lờ lặng lẽ thì sẽ rơi về lõi khác; và `PTCORE_PROJECT_ROOT` trỏ dự án
// khác bị nuốt (ép lại) ⇒ công cụ chạy trên dự án khác với dự án người dùng nghĩ mà vẫn xanh. Cách thử: DỰ ÁN GIẢ trong thư mục tạm (chép workspace.mjs + Workspace.ps1 vào `<tạm>/proj/scripts/lib`, lõi = lõi THẬT, không phần mềm nào),
// nạp thư viện bằng tiến trình con — không đụng dự án thật.
// Chạy: node --test scripts/lib/workspace-platform-root.test.mjs   (cần bố cục TÁCH thật để biết lõi ở đâu; ngược lại bị bỏ qua).
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { PLATFORM_ROOT, isSplit } from './workspace.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const CAN_RUN = isSplit && !!PLATFORM_ROOT;
const CAN_PS = CAN_RUN && process.platform === 'win32';

/** So hai đường dẫn không phân biệt hoa thường / kiểu dấu phân cách / dấu phân cách cuối (Windows). */
const key = (p) => path.resolve(String(p).trim()).replace(/[\\/]+$/, '').toLowerCase();

/**
 * Hàm làm gì: dựng dự án giả — `<tạm>/proj` có hai thư viện chép từ dự án thật, `workspace.json` với nội dung `workspaceJson` (chuỗi THÔ, có thể kèm chú thích / BOM) và tuỳ chọn `platform.local.props`.
 * Thêm `<tạm>/decoy` là một «lõi giả» (có src/Core/Framework) để thử thứ tự ưu tiên. Trả về: `{ tmp, proj, decoy }`. Tác dụng phụ: tạo thư mục / tệp trong thư mục tạm — nơi gọi phải xoá `tmp`.
 */
function fake(workspaceJson, localProps) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ws-root-'));
  const proj = path.join(tmp, 'proj');
  const decoy = path.join(tmp, 'decoy');
  fs.mkdirSync(path.join(proj, 'scripts', 'lib'), { recursive: true });
  fs.mkdirSync(path.join(decoy, 'src', 'Core', 'Framework'), { recursive: true });
  for (const f of ['workspace.mjs', 'Workspace.ps1']) fs.copyFileSync(path.join(HERE, f), path.join(proj, 'scripts', 'lib', f));
  fs.writeFileSync(path.join(proj, 'workspace.json'), workspaceJson);
  if (localProps) fs.writeFileSync(path.join(proj, 'platform.local.props'), localProps);
  return { tmp, proj, decoy };
}

/** Hàm làm gì: chạy `spawnSync` với môi trường sạch (xoá biến PLATFORM_ROOT / PTCORE_* của máy) cộng `extraEnv` (undefined = xoá). */
function run(cmd, args, extraEnv) {
  const env = { ...process.env, PLATFORM_ROOT: undefined, PTCORE_PROJECT_ROOT: undefined, PTCORE_ALLOW_MISSING_APPS: undefined, ...extraEnv };
  for (const k of Object.keys(env)) if (env[k] === undefined) delete env[k];
  const r = spawnSync(cmd, args, { encoding: 'utf8', env });
  return { status: r.status, stdout: (r.stdout ?? '').trim(), stderr: (r.stderr ?? '').trim() };
}

/** Hàm làm gì: nạp workspace.mjs của dự án giả và in `LOADED <PLATFORM_ROOT>`. */
function loadJs(proj, extraEnv = {}) {
  const url = pathToFileURL(path.join(proj, 'scripts', 'lib', 'workspace.mjs')).href;
  return run(process.execPath, ['--input-type=module', '-e', `import('${url}').then((m) => console.log('LOADED ' + m.PLATFORM_ROOT))`], extraEnv);
}

/** Hàm làm gì: nạp Workspace.ps1 của dự án giả, gọi Get-WsContext và in `LOADED <PlatformRoot>`. */
function loadPs(proj, extraEnv = {}) {
  const lib = path.join(proj, 'scripts', 'lib', 'Workspace.ps1');
  const script = path.join(proj, 'ctx.ps1');
  fs.writeFileSync(script, `$ErrorActionPreference = 'Stop'\n. '${lib.replaceAll("'", "''")}'\n$c = Get-WsContext\nWrite-Output ('LOADED ' + $c.PlatformRoot)\n`);
  return run('powershell', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', script], extraEnv);
}

/** Hàm làm gì: `LOADED <đường dẫn>` có đúng lõi mong đợi không. */
const loadedIs = (r, expected) => r.status === 0 && r.stdout.startsWith('LOADED ') && key(r.stdout.slice(7)) === key(expected);

const jsonc = (platformPath) => `// workspace.json có CHÚ THÍCH (người viết tay)\n{\n  "project": "X", /* khối */\n  "platform": { "path": ${JSON.stringify(platformPath)}, },\n  "repos": {},\n  "apps": []\n}\n`;

test('workspace.json CÓ CHÚ THÍCH + dấu phẩy thừa vẫn được đọc: platform.path (khác mặc định) được dùng — JS và PowerShell', { skip: !CAN_RUN }, () => {
  const { tmp, proj } = fake(jsonc(PLATFORM_ROOT));
  try {
    assert.ok(loadedIs(loadJs(proj), PLATFORM_ROOT), 'JS: ' + JSON.stringify(loadJs(proj)));
    if (CAN_PS) assert.ok(loadedIs(loadPs(proj), PLATFORM_ROOT), 'PS: ' + JSON.stringify(loadPs(proj)));
  } finally { fs.rmSync(tmp, { recursive: true, force: true }); }
});

test('workspace.json có BOM (PowerShell 5.1 `Set-Content -Encoding UTF8` ghi BOM) vẫn được đọc, không rơi lặng lẽ về lõi mặc định', { skip: !CAN_RUN }, () => {
  const { tmp, proj } = fake('﻿' + jsonc(PLATFORM_ROOT));
  try {
    assert.ok(loadedIs(loadJs(proj), PLATFORM_ROOT), JSON.stringify(loadJs(proj)));
  } finally { fs.rmSync(tmp, { recursive: true, force: true }); }
});

test('platform.local.props THẮNG workspace.json (cùng thứ tự với Directory.Build.props và bản C#): JS và PowerShell', { skip: !CAN_RUN }, () => {
  // workspace.json trỏ lõi GIẢ (decoy); platform.local.props trỏ lõi THẬT ⇒ phải ra lõi thật.
  const { tmp, proj, decoy } = fake(jsonc('PLACEHOLDER'), `<Project><PropertyGroup><PlatformRoot>${PLATFORM_ROOT}</PlatformRoot></PropertyGroup></Project>`);
  try {
    fs.writeFileSync(path.join(proj, 'workspace.json'), jsonc(decoy));
    assert.ok(loadedIs(loadJs(proj), PLATFORM_ROOT), 'JS: ' + JSON.stringify(loadJs(proj)));
    if (CAN_PS) assert.ok(loadedIs(loadPs(proj), PLATFORM_ROOT), 'PS: ' + JSON.stringify(loadPs(proj)));
  } finally { fs.rmSync(tmp, { recursive: true, force: true }); }
});

test('PLATFORM_ROOT thắng workspace.json (và thua platform.local.props)', { skip: !CAN_RUN }, () => {
  const { tmp, proj, decoy } = fake(jsonc('PLACEHOLDER'));
  try {
    fs.writeFileSync(path.join(proj, 'workspace.json'), jsonc(decoy));
    assert.ok(loadedIs(loadJs(proj, { PLATFORM_ROOT }), PLATFORM_ROOT), 'biến PLATFORM_ROOT phải thắng workspace.json');
    fs.writeFileSync(path.join(proj, 'platform.local.props'), `<Project><PropertyGroup><PlatformRoot>${PLATFORM_ROOT}</PlatformRoot></PropertyGroup></Project>`);
    assert.ok(loadedIs(loadJs(proj, { PLATFORM_ROOT: decoy }), PLATFORM_ROOT), 'platform.local.props phải thắng biến PLATFORM_ROOT');
  } finally { fs.rmSync(tmp, { recursive: true, force: true }); }
});

test('PTCORE_PROJECT_ROOT trỏ dự án KHÁC ⇒ ĐỎ nêu biến + hai đường dẫn (không nuốt lặng lẽ); trỏ đúng dự án này ⇒ qua — JS và PowerShell', { skip: !CAN_RUN }, () => {
  const { tmp, proj, decoy } = fake(jsonc(PLATFORM_ROOT));
  try {
    const bad = loadJs(proj, { PTCORE_PROJECT_ROOT: decoy });
    assert.notEqual(bad.status, 0, 'phải đỏ: ' + bad.stdout);
    assert.match(bad.stderr, /PTCORE_PROJECT_ROOT/);
    assert.ok(loadedIs(loadJs(proj, { PTCORE_PROJECT_ROOT: proj }), PLATFORM_ROOT), 'trỏ đúng dự án này thì qua');
    if (CAN_PS) {
      const badPs = loadPs(proj, { PTCORE_PROJECT_ROOT: decoy });
      assert.notEqual(badPs.status, 0, 'PS phải đỏ: ' + badPs.stdout);
      assert.match(badPs.stderr, /PTCORE_PROJECT_ROOT/);
      assert.ok(loadedIs(loadPs(proj, { PTCORE_PROJECT_ROOT: proj }), PLATFORM_ROOT), 'PS: trỏ đúng thì qua');
    }
  } finally { fs.rmSync(tmp, { recursive: true, force: true }); }
});

test('Dự án THẬT: đặt PTCORE_PROJECT_ROOT = chính dự án thì vẫn nạp được (ca thuận: công cụ lõi đặt biến này khi gọi script dự án)', { skip: !CAN_RUN }, () => {
  const realProj = path.resolve(HERE, '..', '..');
  const r = loadJs(realProj, { PTCORE_PROJECT_ROOT: realProj });
  assert.ok(loadedIs(r, PLATFORM_ROOT), JSON.stringify(r));
});

/** Hàm làm gì: dựng `<tạm>/<sub>/proj` (không workspace.json hợp lệ ở lõi) + một «lõi mồi» ở chỗ mà bản cũ từng coi là mặc định cứng (`<tạm>/<tên lõi cũ>`, cách dự án hai cấp). Trả về `{ tmp, proj }`. Tác dụng phụ: ghi thư mục tạm. */
function fakeWithOldDefaultDecoy(workspaceJson) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ws-nodefault-'));
  const proj = path.join(tmp, 'a', 'proj');
  fs.mkdirSync(path.join(proj, 'scripts', 'lib'), { recursive: true });
  for (const f of ['workspace.mjs', 'Workspace.ps1']) fs.copyFileSync(path.join(HERE, f), path.join(proj, 'scripts', 'lib', f));
  fs.mkdirSync(path.join(tmp, '0.tn-t03-core-platform', 'src', 'Core', 'Framework'), { recursive: true });   // tên thư mục lõi từng là ứng viên mặc định cứng — nay KHÔNG được thử
  fs.writeFileSync(path.join(proj, 'workspace.json'), workspaceJson);
  return { tmp, proj };
}

test('KHÔNG có ứng viên mặc định cứng: workspace.json không khai platform.path, không local.props, không PLATFORM_ROOT ⇒ ĐỎ dù có thư mục lõi đặt đúng chỗ mặc định CŨ — JS và PowerShell', { skip: !CAN_RUN }, () => {
  const { tmp, proj } = fakeWithOldDefaultDecoy('{ "project": "X", "repos": {}, "apps": [] }');
  try {
    const js = loadJs(proj);
    assert.notEqual(js.status, 0, 'phải đỏ: ' + js.stdout);
    assert.doesNotMatch(js.stdout, /LOADED/);
    if (CAN_PS) {
      const ps = loadPs(proj);
      assert.notEqual(ps.status, 0, 'PS phải đỏ: ' + ps.stdout);
      assert.doesNotMatch(ps.stdout, /LOADED/);
    }
  } finally { fs.rmSync(tmp, { recursive: true, force: true }); }
});

test('Không ứng viên nào hợp lệ ⇒ lỗi nêu RÕ từng nơi đã thử (local.props · PLATFORM_ROOT · platform.path) và cách sửa — JS và PowerShell', { skip: !CAN_RUN }, () => {
  const { tmp, proj, decoy } = fake(jsonc(path.join(os.tmpdir(), 'khong-co-loi-nay')));
  try {
    const bad = loadJs(proj, { PLATFORM_ROOT: path.join(decoy, 'khong-phai-loi') });
    assert.notEqual(bad.status, 0);
    for (const re of [/platform\.local\.props/, /PLATFORM_ROOT/, /platform\.path/, /src\/Core\/Framework/, /khong-co-loi-nay/, /khong-phai-loi/, /Cách sửa/]) assert.match(bad.stderr, re, 'thiếu «' + re + '» trong: ' + bad.stderr);
    if (CAN_PS) {
      const badPs = loadPs(proj, { PLATFORM_ROOT: path.join(decoy, 'khong-phai-loi') });
      assert.notEqual(badPs.status, 0);
      for (const re of [/platform\.local\.props/, /PLATFORM_ROOT/, /platform\.path/, /Core\\Framework/, /khong-co-loi-nay/, /khong-phai-loi/, /Cach sua/]) assert.match(badPs.stderr, re, 'PS thiếu «' + re + '» trong: ' + badPs.stderr);
    }
  } finally { fs.rmSync(tmp, { recursive: true, force: true }); }
});
