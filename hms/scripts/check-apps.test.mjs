// Test cho scripts/check-apps.mjs — canh phần TỰ KIỂM (`--selftest`) và cổng hồ sơ phần mềm `app.yaml` của dự án.
// Vì sao có: nếu selftest hỏng mà không có test nào gọi nó thì `node --test scripts/` vẫn xanh. Test này gọi `selftest` THẬT (kho giả dựng trong thư mục tạm từ mẫu YAML viết sẵn trong mã —
// KHÔNG đọc phần mềm thật nào) và kiểm không để lại thư mục tạm; rồi chạy cổng trên chính dự án (hồ sơ của mọi phần mềm khai ở workspace.json phải hợp lệ).
// Chạy: node --test scripts/check-apps.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import { checkRepo, selftest } from './check-apps.mjs';
import { PROJECT_ROOT, isSplit } from './lib/workspace.mjs';

/** Hàm làm gì: liệt kê tên thư mục tạm do selftest của check-apps tạo (tiền tố `check-apps-`). Trả về: mảng tên. Tác dụng phụ: không. */
const tempDirs = () => fs.readdirSync(os.tmpdir()).filter((n) => n.startsWith('check-apps-'));

test('check-apps --selftest: mọi ca phá đỏ đúng chỗ, ca thuận xanh — và không để lại thư mục tạm', () => {
  const before = new Set(tempDirs());
  const log = console.log;
  console.log = () => {};   // selftest in từng ca ra stdout; test chỉ cần số ca sai
  let bad;
  try { bad = selftest(); } finally { console.log = log; }
  assert.equal(bad, 0, 'selftest báo có ca sai — chạy `node scripts/check-apps.mjs --selftest` để xem ca nào');
  assert.deepEqual(tempDirs().filter((n) => !before.has(n)), [], 'selftest không được để lại thư mục tạm');
});

test('DỰ ÁN THẬT: hồ sơ app.yaml của mọi phần mềm hợp lệ — cổng check-apps không có ERROR (WARN được phép)', { skip: !isSplit && 'không chạy ở thư mục dự án (không có workspace.json)' }, () => {
  const r = checkRepo(PROJECT_ROOT);
  assert.ok(r.apps >= 1, 'workspace.json không liệt kê phần mềm nào có app.yaml');
  assert.deepEqual(r.findings.filter((f) => f.level === 'ERROR').map((f) => `${f.rule} ${f.where} — ${f.message}`), []);
  assert.equal(r.code, 0);
});
