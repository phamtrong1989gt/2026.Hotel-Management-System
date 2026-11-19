// =============================================================================
// check-all.mjs — chạy HẾT các gate của `npm run check` rồi tổng hợp (không dừng ở gate đỏ đầu tiên).
//
//   `npm run check` nối các gate bằng `&&` ⇒ một gate đỏ che 9 gate sau (2026-10-16: check:module-parity đỏ vì features/dashboard
//   làm không ai biết trạng thái các gate còn lại — _bmad/_pending gate-chuoi-npm-check-va-ten-sln). Tệp này đọc CHÍNH chuỗi `check`
//   trong package.json (một nguồn chân lý — thêm gate vào `check` là `check:all` tự có) và chạy từng gate độc lập.
//
//   Dùng: npm run check:all [-- --only <phần tên gate>]   · Mã thoát: 1 khi có gate đỏ · 0 khi tất cả xanh.
// =============================================================================

import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = process.cwd();
const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'));
const chain = pkg.scripts?.check;
if (!chain) { console.error('✗ [check:all] package.json không có script "check".'); process.exit(1); }

const onlyIdx = process.argv.indexOf('--only');
const only = onlyIdx > -1 ? process.argv[onlyIdx + 1] : null;

const gates = chain.split('&&').map((s) => s.trim()).filter(Boolean)
  .filter((cmd) => !only || cmd.includes(only));
if (!gates.length) { console.error(`✗ [check:all] không có gate nào khớp "${only}".`); process.exit(1); }

const results = [];
for (const cmd of gates) {
  console.log(`\n── ${cmd} ──`);
  const t0 = Date.now();
  const r = spawnSync(cmd, { cwd: ROOT, shell: true, stdio: 'inherit' });
  results.push({ cmd, code: r.status ?? 1, ms: Date.now() - t0 });
}

const red = results.filter((r) => r.code !== 0);
console.log('\n══ [check:all] tổng hợp ══');
for (const r of results) console.log(`${r.code === 0 ? '✓' : '✗'} ${r.cmd.replace(/^node scripts\//, '')}  (${(r.ms / 1000).toFixed(1)}s)`);
console.log(red.length ? `\n✗ ${red.length}/${results.length} gate đỏ.` : `\n✓ ${results.length}/${results.length} gate xanh.`);
process.exit(red.length ? 1 : 0);
