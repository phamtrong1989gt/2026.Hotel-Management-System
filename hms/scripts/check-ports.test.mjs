// Test cho scripts/check-ports.mjs — công cụ kiểm cổng dev của mọi phần mềm trong dự án.
// Gồm: (1) tự kiểm `--selftest` (ca thuận + ca phá trên mô hình giả và kho giả ở thư mục tạm — KHÔNG đọc phần mềm thật nào), (2) hàm tiện ích, (3) cổng chạy trên chính dự án.
// Chạy: node --test scripts/check-ports.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import { CORE_FIXED_PORTS, RESERVED_RANGES, baseApiUrlOf, checkModel, loadModel, parseDocTable, passed, portOf, ruleViolations, selftest, synthModel } from './check-ports.mjs';
import { PROJECT_ROOT, isSplit } from './lib/workspace.mjs';

/** Hàm làm gì: liệt kê tên thư mục tạm do selftest của check-ports tạo (tiền tố `check-ports-`). Trả về: mảng tên. Tác dụng phụ: không. */
const tempDirs = () => fs.readdirSync(os.tmpdir()).filter((n) => n.startsWith('check-ports-'));

test('check-ports --selftest: mọi ca phá đỏ đúng chỗ, ca thuận xanh — và không để lại thư mục tạm', () => {
  const before = new Set(tempDirs());
  const log = console.log;
  console.log = () => {};   // selftest in từng ca ra stdout; test chỉ cần số ca sai
  let bad;
  try { bad = selftest(); } finally { console.log = log; }
  assert.equal(bad, 0, 'selftest báo có ca sai — chạy `node scripts/check-ports.mjs --selftest` để xem ca nào');
  assert.deepEqual(tempDirs().filter((n) => !before.has(n)), [], 'selftest không được để lại thư mục tạm');
});

test('ruleViolations: công thức khối — be_http chia hết cho 10, be_https = http + 1, fe = http − 800', () => {
  assert.deepEqual(ruleViolations({ be_http: 5400, be_https: 5401, fe: 4600 }), []);
  assert.match(ruleViolations({ be_http: 5405, be_https: 5406, fe: 4605 })[0], /không chia hết cho 10/);
  assert.match(ruleViolations({ be_http: 5400, be_https: 5402, fe: 4600 })[0], /be_https 5402 ≠ be_http \+ 1/);
  assert.match(ruleViolations({ be_http: 5400, be_https: 5401, fe: 4000 })[0], /fe 4000 ≠ be_http − 800/);
  assert.match(ruleViolations({ be_https: 5401 })[0], /thiếu be_http/);
  assert.deepEqual(ruleViolations({ be_http: 5400, be_https: 5401 }), [], 'fe tuỳ chọn khi nhóm dev không có FE');
  assert.match(ruleViolations({ be_http: 5410, be_https: 5411 }, { needFe: true })[0], /thiếu fe/);
});

test('parseDocTable: chỉ lấy bảng ở mục «## 2.», bỏ ký hiệu **, `` ` ``, hiểu ô «—» là không có cổng', () => {
  const md = '## 1. x\n| a | 1 | 2 | 3 | 4 |\n## 2. Bảng\n| Thành phần | BE http | BE https | FE | Tên miền | Ghi chú |\n|---|---|---|---|---|---|\n| **ZED** — máy coder | 5400 | `5401` | — | `zed.dev.localhost` | g |\n## 2a. khác\n| ZED — khác | 1 | 2 | 3 | 4 |\n';
  const rows = parseDocTable(md);
  assert.deepEqual([...rows.keys()], ['Thành phần', 'ZED — máy coder']);
  assert.deepEqual(rows.get('ZED — máy coder'), { http: 5400, https: 5401, fe: null, host: 'zed.dev.localhost' });
});

test('portOf · baseApiUrlOf: cổng của địa chỉ; dòng baseApiUrl bị chú thích không được tính', () => {
  assert.equal(portOf('https://localhost:5401/x'), 5401);
  assert.equal(portOf('https://host.example'), 443);
  assert.equal(portOf('/tương-đối'), undefined);
  assert.equal(baseApiUrlOf("a\n// baseApiUrl: 'https://localhost:1',\n  baseApiUrl: 'https://localhost:5401',\n"), 'https://localhost:5401');
  assert.equal(baseApiUrlOf('export const x = 1;'), null);
});

test('hằng cổng lõi: có đủ SSO / gateway / mini-rp / File API và dải dành riêng 8000–8999, 9900–9999', () => {
  const ports = CORE_FIXED_PORTS.map((f) => f.port);
  for (const p of [5100, 5101, 5110, 5111, 4300, 4310, 5200, 5201, 5210, 5211, 5300, 5600, 5601]) assert.ok(ports.includes(p), `thiếu cổng lõi ${p}`);
  assert.deepEqual(RESERVED_RANGES.map((r) => [r.from, r.to]), [[8000, 8999], [9900, 9999]]);
});

test('checkModel: mô hình giả nhất quán đạt; sửa một cổng thì không đạt', () => {
  const specs = [{ code: 'ZED', http: 5400 }, { code: 'YAK', http: 5500 }];
  assert.equal(passed(checkModel(synthModel(specs))), true);
  const m = synthModel(specs);
  m.apps[1].ports.dev.be_https = 5400;
  assert.equal(passed(checkModel(m)), false);
});

test('DỰ ÁN THẬT: cổng của mọi phần mềm khớp công thức, không trùng, khớp bảng docs/deploy/bang-cong-dev.md · launchSettings · angular.json · environment', { skip: !isSplit && 'không chạy ở thư mục dự án (không có workspace.json)' }, () => {
  const model = loadModel(PROJECT_ROOT);
  assert.ok(model.apps.length >= 1, 'workspace.json không liệt kê phần mềm nào');
  const r = checkModel(model);
  const detail = [...r.rows.filter((x) => !x.ok).map((x) => `${x.component} | ${x.source} | thực ${x.actual} ≠ đích ${x.expected}`), ...r.conflicts.map((c) => `${c.kind}: ${c.text}`)];
  assert.deepEqual(detail, []);
});
