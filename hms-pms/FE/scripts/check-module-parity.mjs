// =============================================================================
// check-module-parity.mjs — GATE "thư mục FE soi gương project BE" (2026-10-05; luật coder chốt ở 11.183).
//
//   Lõi được giao bằng DLL (BE) + gói biên dịch sẵn (FE) — người dùng tìm màn của một module BE ở ĐÚNG thư mục cùng tên bên FE.
//     MP-01  mỗi thư mục cấp một dưới src/app/modules/  = đoạn cuối tên một project  src/Core/Modules/PTCore.Modules.* của LÕI   (AuditLog → audit-log)
//     MP-02  mỗi thư mục cấp một dưới src/app/features/ = đoạn cuối tên một project  <repo phần mềm>/BE/Modules/App.Modules.*      (thư mục `main` là ngoại lệ ALLOW: module chính App.Modules.PMS)
//   Thư mục KHÔNG phải module (khung app, dùng chung) khai ALLOW kèm lý do. Fail (exit 1) khi lệch. Thuộc chuỗi `npm run check`.
//   Đường dẫn tới module lõi KHÔNG cứng: suy từ `fe-app.json → kit` (src/Core/FE) ⇒ src/Core/Modules cùng lõi; module của phần mềm ở `../BE/Modules` (BE cạnh FE trong repo phần mềm).
// =============================================================================

import { readdirSync, statSync, existsSync, KIT_ROOT } from '../../../../0.Core/src/Core/FE/tools/fe-overlay-fs.mjs';
import { join } from 'node:path';

const ROOT = process.cwd();
// ROOT = thư mục FE. Module lõi (PTCore.Modules.*) ở src/Core/Modules của LÕI = cha của nguồn chung FE (src/Core/FE) + `Modules`;
// module dự án (App.Modules.*) CÙNG phần mềm ở <repo phần mềm>/BE/Modules = ../BE/Modules.
const BE_MODULE_DIRS = [join(KIT_ROOT, '..', 'Modules'), join(ROOT, '..', 'BE', 'Modules')];

const ALLOW = {
  features: {
    shared: 'Thành phần dùng chung của app (không phải module nghiệp vụ).',
    error: 'Trang lỗi của khung app.',
    'landing-page': 'Trang mở đầu của khung app.',
    // Module CHÍNH của phần mềm: project BE App.Modules.PMS ↔ thư mục FE `features/main` (D1 của khung FE, _bmad/custom/fe/custom/fe-placement.yaml): tên LOGIC `Main` (route / URL `api/main`, `/main/…`)
    // giữ nguyên cho MỌI phần mềm, không đổi theo tên project BE. Ánh xạ cố định main → App.Modules.PMS.
    main: 'Giao diện của module nghiệp vụ App.Modules.PMS — giữ tên thư mục `main` theo tên logic Main của khung (route / URL), không đổi theo tên project BE.',
  },
  modules: {
    // 2026-11-02 (D-CORE-79, Kho lưu trữ lát cắt 1): màn FE `storage-explorer` (trình duyệt + giám sát lưu trữ chỉ-đọc) hiển thị phần Explorer của PTCore.Modules.FileStorage — BE KHÔNG tạo project riêng
    // (D-CORE-79 d: "mở rộng PTCore.Modules.FileStorage"), nên tên thư mục FE theo CHỨC NĂNG (cũng là tên route / quyền `StorageExplorer`) chứ không theo tên project `file-storage`.
    // Bỏ dòng này nếu sau đổi tên thư mục thành `file-storage` hoặc BE tách project PTCore.Modules.StorageExplorer.
    'storage-explorer': 'Giao diện phần Explorer của PTCore.Modules.FileStorage — thư mục FE đặt theo chức năng StorageExplorer (route / quyền), BE không tách project riêng (D-CORE-79 d).',
  },
};

/**
 * Đổi tên PascalCase của project BE thành kebab-case của thư mục FE.
 * @param name tên (đoạn cuối tên project), vd "AuditLog", "CMS", "FileStorage"
 * @returns "audit-log", "cms", "file-storage"
 */
const kebab = (name) => name.replace(/([a-z0-9])([A-Z])/g, '$1-$2').replace(/([A-Z])([A-Z][a-z])/g, '$1-$2').toLowerCase();

for (const d of BE_MODULE_DIRS) if (!existsSync(d)) { console.error(`✗ [check:module-parity] không thấy ${d}`); process.exit(1); }
const projects = BE_MODULE_DIRS.flatMap((dir) => readdirSync(dir).filter((n) => statSync(join(dir, n)).isDirectory()));
const core = new Set(projects.filter((n) => n.startsWith('PTCore.Modules.')).map((n) => kebab(n.slice('PTCore.Modules.'.length))));
const app = new Set(projects.filter((n) => n.startsWith('App.Modules.')).map((n) => kebab(n.slice('App.Modules.'.length))));

/**
 * Liệt kê thư mục con cấp một của một thư mục tương đối so với gốc FE.
 * @param rel đường dẫn tương đối, vd 'src/app/modules'
 * @returns tên các thư mục con (rỗng nếu thư mục không có)
 */
const dirsOf = (rel) => {
  const d = join(ROOT, rel);
  return existsSync(d) ? readdirSync(d).filter((n) => statSync(join(d, n)).isDirectory()) : [];
};

const violations = [];
for (const dir of dirsOf('src/app/modules')) {
  if (!core.has(dir) && !ALLOW.modules[dir])
    violations.push(`MP-01 src/app/modules/${dir} — không có project BE PTCore.Modules.* tương ứng (có: ${[...core].join(', ')}) → dời màn về thư mục đúng project sở hữu controller`);
}
for (const dir of dirsOf('src/app/features')) {
  if (!app.has(dir) && !ALLOW.features[dir])
    violations.push(`MP-02 src/app/features/${dir} — không có project BE App.Modules.* tương ứng (có: ${[...app].join(', ')}) → đặt vào features/<module> hoặc khai ALLOW kèm lý do`);
}

if (violations.length) {
  console.error(`✗ [check:module-parity] ${violations.length} thư mục FE lệch project BE:`);
  for (const v of violations) console.error('  ' + v);
  process.exit(1);
}
console.log(`[check:module-parity] ✓ modules/ (${dirsOf('src/app/modules').length}) ↔ PTCore.Modules.* · features/ (${dirsOf('src/app/features').length}, ${Object.keys(ALLOW.features).length} khung app / ngoại lệ đã khai) ↔ App.Modules.*`);
