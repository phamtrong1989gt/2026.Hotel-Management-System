// Test cho scripts/lib/Workspace.ps1 — bản PowerShell của phép dịch đường dẫn LOGIC ⇄ THẬT (bản JS: scripts/lib/workspace.mjs; bản C#: PTCore.Tests.WorkspaceLayout).
// Ba bản PHẢI nhận diện giống nhau: test chạy MỘT tiến trình PowerShell dịch cùng một bảng đường dẫn logic rồi so từng dòng với `P` / `L` của workspace.mjs.
// Chạy: node --test scripts/lib/workspace-ps1.test.mjs   (cần Windows PowerShell 5.1 và bố cục TÁCH — có workspace.json; ngược lại ca bị bỏ qua).
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { L, P, PROJECT_ROOT, apps, isSplit } from './workspace.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const LIB = path.join(HERE, 'Workspace.ps1');
const CAN_RUN = process.platform === 'win32' && isSplit;

/** So hai đường dẫn Windows không phân biệt hoa thường / kiểu dấu phân cách. */
const sameFile = (a, b) => path.normalize(String(a)).toLowerCase() === path.normalize(String(b)).toLowerCase();

/**
 * Chạy một đoạn PowerShell (đã nạp Workspace.ps1) trong tiến trình riêng.
 * Hàm làm gì: ghi `body` vào tệp .ps1 tạm có dòng dot-source thư viện, chạy bằng `powershell -File`, trả stdout đã cắt khoảng trắng.
 * Tham số: `body` — mã PowerShell (chỉ dùng đường dẫn / tên, KHÔNG chứa bí mật).
 * Trả về: `{ status, stdout, stderr }`.
 * Tác dụng phụ: ghi / xoá một tệp tạm trong thư mục tạm của hệ điều hành.
 */
function runPs(body) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'wsps1-'));
  try {
    const file = path.join(dir, 't.ps1');
    fs.writeFileSync(file, `$ErrorActionPreference = 'Stop'\n. '${LIB.replaceAll("'", "''")}'\n${body}\n`);
    const r = spawnSync('powershell', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', file], { encoding: 'utf8' });
    return { status: r.status, stdout: (r.stdout ?? '').trim(), stderr: (r.stderr ?? '').trim() };
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

/** Mã phần mềm đầu tiên của workspace.json (không cứng tên); chưa có phần mềm nào thì dùng tên giả — bảng bên dưới vẫn có nghĩa với đường dẫn không tồn tại. */
const FIRST = apps()[0]?.code ?? 'ZED';

/** Bảng đường dẫn logic dùng để đối chiếu: đủ ba vùng (phần mềm · lõi · dự án), đường dẫn không tồn tại, gốc `src`, và dấu `\` lẫn `/`. */
const LOGICAL = [
  'src/Services/Sso/scripts/start.ps1', 'src\\Services\\Gateway\\BE\\PTCore.API.Gateway', 'src/Core', 'src/Core/FE/tools/workspace-layout.mjs',
  `src/Apps/${FIRST}/scripts/run.ps1`, `src/Apps/${FIRST}/FE`, `src\\Apps\\${FIRST}\\BE`, `src/Apps/${FIRST}`, 'src/Apps/KhongCo/x',
  'scripts/dev-stack.ps1', 'docs', 'deploy', '_bmad', 'src', 'workspace.json',
];

test('Workspace.ps1: Resolve-LogicalPath và ConvertTo-LogicalPath trùng khít với P / L của workspace.mjs trên cả bảng đường dẫn', { skip: !CAN_RUN && 'cần Windows + bố cục tách' }, () => {
  const ps = `$out = @(); foreach ($l in @(${LOGICAL.map((l) => `'${l.replaceAll("'", "''")}'`).join(',')})) { $r = Resolve-LogicalPath $l; $out += [pscustomobject]@{ logical = $l; real = $r; back = (ConvertTo-LogicalPath $r) } }\n$out | ConvertTo-Json -Compress`;
  const r = runPs(ps);
  assert.equal(r.status, 0, r.stderr || r.stdout);
  const rows = JSON.parse(r.stdout);
  assert.equal(rows.length, LOGICAL.length);
  for (const row of rows) {
    const jsReal = P(PROJECT_ROOT, row.logical);
    assert.ok(sameFile(row.real, jsReal), `Resolve-LogicalPath('${row.logical}') = ${row.real}, JS P = ${jsReal}`);
    assert.equal(row.back, L(PROJECT_ROOT, jsReal), `ConvertTo-LogicalPath(${row.real}) ≠ JS L`);
  }
});

test('Workspace.ps1: Get-WsApps trùng danh sách phần mềm của workspace.json (mã + thư mục repo)', { skip: !CAN_RUN && 'cần Windows + bố cục tách' }, () => {
  const r = runPs(`Get-WsApps | ForEach-Object { $_.Code + '|' + $_.RepoRoot } | ConvertTo-Json -Compress`);
  assert.equal(r.status, 0, r.stderr || r.stdout);
  const got = [].concat(JSON.parse(r.stdout)).map((s) => s.split('|'));
  const want = apps().map((a) => [a.code, a.repoRoot]);
  assert.equal(got.length, want.length);
  got.forEach(([code, repo], i) => { assert.equal(code, want[i][0]); assert.ok(sameFile(repo, want[i][1]), `${code}: ${repo} ≠ ${want[i][1]}`); });
});

test('Workspace.ps1: gốc LẠ (kho giả của ca phá) ⇒ nối thẳng, không dịch; đường dẫn ngoài mọi thư mục ⇒ ConvertTo-LogicalPath trả $null', { skip: !CAN_RUN && 'cần Windows + bố cục tách' }, () => {
  const fake = path.join(os.tmpdir(), 'zz-ws-fake-root');
  const r = runPs(`$root = '${fake.replaceAll("'", "''")}'\n[pscustomobject]@{ real = (Resolve-LogicalPath 'src/Apps/ZED/BE/x' -Root $root); back = (ConvertTo-LogicalPath (Join-Path $root 'src\\Apps\\ZED\\x') -Root $root); outside = ($null -eq (ConvertTo-LogicalPath 'C:\\Windows' -Root $root)); apps = @(Get-WsApps -Root $root).Count } | ConvertTo-Json -Compress`);
  assert.equal(r.status, 0, r.stderr || r.stdout);
  const j = JSON.parse(r.stdout);
  assert.ok(sameFile(j.real, path.join(fake, 'src', 'Apps', 'ZED', 'BE', 'x')), j.real);
  assert.equal(j.back, 'src/Apps/ZED/x');
  assert.equal(j.outside, true);
  assert.equal(j.apps, 0, 'kho giả không có src\\Apps ⇒ không phần mềm nào');
});

test('Workspace.ps1: thuần ASCII (PowerShell 5.1 đọc UTF-8 không BOM thành ANSI — tiếng Việt có dấu sẽ vỡ)', () => {
  const bytes = fs.readFileSync(LIB);
  const bad = [...bytes].findIndex((b) => b > 127);
  assert.equal(bad, -1, `byte không phải ASCII ở vị trí ${bad}`);
});
