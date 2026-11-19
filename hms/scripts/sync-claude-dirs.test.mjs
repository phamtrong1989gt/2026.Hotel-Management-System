// Test cho scripts/sync-claude-dirs.mjs — bản sao `.claude` + CLAUDE.md của dự án và các repo phần mềm phải khớp lõi. Chạy: node --test scripts/sync-claude-dirs.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { check, plan, realContext, relDirs, selftest } from './sync-claude-dirs.mjs';
import { PLATFORM_ROOT, PROJECT_ROOT, isSplit } from './lib/workspace.mjs';

/**
 * Hàm làm gì: cho biết dự án và lõi có nằm CÙNG ổ đĩa không — công cụ chỉ tạo được đường dẫn tương đối khi cùng ổ đĩa (khác ổ đĩa ⇒ `relDirs` ném lỗi, đúng thiết kế).
 * @returns {string|null} null nếu cùng ổ đĩa (hoặc không chạy kiểu tách); ngược lại thông báo lỗi của relDirs. Tác dụng phụ: không.
 */
function crossDriveProblem() {
  if (!isSplit) return null;
  try { relDirs(PROJECT_ROOT, [PLATFORM_ROOT]); return null; } catch (e) { return e.message; }
}
const CROSS_DRIVE = crossDriveProblem();

test('tự kiểm của công cụ: mọi ca thuận + ca âm đúng kỳ vọng', () => {
  const log = console.log;
  console.log = () => {};   // selftest in từng ca ra stdout; test chỉ cần số ca sai
  let bad;
  try { bad = selftest(); } finally { console.log = log; }
  assert.equal(bad, 0, 'selftest báo có ca sai — chạy `node scripts/sync-claude-dirs.mjs --selftest`');
});

test('relDirs: đường dẫn tương đối dùng dấu / và tính từ thư mục khởi chạy', () => {
  assert.deepEqual(relDirs('/x/2026/p/app', ['/x/2026/core', '/x/2026/p/proj'], path.posix), ['../../core', '../proj']);
  assert.deepEqual(relDirs('/x/a', ['/x/a'], path.posix), ['.']);
});

test('relDirs: khác ổ đĩa ⇒ NÉM LỖI rõ «khác ổ đĩa, không tạo được đường dẫn tương đối» (không ghi đường dẫn tuyệt đối vào tệp)', () => {
  // Ký hiệu ổ đĩa C: / D: là GIẢ — chỉ để thử `path.win32` ở mọi hệ điều hành.
  assert.throws(() => relDirs('C:\\p\\app', ['D:\\core'], path.win32), /khác ổ đĩa, không tạo được đường dẫn tương đối/);
  assert.deepEqual(relDirs('C:\\p\\app', ['C:\\core', 'C:\\p\\proj'], path.win32), ['../../core', '../proj']);
});

test('DỰ ÁN THẬT: kế hoạch có đủ thư mục đích — dự án + từng repo phần mềm khai ở workspace.json', { skip: (!isSplit && 'không chạy ở thư mục dự án (không có workspace.json)') || (CROSS_DRIVE && 'dự án và lõi khác ổ đĩa — công cụ không hỗ trợ (đặt chung một ổ đĩa)') || false }, () => {
  const ctx = realContext();
  const p = plan(ctx);
  assert.ok(ctx.apps.length >= 1, 'workspace.json không liệt kê phần mềm nào');
  assert.ok(p.targets.length >= 1 + ctx.apps.length, `chỉ thấy ${p.targets.length} thư mục đích — dự án + ${ctx.apps.length} phần mềm`);
  for (const t of p.targets) assert.ok(p.files.some((f) => f.abs === path.join(t.root, 'CLAUDE.md')), `kế hoạch thiếu CLAUDE.md của ${t.root}`);
});

test('DỰ ÁN THẬT: .claude + CLAUDE.md của dự án và từng repo phần mềm khớp lõi (lõi đổi lệnh / hook mà quên chạy `node scripts/sync-claude-dirs.mjs --write` ⇒ ĐỎ)',
  { skip: (!isSplit && 'không chạy ở thư mục dự án (không có workspace.json)') || (CROSS_DRIVE && 'dự án và lõi khác ổ đĩa — công cụ không hỗ trợ (đặt chung một ổ đĩa)') || (!fs.existsSync(path.join(PROJECT_ROOT, '.claude', 'settings.json')) && 'dự án chưa đồng bộ .claude lần đầu — chạy: node scripts/sync-claude-dirs.mjs --write') }, () => {
    assert.deepEqual(check(plan(realContext())), []);
  });
