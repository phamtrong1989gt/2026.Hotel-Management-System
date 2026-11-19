// Test cho scripts/lib/apps.mjs và scripts/lib/mini-yaml.mjs — canh phần TỰ KIỂM (`--selftest`) của hai thư viện, và quy tắc «KHÔNG có phần mềm mặc định cứng».
// Selftest dựng kho giả trong thư mục tạm từ mẫu YAML viết sẵn trong mã (không đọc phần mềm thật nào). Chạy: node --test scripts/lib/apps.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { DEFAULT_APP_CODE, listApps, resolveApp, resolveAppOrDefault, selftest as appsSelftest } from './apps.mjs';
import { parseYaml, selftest as yamlSelftest } from './mini-yaml.mjs';

/** Hàm làm gì: chạy `fn` với console.log bị tắt (selftest in từng ca ra stdout), trả về kết quả của `fn`. Tác dụng phụ: tạm thay console.log. */
function quiet(fn) {
  const log = console.log;
  console.log = () => {};
  try { return fn(); } finally { console.log = log; }
}

test('apps.mjs --selftest: mọi ca thuận + ca âm đúng kỳ vọng', () => {
  assert.equal(quiet(appsSelftest), 0, 'chạy `node scripts/lib/apps.mjs --selftest` để xem ca nào sai');
});

test('mini-yaml.mjs --selftest: mọi ca thuận + ca âm đúng kỳ vọng', () => {
  assert.equal(quiet(yamlSelftest), 0, 'chạy `node scripts/lib/mini-yaml.mjs --selftest` để xem ca nào sai');
});

test('mini-yaml: đọc đúng hồ sơ nhỏ và từ chối khoá trùng (có số dòng)', () => {
  assert.deepEqual(parseYaml('a: 1\nb:\n  c: x\n', 't.yaml'), { a: 1, b: { c: 'x' } });
  assert.throws(() => parseYaml('a: 1\na: 2\n', 't.yaml'), /t\.yaml:2.*khoá trùng/);
});

test('KHÔNG có phần mềm mặc định cứng: DEFAULT_APP_CODE = null; kho ≥ 2 phần mềm mà không chỉ rõ ⇒ ambiguous; kho 1 phần mềm ⇒ chọn nó', () => {
  assert.equal(DEFAULT_APP_CODE, null);
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'apps-nodef-'));
  try {
    /** Hàm làm gì: dựng phần mềm giả `code` dưới `root/src/Apps` (chỉ app.yaml tối thiểu hợp lệ). Tác dụng phụ: ghi đĩa trong thư mục tạm. */
    const mk = (root, code) => {
      const d = path.join(root, 'src', 'Apps', code);
      fs.mkdirSync(d, { recursive: true });
      fs.writeFileSync(path.join(d, 'app.yaml'), [`code: ${code}`, 'module_prefix: App.Modules.', `host_project: App.Api.${code}`, 'paths:', `  be: src/Apps/${code}/BE`, `  fe: src/Apps/${code}/FE`,
        `  api: src/Apps/${code}/BE/App.Api.${code}`, `  modules: src/Apps/${code}/BE/Modules`, `  tests: src/Apps/${code}/BE/Tests/T`, `  contracts: src/Apps/${code}/_contracts`, ''].join('\n'));
    };
    const one = path.join(tmp, 'one');
    mk(one, 'QQQ');
    assert.equal(resolveApp({}, one).app.code, 'QQQ');
    const two = path.join(tmp, 'two');
    mk(two, 'QQQ');
    mk(two, 'WWW');
    assert.equal(listApps(two).length, 2);
    for (const fn of [resolveApp, resolveAppOrDefault]) {
      const r = fn({}, two);
      assert.equal(r.status, 'ambiguous');
      assert.equal(r.app, null);
      assert.deepEqual(r.candidates.map((c) => c.code), ['QQQ', 'WWW']);
    }
    assert.equal(resolveApp({ app: 'www' }, two).app.code, 'WWW', '--app tường minh vẫn chọn được (không phân biệt hoa thường)');
  } finally { fs.rmSync(tmp, { recursive: true, force: true }); }
});
