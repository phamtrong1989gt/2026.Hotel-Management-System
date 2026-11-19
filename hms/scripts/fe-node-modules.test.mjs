// Test cho scripts/fe-node-modules.mjs — cài FE dùng chung một bản ở lõi. Chạy: node --test scripts/fe-node-modules.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { PLATFORM_ROOT, apps, isSplit } from './lib/workspace.mjs';
import { compareDeps, readDeps, selftest } from './fe-node-modules.mjs';

test('tự kiểm của công cụ: mọi ca thuận + ca âm đúng kỳ vọng', () => {
  const log = console.log;
  console.log = () => {};   // selftest in từng ca ra stdout; test chỉ cần số ca sai
  let bad;
  try { bad = selftest(); } finally { console.log = log; }
  assert.equal(bad, 0);
});

test('CA PHÁ: thêm một gói vào MỘT FE ⇒ compareDeps báo lệch đúng FE đó; thiếu gói và khác phiên bản cũng báo', () => {
  const deps = { a: '1.0.0', b: '2.0.0' };
  const problems = compareDeps([{ name: 'chuẩn', deps }, { name: 'sai', deps: { ...deps, 'goi-la-abc': '1.0.0' } }]);
  assert.equal(problems.length, 1);
  assert.match(problems[0], /^sai: thừa gói «goi-la-abc»/);
  assert.match(compareDeps([{ name: 'chuẩn', deps }, { name: 'sai', deps: { a: '1.0.0' } }])[0], /^sai: thiếu gói «b»/);
  assert.match(compareDeps([{ name: 'chuẩn', deps }, { name: 'sai', deps: { a: '9.9.9', b: '2.0.0' } }])[0], /^sai: «a» 9\.9\.9 ≠ 1\.0\.0/);
  assert.deepEqual(compareDeps([{ name: 'chuẩn', deps }, { name: 'giống', deps: { ...deps } }]), []);
});

test('DỰ ÁN THẬT: mọi FE (phần mềm có FE/package.json + dịch vụ FE của lõi) khai CÙNG phụ thuộc, CÙNG phiên bản — điều kiện để dùng chung một bản cài ở lõi',
  { skip: (!isSplit || apps().every((a) => !fs.existsSync(path.join(a.repoRoot, a.fe ?? 'FE', 'package.json')))) && 'dự án chưa có FE/package.json nào' }, () => {
    const roots = apps().map((a) => ({ name: `Apps/${a.code}`, pkg: path.join(a.repoRoot, a.fe ?? 'FE', 'package.json') })).filter((r) => fs.existsSync(r.pkg));
    const svc = path.join(PLATFORM_ROOT, 'src', 'Services');
    if (fs.existsSync(svc)) {
      for (const d of fs.readdirSync(svc)) {
        const pkg = path.join(svc, d, 'FE', 'package.json');
        if (fs.existsSync(pkg)) roots.push({ name: `Services/${d}`, pkg });
      }
    }
    assert.ok(roots.length >= 1);
    assert.deepEqual(compareDeps(roots.map((r) => ({ name: r.name, deps: readDeps(r.pkg) }))), []);
  });
