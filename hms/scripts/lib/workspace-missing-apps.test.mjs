// Test quy tắc «phần mềm khai trong workspace.json mà repo CHƯA clone ⇒ ĐỎ (không xanh giả)» của hai bản dịch đường dẫn cấp dự án: scripts/lib/workspace.mjs và scripts/lib/Workspace.ps1
// (bản JS của lõi `assertAppsComplete` và bản C# `WorkspaceLayout.AssertAppsComplete` được test riêng ở lõi). Không có quy tắc này thì máy clone dở thấy mọi cổng quét XANH trong khi
// đã bỏ sót phần mềm. Cho qua bằng PTCORE_ALLOW_MISSING_APPS=1 (dev chủ ý chỉ làm một phần mềm).
// Cách thử: dựng DỰ ÁN GIẢ trong thư mục tạm (chép workspace.mjs + Workspace.ps1 vào `<tạm>/proj/scripts/lib`, workspace.json khai một phần mềm trỏ repo KHÔNG tồn tại, lõi = lõi THẬT)
// rồi nạp thư viện bằng tiến trình con — không đụng dự án thật, không ghi gì ngoài thư mục tạm.
// Chạy: node --test scripts/lib/workspace-missing-apps.test.mjs   (cần bố cục TÁCH thật để biết lõi ở đâu; ngược lại bị bỏ qua).
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

/**
 * Hàm làm gì: dựng dự án giả — `<tạm>/proj` có workspace.json (lõi thật, một phần mềm GHOST trỏ repo không tồn tại, tuỳ chọn thêm một phần mềm CÓ repo) và hai thư viện chép từ dự án thật.
 * Tham số: `withRealApp` — true thì khai thêm phần mềm REAL có thư mục thật (ca «có repo thiếu lẫn có repo đủ»); false thì chỉ GHOST.
 * Trả về: `{ tmp, proj }` (đường dẫn tuyệt đối). Tác dụng phụ: tạo thư mục / tệp trong thư mục tạm của hệ điều hành — nơi gọi phải xoá `tmp`.
 */
function buildFakeProject(withRealApp = false) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ws-missing-'));
  const proj = path.join(tmp, 'proj');
  fs.mkdirSync(path.join(proj, 'scripts', 'lib'), { recursive: true });
  for (const f of ['workspace.mjs', 'Workspace.ps1']) fs.copyFileSync(path.join(HERE, f), path.join(proj, 'scripts', 'lib', f));
  const repos = { proj: { path: '.' }, ghost: { path: '../ghost-chua-clone' } };
  const apps = [{ code: 'GHOST', repo: 'ghost' }];
  if (withRealApp) { fs.mkdirSync(path.join(tmp, 'real'), { recursive: true }); repos.real = { path: '../real' }; apps.push({ code: 'REAL', repo: 'real' }); }
  fs.writeFileSync(path.join(proj, 'workspace.json'), JSON.stringify({ project: 'X', platform: { path: PLATFORM_ROOT }, repos, apps }, null, 2));
  return { tmp, proj };
}

/** Hàm làm gì: nạp workspace.mjs của dự án giả bằng tiến trình con. Trả về: `{ status, stdout, stderr }`. `extraEnv` ghi đè biến môi trường (undefined = xoá). */
function loadJs(proj, extraEnv = {}) {
  const url = pathToFileURL(path.join(proj, 'scripts', 'lib', 'workspace.mjs')).href;
  // PTCORE_PROJECT_ROOT của máy (trỏ dự án THẬT) phải bị gỡ: tiến trình con chạy trên dự án GIẢ, thừa hưởng biến này thì công cụ từ chối đúng thiết kế («trỏ tới dự án KHÁC») và ca đỏ vì sai lý do.
  const env = { ...process.env, PTCORE_ALLOW_MISSING_APPS: undefined, PLATFORM_ROOT: undefined, PTCORE_PROJECT_ROOT: undefined, ...extraEnv };
  for (const k of Object.keys(env)) if (env[k] === undefined) delete env[k];
  const r = spawnSync(process.execPath, ['--input-type=module', '-e', `import('${url}').then((m) => console.log('LOADED ' + m.apps().map((a) => a.code).join(',')))`], { encoding: 'utf8', env });
  return { status: r.status, stdout: (r.stdout ?? '').trim(), stderr: (r.stderr ?? '').trim() };
}

/** Hàm làm gì: nạp Workspace.ps1 của dự án giả rồi gọi Get-WsContext trong PowerShell 5.1. Trả về: `{ status, stdout, stderr }`. */
function loadPs(proj, extraEnv = {}) {
  const lib = path.join(proj, 'scripts', 'lib', 'Workspace.ps1');
  const script = path.join(proj, 'ctx.ps1');
  fs.writeFileSync(script, `$ErrorActionPreference = 'Stop'\n. '${lib.replaceAll("'", "''")}'\n$c = Get-WsContext\nWrite-Output ('LOADED ' + (@($c.Apps | ForEach-Object { $_.Code }) -join ','))\n`);
  const env = { ...process.env, PTCORE_ALLOW_MISSING_APPS: undefined, PLATFORM_ROOT: undefined, PTCORE_PROJECT_ROOT: undefined, ...extraEnv };
  for (const k of Object.keys(env)) if (env[k] === undefined) delete env[k];
  const r = spawnSync('powershell', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', script], { encoding: 'utf8', env });
  return { status: r.status, stdout: (r.stdout ?? '').trim(), stderr: (r.stderr ?? '').trim() };
}

test('JS dự án: khai phần mềm mà repo chưa clone ⇒ nạp thư viện ĐỎ, nêu tên phần mềm + biến cho phép (không xanh giả)', { skip: !CAN_RUN }, () => {
  const { tmp, proj } = buildFakeProject();
  try {
    const r = loadJs(proj);
    assert.notEqual(r.status, 0, 'phải đỏ: ' + r.stdout);
    assert.match(r.stderr, /GHOST/);
    assert.match(r.stderr, /PTCORE_ALLOW_MISSING_APPS/);
    assert.doesNotMatch(r.stdout, /LOADED/);
  } finally { fs.rmSync(tmp, { recursive: true, force: true }); }
});

test('JS dự án: đặt PTCORE_ALLOW_MISSING_APPS=1 ⇒ cho qua và CHỈ liệt kê phần mềm có repo thật; 0 / rỗng KHÔNG phải là cho phép', { skip: !CAN_RUN }, () => {
  const { tmp, proj } = buildFakeProject(true);
  try {
    assert.equal(loadJs(proj, { PTCORE_ALLOW_MISSING_APPS: '1' }).stdout, 'LOADED REAL');
    assert.equal(loadJs(proj, { PTCORE_ALLOW_MISSING_APPS: 'true' }).stdout, 'LOADED REAL');
    for (const v of ['0', '', 'no']) assert.notEqual(loadJs(proj, { PTCORE_ALLOW_MISSING_APPS: v }).status, 0, `giá trị «${v}» không phải cho phép`);
  } finally { fs.rmSync(tmp, { recursive: true, force: true }); }
});

test('PowerShell dự án: cùng quy tắc với bản JS — repo chưa clone ⇒ Get-WsContext ném lỗi nêu tên; có biến cho phép ⇒ qua', { skip: !CAN_RUN || process.platform !== 'win32' }, () => {
  const { tmp, proj } = buildFakeProject(true);
  try {
    const bad = loadPs(proj);
    assert.notEqual(bad.status, 0, 'phải đỏ: ' + bad.stdout);
    assert.match(bad.stderr, /GHOST/);
    assert.match(bad.stderr, /PTCORE_ALLOW_MISSING_APPS/);
    assert.equal(loadPs(proj, { PTCORE_ALLOW_MISSING_APPS: '1' }).stdout, 'LOADED REAL');
    assert.notEqual(loadPs(proj, { PTCORE_ALLOW_MISSING_APPS: '0' }).status, 0, '0 không phải là cho phép');
  } finally { fs.rmSync(tmp, { recursive: true, force: true }); }
});

test('Dự án THẬT hiện đủ repo ⇒ nạp thư viện không đỏ (ca thuận: quy tắc không làm hỏng máy đủ repo)', { skip: !CAN_RUN }, () => {
  const r = loadJs(path.resolve(HERE, '..', '..'), {});
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /^LOADED /);
});
