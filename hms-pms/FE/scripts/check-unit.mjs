#!/usr/bin/env node
// =============================================================================
// check-unit.mjs — GATE "test đơn vị cho hàm THUẦN" (không Angular / DOM): chạy MỌI tệp `*.test.mjs` bằng `node --test`.
//
//   Hai nơi tìm tệp test:
//     • `scripts/tests/*.test.mjs` của CHÍNH ứng dụng (hàm thuần của features / modules cục bộ);
//     • `<nguồn chung>/tests/*.test.mjs` (src/Core/FE/tests — hàm thuần của platform + module chung, vd storage-namespace). Nguồn chung dùng chung nên mọi
//       ứng dụng chạy lại các test này: sửa platform mà làm hỏng một ứng dụng nào thì `npm run check` của ứng dụng đó đỏ.
//
//   Vì sao có tệp này thay vì liệt kê từng tệp trong package.json: thêm một tệp `*.test.mjs` là gate tự chạy nó (không phụ thuộc cách shell mở rộng `*` trên Windows
//   cmd / PowerShell / bash, và Node < 21 không tự mở rộng glob). Tệp bắt đầu bằng `_` (vd `_ts-loader.mjs`) là hàm dùng chung, không phải test.
//
//   Mỗi tệp test nạp TypeScript thuần bằng `typescript.transpileModule` (xem scripts/tests/_ts-loader.mjs, tests/_ts-loader.mjs ở nguồn chung) — KHÔNG thêm gói npm,
//   KHÔNG cần Angular / Jest / Karma.
//   Mã thoát: 1 khi có test đỏ hoặc không có tệp test nào · 0 khi tất cả xanh. Thuộc chuỗi `npm run check`.
// =============================================================================

import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const APP_TESTS = join(ROOT, 'scripts', 'tests');
const FE_APP = JSON.parse(readFileSync(join(ROOT, 'fe-app.json'), 'utf8'));
const KIT_TESTS = join(resolve(ROOT, FE_APP.kit), 'tests');

/**
 * Liệt kê tệp test trong một thư mục (không tồn tại ⇒ rỗng).
 * @param dir thư mục chứa các tệp `*.test.mjs`
 * @returns đường dẫn tuyệt đối đã sắp xếp
 */
const testsIn = (dir) => (existsSync(dir) ? readdirSync(dir).filter((n) => n.endsWith('.test.mjs') && !n.startsWith('_')).sort().map((n) => join(dir, n)) : []);

const appFiles = testsIn(APP_TESTS);
const kitFiles = testsIn(KIT_TESTS);
const files = [...appFiles, ...kitFiles];
if (!files.length) {
  console.error('✗ [check:unit] không có tệp *.test.mjs nào (scripts/tests của ứng dụng + tests của nguồn chung).');
  process.exit(1);
}

console.log(`[check:unit] chạy ${files.length} tệp test (${appFiles.length} của ứng dụng + ${kitFiles.length} của nguồn chung): ${files.map((f) => f.split(/[\\/]/).pop()).join(', ')}`);
const result = spawnSync(process.execPath, ['--test', ...files], { cwd: ROOT, stdio: 'inherit' });
if (result.error) {
  console.error('✗ [check:unit] không chạy được node --test:', result.error.message);
  process.exit(1);
}
process.exit(result.status ?? 1);
