// Test cho scripts/lib/workspace.mjs — chỗ nối «logic ↔ thật» của công cụ cấp dự án sau khi tách kho (2026-11-18).
//   Logic nhận diện nằm ở lõi (src/Core/FE/tools/workspace-layout.mjs, có bộ test riêng dựng cây giả); ở đây kiểm LỚP DÍNH: gốc dự án dịch đúng theo workspace.json THẬT,
//   gốc lạ (kho giả) nối thẳng như cũ, hàm ngược L khớp P. Chạy: node --test scripts/lib/workspace.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { L, P, PLATFORM_ROOT, PROJECT_ROOT, WS, apps, findProjectRoot, isKnownRoot, isSplit } from './workspace.mjs';

/** So hai đường dẫn không phân biệt dấu phân cách / hoa-thường (Windows). */
const same = (a, b) => path.resolve(a).toLowerCase() === path.resolve(b).toLowerCase();

test('KHO THẬT: nhận ra bố cục tách — có workspace.json, lõi riêng, và mọi phần mềm khai ở workspace.json có thư mục', () => {
  assert.ok(isSplit, 'không nhận ra bố cục tách (thiếu workspace.json ở thư mục dự án?)');
  assert.ok(PLATFORM_ROOT && fs.existsSync(path.join(PLATFORM_ROOT, 'src', 'Core', 'Framework')), 'lõi nền tảng không hợp lệ');
  assert.ok(same(WS.projectRoot, PROJECT_ROOT));
  assert.ok(apps().length >= 1, 'workspace.json không liệt kê phần mềm nào còn tồn tại');
  for (const a of apps()) assert.ok(fs.existsSync(a.repoRoot), `${a.code}: repo ${a.repoRoot} không tồn tại`);
});

test('P ở gốc dự án: src/Apps/<Mã>/… → repo phần mềm; src/Core · src/Services · _bmad → lõi; scripts · docs → dự án', () => {
  const first = apps()[0];
  assert.ok(same(P(PROJECT_ROOT, 'src/Apps', first.code, 'BE'), path.join(first.repoRoot, 'BE')));
  assert.ok(same(P(PROJECT_ROOT, `src\\Apps\\${first.code}\\app.yaml`), path.join(first.repoRoot, 'app.yaml')), 'dấu \\ cũng được');
  assert.ok(same(P(PROJECT_ROOT, 'src/Core/Framework'), path.join(PLATFORM_ROOT, 'src', 'Core', 'Framework')));
  assert.ok(same(P(PROJECT_ROOT, 'src/Services/Sso'), path.join(PLATFORM_ROOT, 'src', 'Services', 'Sso')));
  assert.ok(same(P(PROJECT_ROOT, '_bmad'), path.join(PLATFORM_ROOT, '_bmad')));
  assert.ok(same(P(PROJECT_ROOT, 'scripts/lib/workspace.mjs'), path.join(PROJECT_ROOT, 'scripts', 'lib', 'workspace.mjs')));
  assert.ok(same(P(PROJECT_ROOT, 'docs'), path.join(PROJECT_ROOT, 'docs')));
});

test('L là NGƯỢC của P: tệp của phần mềm → src/Apps/<Mã>/…; của lõi → src/…; của dự án → scripts/…; ngoài mọi thư mục ⇒ null', () => {
  for (const rel of [`src/Apps/${apps()[0].code}/app.yaml`, 'src/Core/Framework', 'src/Services/Sso', 'scripts/lib/workspace.mjs', 'docs']) {
    assert.equal(L(PROJECT_ROOT, P(PROJECT_ROOT, rel)), rel);
  }
  assert.equal(L(PROJECT_ROOT, PROJECT_ROOT), '.');
  assert.equal(L(PROJECT_ROOT, path.join(os.tmpdir(), 'ngoai-moi-thu-muc')), null);
});

test('GỐC LẠ (kho giả của ca phá / selftest): P nối thẳng, L tính tương đối gốc đó — không dịch theo workspace.json', () => {
  const fake = fs.mkdtempSync(path.join(os.tmpdir(), 'ws-fake-'));
  try {
    assert.equal(isKnownRoot(fake), false);
    assert.equal(P(fake, 'src/Apps/ZED/BE'), path.join(fake, 'src/Apps/ZED/BE'));
    assert.equal(P(fake, 'src', 'Apps', 'ZED'), path.join(fake, 'src', 'Apps', 'ZED'));
    assert.equal(L(fake, path.join(fake, 'src', 'Apps', 'ZED')), 'src/Apps/ZED');
    assert.equal(L(fake, fake), '.');
    assert.equal(L(fake, path.join(os.tmpdir(), 'khac')), null, 'ngoài gốc lạ ⇒ null');
  } finally { fs.rmSync(fake, { recursive: true, force: true }); }
});

test('findProjectRoot: từ BẤT KỲ thư mục nào của dự án / lõi / một repo phần mềm đều ra đúng gốc dự án; ngoài ra ⇒ null', () => {
  assert.ok(same(findProjectRoot(path.join(PROJECT_ROOT, 'scripts')), PROJECT_ROOT));
  assert.ok(same(findProjectRoot(path.join(PLATFORM_ROOT, 'src', 'Core')), PROJECT_ROOT));
  assert.ok(same(findProjectRoot(path.join(apps()[0].repoRoot, 'BE')), PROJECT_ROOT));
  assert.equal(findProjectRoot(os.tmpdir()), null);
});

test('CA PHÁ: P ở gốc dự án KHÔNG bao giờ trả đường dẫn kiểu kho gộp «<dự án>/src/Apps/…» cho phần mềm đã khai (lỗi quên dịch phải lộ)', () => {
  const code = apps()[0].code;
  const naive = path.join(PROJECT_ROOT, 'src', 'Apps', code);
  assert.ok(!same(P(PROJECT_ROOT, 'src/Apps', code), naive), 'P trả đường dẫn chưa dịch');
  assert.equal(fs.existsSync(naive), false, 'thư mục src/Apps/<Mã> không được tồn tại ở dự án — nếu có thì mọi phép dịch bị che');
});
