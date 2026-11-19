// gen-adm-script.mjs — bọc dòng lệnh cho gen-adm-script.cs: tìm LÕI nền tảng của dự án này (lib/workspace.mjs: platform.local.props → PLATFORM_ROOT → workspace.json),
// đặt PLATFORM_ROOT cho tiến trình con rồi chạy `dotnet run scripts/gen-adm-script.cs`. KHÔNG nối CSDL, KHÔNG chạy SQL — chỉ ghi MỘT tệp .sql do dev chạy sau (sqlcmd / SSMS).
//
// Dùng (ở thư mục DỰ ÁN):
//   node scripts/gen-adm-script.mjs --app <Mã> [--mode Linked|Standalone] [--out <tệp .sql>] [--app-version 0.1.0]
//     --app        mã phần mềm (bắt buộc; phải có trong workspace.json)
//     --mode       mặc định lấy từ `permission_registry` của app.yaml (sso ⇒ Linked, local ⇒ Standalone); ghi rõ để ép
//     --out        mặc định <repo phần mềm>/scripts/sql/<YYYY-MM-DD>_adm-tables-for-app-db.sql (D-CORE-173: script SQL đặt theo thư mục phần mềm)
//   Tệp đã tồn tại ⇒ KHÔNG ghi đè (dừng, mã thoát 1) — đặt --out sang tên khác để so với bản cũ khi nâng bản lõi.
// Mã thoát: 0 đã ghi · 1 tệp đích đã có / không tìm thấy phần mềm / dotnet lỗi · 2 sai tham số.
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { PLATFORM_ROOT, PROJECT_ROOT, P, apps } from './lib/workspace.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));

/**
 * Hàm làm gì: tách đối số `--khoá giá trị` thành bảng.
 * @param {string[]} argv Đối số sau tên tệp.
 * @returns {Record<string,string>} Bảng khoá → giá trị (khoá không có giá trị ⇒ 'true').
 */
function parseArgs(argv) {
  const o = {};
  for (let i = 0; i < argv.length; i++) {
    if (!argv[i].startsWith('--')) continue;
    const k = argv[i].slice(2);
    o[k] = i + 1 < argv.length && !argv[i + 1].startsWith('--') ? argv[++i] : 'true';
  }
  return o;
}

/**
 * Hàm làm gì: đọc một dòng `khoá: giá trị` ở cấp trên cùng của app.yaml (đủ cho `permission_registry`, `display_name`) — bỏ chú thích ` #` và cặp nháy.
 * @param {string} yamlPath Đường dẫn app.yaml.
 * @param {string} key Tên khoá.
 * @returns {string|null} Giá trị, hoặc null khi không có / null.
 */
function yamlTop(yamlPath, key) {
  const m = new RegExp(`^${key}:[ \\t]*(.*)$`, 'm').exec(fs.readFileSync(yamlPath, 'utf8'));
  if (!m) return null;
  const v = m[1].replace(/\s+#.*$/, '').trim().replace(/^(['"])(.*)\1$/, '$2');
  return v === '' || v === 'null' ? null : v;
}

/**
 * Hàm làm gì: điểm vào — xác định phần mềm, chế độ, tệp đích, rồi gọi dotnet.
 * @returns {number} Mã thoát.
 */
function main() {
  const o = parseArgs(process.argv.slice(2));
  if (!o.app || o.app === 'true') { console.error('Thiếu --app <Mã>. Ví dụ: node scripts/gen-adm-script.mjs --app ABC'); return 2; }
  const app = apps().find((a) => a.code.toLowerCase() === o.app.toLowerCase());
  if (!app) { console.error(`Không có phần mềm "${o.app}" trong workspace.json (có: ${apps().map((a) => a.code).join(', ') || 'không có'}).`); return 1; }
  if (!PLATFORM_ROOT) { console.error('Không tìm thấy lõi nền tảng — xem thông báo của lib/workspace.mjs.'); return 1; }

  const yamlPath = path.join(app.repoRoot, 'app.yaml');
  const registry = fs.existsSync(yamlPath) ? yamlTop(yamlPath, 'permission_registry') : null;
  const mode = (o.mode && o.mode !== 'true' ? o.mode : registry === 'sso' ? 'Linked' : 'Standalone');
  if (!/^(linked|standalone)$/i.test(mode)) { console.error('--mode chỉ nhận Linked hoặc Standalone.'); return 2; }

  const today = new Date();
  const stamp = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
  const out = path.resolve(o.out && o.out !== 'true' ? o.out : path.join(app.repoRoot, 'scripts', 'sql', `${stamp}_adm-tables-for-app-db.sql`));
  if (fs.existsSync(out)) { console.error(`Tệp đích đã có, KHÔNG ghi đè: ${out}\nĐặt --out sang tên khác (vd thêm hậu tố ngày) để so với bản cũ.`); return 1; }

  let coreVersion = '(không rõ)';
  try { coreVersion = fs.readFileSync(path.join(PLATFORM_ROOT, 'VERSION'), 'utf8').trim() || coreVersion; } catch { /* lõi cũ chưa có VERSION */ }
  const display = (fs.existsSync(yamlPath) && yamlTop(yamlPath, 'display_name')) || app.code;
  let projectName = path.basename(PROJECT_ROOT);
  try { projectName = JSON.parse(fs.readFileSync(path.join(PROJECT_ROOT, 'workspace.json'), 'utf8').replace(/^﻿/, '').replace(/\/\/[^\n]*/g, '')).project ?? projectName; } catch { /* giữ tên thư mục */ }

  const cs = path.join(HERE, 'gen-adm-script.cs');
  const argv = ['run', cs, '--', '--mode', mode, '--out', out, '--app', app.code, '--project', String(projectName), '--app-version', o['app-version'] && o['app-version'] !== 'true' ? o['app-version'] : '0.1.0', '--core-version', coreVersion];
  console.log(`gen-adm-script: ${app.code} · ${mode} · lõi ${coreVersion} → ${out}`);
  console.log(`  (tên hiển thị: ${display}; dotnet dựng lõi lần đầu có thể mất vài phút)`);
  const r = spawnSync('dotnet', argv, { stdio: 'inherit', env: { ...process.env, PLATFORM_ROOT } });
  if (r.error) { console.error('Không chạy được dotnet: ' + r.error.message); return 1; }
  return r.status ?? 1;
}

process.exit(main());
