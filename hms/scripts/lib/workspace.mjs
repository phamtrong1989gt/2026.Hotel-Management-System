// workspace — chỗ nối DUY NHẤT của công cụ cấp DỰ ÁN (thư mục `scripts/`) biết "kho mã" nay gồm NHIỀU thư mục (bố cục tách kho):
//   lõi nền tảng (thư mục có src/Core · src/Services · _bmad, dùng chung nhiều dự án) · dự án (thư mục có workspace.json · scripts · docs · deploy · services-config) · mỗi phần mềm một repo (BE · FE · _contracts · app.yaml).
//
// CÁCH DÙNG: công cụ vẫn nói bằng đường dẫn LOGIC của kho gộp cũ (`src/Core/…`, `src/Services/…`, `src/Apps/<Mã>/…`, `scripts/…`, `docs/…`, `deploy/…`) và vẫn truyền "gốc kho" (`repoRoot`)
//   như trước; gọi {@link P} thay cho `path.join(repoRoot, …)` để ra đường dẫn THẬT, {@link L} để đổi đường dẫn thật về logic (báo cáo, so khoá).
//   • `repoRoot` là gốc DỰ ÁN (thư mục chứa workspace.json) ⇒ ánh xạ theo workspace.json (`src/Apps/<Mã>/…` → repo phần mềm; `src/Core|Services/…` · `_bmad/…` → lõi; còn lại → dự án).
//   • `repoRoot` là gốc LẠ (kho giả của ca phá / tự kiểm dựng trong thư mục tạm) ⇒ nối thẳng như cũ — KHÔNG dịch.
//   • Chạy trong KHO GỘP CŨ (không có workspace.json) ⇒ mọi hàm thành phép nối thẳng, nên cùng một bộ script chạy được ở cả hai bố cục (so đáp án trước / sau khi tách).
// Logic nhận diện (thứ tự: PTCORE_PROJECT_ROOT → cwd → quanh lõi; workspace.json; PLATFORM_ROOT) nằm ở MỘT nơi: `src/Core/FE/tools/workspace-layout.mjs` của lõi (bản JS của `PTCore.Tests.WorkspaceLayout`)
//   — thư viện này CHỈ nạp nó. Không tìm thấy lõi ⇒ ném lỗi nêu các nơi đã thử (không đoán, không xanh giả).
//
// Xuất: PROJECT_ROOT · PLATFORM_ROOT · WS (ngữ cảnh hoặc null) · isSplit · P · L · isKnownRoot · apps (phần mềm của dự án) · findProjectRoot.

import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

/** Thư mục dự án suy từ vị trí tệp này: scripts/lib → scripts → <dự án>. */
export const PROJECT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

/** Tên tệp khai không gian làm việc của dự án. */
const WORKSPACE_FILE = 'workspace.json';

/**
 * Hàm làm gì: đọc `platform.path` trong workspace.json của dự án (đường dẫn lõi, tương đối thư mục dự án).
 * @returns {string|null} Đường dẫn tuyệt đối của lõi, hoặc null khi không có tệp / không có khoá / JSON hỏng.
 */
function platformPathFromWorkspaceFile() {
  try {
    const json = JSON.parse(stripJsonc(readFileSync(path.join(PROJECT_ROOT, WORKSPACE_FILE), 'utf8')));
    return typeof json?.platform?.path === 'string' ? path.resolve(PROJECT_ROOT, json.platform.path) : null;
  } catch { return null; }
}

/**
 * Hàm làm gì: bỏ chú thích dòng (`//`), chú thích khối và dấu phẩy thừa khỏi JSON (workspace.json do người viết tay, có chú thích) — giữ nguyên nội dung trong chuỗi.
 * CÙNG thuật toán với `stripJsonc` của `src/Core/FE/tools/workspace-layout.mjs` (không nạp được tệp đó ở đây vì lõi chưa được xác định — chính hàm này phục vụ việc tìm lõi).
 * Trước đây dùng `JSON.parse` thô: workspace.json có chú thích làm `platform.path` bị lờ đi lặng lẽ và rơi về lõi mặc định.
 * @param {string} text Nội dung JSON có thể kèm chú thích.
 * @returns {string} JSON thuần.
 */
function stripJsonc(text) {
  const bom = text.charCodeAt(0) === 0xFEFF ? 1 : 0;   // chịu BOM đầu tệp (PowerShell 5.1 `Set-Content -Encoding UTF8` ghi BOM)
  let out = '';
  let inStr = false;
  for (let i = bom; i < text.length; i++) {
    const c = text[i];
    const n = text[i + 1];
    if (inStr) { out += c; if (c === '\\') { out += n ?? ''; i++; } else if (c === '"') inStr = false; continue; }
    if (c === '"') { inStr = true; out += c; continue; }
    if (c === '/' && n === '/') { while (i < text.length && text[i] !== '\n') i++; out += '\n'; continue; }
    if (c === '/' && n === '*') { i += 2; while (i < text.length && !(text[i] === '*' && text[i + 1] === '/')) i++; i++; continue; }
    out += c;
  }
  return out.replace(/,(\s*[}\]])/g, '$1');
}

/**
 * Hàm làm gì: đọc `<PlatformRoot>` từ `platform.local.props` ở gốc dự án (tệp riêng từng máy, KHÔNG commit) — cùng bước với `Directory.Build.props` mỏng và `PlatformFromLocalProps` của C#.
 * @returns {string|null} Giá trị đã thay `$(MSBuildThisFileDirectory)` bằng gốc dự án, hoặc null khi không có tệp / không có phần tử.
 */
function platformPathFromLocalProps() {
  const file = path.join(PROJECT_ROOT, 'platform.local.props');
  if (!existsSync(file)) return null;
  const m = /<PlatformRoot[^>]*>\s*([^<]+?)\s*<\/PlatformRoot>/.exec(readFileSync(file, 'utf8'));
  return m ? m[1].replace('$(MSBuildThisFileDirectory)', PROJECT_ROOT + path.sep) : null;
}

/**
 * Hàm làm gì: xác định gốc LÕI cho dự án — CÙNG thứ tự với `PTCore.Tests.WorkspaceLayout` (C#) và `platform.mjs` của repo phần mềm: `platform.local.props` → biến `PLATFORM_ROOT` →
 * `workspace.json → platform.path`. KHÔNG có ứng viên mặc định cứng (dự án khác nhau đặt lõi ở chỗ khác nhau): không nơi nào cho ra lõi hợp lệ ⇒ ném lỗi nêu từng nơi đã thử.
 * Ứng viên hợp lệ khi có `src/Core/Framework`.
 * LƯU Ý: `Directory.Build.props` (MSBuild) KHÔNG đọc `workspace.json` (không đọc được JSON có chú thích) — nên nếu `platform.path` khác chỗ `Directory.Build.props` trỏ tới thì phải đặt thêm `platform.local.props`
 * hoặc `PLATFORM_ROOT` để MSBuild thấy CÙNG lõi với công cụ.
 * @returns {string|null} Gốc lõi (tuyệt đối), hoặc null nếu dự án không dùng bố cục tách (không có workspace.json) — khi đó công cụ chạy kiểu kho gộp.
 * @throws {Error} Có workspace.json nhưng không nơi nào cho ra một lõi hợp lệ: thông báo liệt kê TỪNG nơi đã thử (nguồn → đường dẫn, hoặc «không khai») và cách sửa.
 */
function resolvePlatformRoot() {
  if (!existsSync(path.join(PROJECT_ROOT, WORKSPACE_FILE))) return null;
  const tried = [];
  const sources = [
    ['platform.local.props (<PlatformRoot>)', platformPathFromLocalProps()],
    ['biến môi trường PLATFORM_ROOT', process.env.PLATFORM_ROOT],
    [`${WORKSPACE_FILE} → platform.path`, platformPathFromWorkspaceFile()],
  ];
  for (const [label, c] of sources) {
    if (!c || !c.trim()) { tried.push(`${label}: không khai`); continue; }
    const full = path.resolve(PROJECT_ROOT, c);
    if (existsSync(path.join(full, 'src', 'Core', 'Framework'))) return full;
    tried.push(`${label} = ${full}: không có src/Core/Framework`);
  }
  throw new Error(`Không tìm thấy lõi nền tảng (thư mục có src/Core/Framework) cho dự án ${PROJECT_ROOT}. Đã thử: ${tried.join('; ')}. `
    + `Cách sửa: đặt platform.path (đường dẫn tới thư mục lõi, tương đối thư mục dự án) trong ${WORKSPACE_FILE}, hoặc đặt biến môi trường PLATFORM_ROOT, hoặc tạo platform.local.props có <PlatformRoot> (riêng từng máy, không commit).`);
}

// Công cụ cấp dự án luôn thuộc đúng MỘT dự án (thư mục chứa các script này). `PTCORE_PROJECT_ROOT` đặt mà trỏ dự án KHÁC ⇒ ĐỎ ngay: nếu không, biến bị nuốt lặng lẽ (ép lại ở `WS` bên dưới)
// và công cụ chạy trên dự án khác với dự án người dùng nghĩ — «sai cấu hình phải đỏ ngay» như `discover` của lõi và bản C#.
{
  const fromEnv = (process.env.PTCORE_PROJECT_ROOT ?? '').trim();
  if (fromEnv && !same(path.resolve(fromEnv), PROJECT_ROOT)) {
    throw new Error(`PTCORE_PROJECT_ROOT=${fromEnv} trỏ tới dự án KHÁC với dự án chứa các script này (${PROJECT_ROOT}). Công cụ cấp dự án luôn chạy trên chính dự án của nó: bỏ biến, hoặc chạy script ở dự án kia.`);
  }
}

/** Gốc lõi nền tảng (null khi chạy kiểu kho gộp cũ). */
export const PLATFORM_ROOT = resolvePlatformRoot();

/** Mô-đun `workspace-layout.mjs` của lõi (null khi chạy kiểu kho gộp cũ). */
const layout = PLATFORM_ROOT
  ? await import(pathToFileURL(path.join(PLATFORM_ROOT, 'src', 'Core', 'FE', 'tools', 'workspace-layout.mjs')).href)
  : null;

/**
 * Ngữ cảnh đã nhận diện cho DỰ ÁN này (xem `discover` ở workspace-layout.mjs): { platformRoot, srcRoot, projectRoot, apps[{code, repoRoot, be, fe, contracts}], legacy, note }.
 * Ép `PTCORE_PROJECT_ROOT` = thư mục dự án chứa các script này — script luôn thuộc đúng MỘT dự án nên không dò theo thư mục đang đứng. null = chạy kiểu kho gộp cũ.
 */
export const WS = layout
  ? layout.discover({ platformRoot: PLATFORM_ROOT, cwd: PROJECT_ROOT, env: { ...process.env, PTCORE_PROJECT_ROOT: PROJECT_ROOT } })
  : null;

// Phần mềm khai trong workspace.json mà repo CHƯA clone ⇒ ĐỎ ngay lúc nạp (nêu tên phần mềm + cách khắc phục). Nếu lặng lẽ bỏ qua thì mọi cổng quét `apps()` vẫn XANH trong khi
// đã bỏ sót phần mềm (xanh giả). Dev chủ ý chỉ làm một phần mềm ⇒ đặt PTCORE_ALLOW_MISSING_APPS=1.
if (WS) layout.assertAppsComplete(WS, process.env);

/** true khi dự án dùng bố cục TÁCH (có workspace.json + lõi riêng). */
export const isSplit = WS !== null;

/**
 * Hàm làm gì: so hai đường dẫn có cùng một chỗ không (bỏ dấu phân cách cuối; Windows không phân biệt hoa thường).
 * @param {string} a Đường dẫn thứ nhất.
 * @param {string} b Đường dẫn thứ hai.
 * @returns {boolean} true nếu cùng một chỗ.
 */
function same(a, b) {
  const key = (p) => { const r = path.resolve(p).replace(/[\\/]+$/, ''); return process.platform === 'win32' ? r.toLowerCase() : r; };
  return key(a) === key(b);
}

/**
 * Hàm làm gì: kiểm `root` có phải gốc DỰ ÁN đã biết (nên được dịch đường dẫn logic → thật) hay là gốc lạ của kho giả (nối thẳng).
 * @param {string} root Gốc kho mà nơi gọi đang dùng.
 * @returns {boolean} true khi chạy kiểu tách VÀ `root` là thư mục dự án.
 */
export function isKnownRoot(root) {
  return isSplit && same(root, PROJECT_ROOT);
}

/**
 * Hàm làm gì: đường dẫn THẬT của một đường dẫn LOGIC tính từ gốc kho. Thay cho `path.join(repoRoot, …)`.
 * @param {string} root Gốc kho đang dùng (gốc dự án ⇒ dịch; gốc lạ ⇒ nối thẳng).
 * @param {...string} parts Các đoạn đường dẫn logic (dấu `/` hoặc `\`, ghép tuỳ ý — vd `P(root, 'src/Apps', code, 'app.yaml')`).
 * @returns {string} Đường dẫn tuyệt đối thật theo dấu phân cách của hệ điều hành (chưa bảo đảm tồn tại).
 */
export function P(root, ...parts) {
  if (!isKnownRoot(root)) return path.join(root, ...parts);
  return layout.mapLogical(parts.join('/'), WS);
}

/**
 * Hàm làm gì: đường dẫn LOGIC (dấu `/`) của một đường dẫn tuyệt đối thật — ngược của {@link P}. Dùng khi in báo cáo / so khoá kiểu `src/Apps/<Mã>/BE/…`.
 * @param {string} root Gốc kho đang dùng.
 * @param {string} abs Đường dẫn tuyệt đối.
 * @returns {string|null} Đường dẫn logic (chính gốc ⇒ `.`); `null` khi nằm ngoài mọi thư mục của dự án / lõi / phần mềm (gốc dự án) hoặc ngoài `root` (gốc lạ).
 */
export function L(root, abs) {
  if (isKnownRoot(root)) return layout.toLogical(abs, WS);
  const rel = path.relative(path.resolve(root), path.resolve(abs));
  if (rel === '') return '.';
  if (rel === '..' || rel.startsWith('..' + path.sep) || path.isAbsolute(rel)) return null;
  return rel.split(path.sep).join('/');
}

/**
 * Hàm làm gì: phần mềm của dự án (từ workspace.json) — nguồn cho việc liệt kê `src/Apps/*` khi gốc là dự án.
 * @returns {{code:string, repoRoot:string, be:string, fe:string, contracts:string}[]} Sắp theo mã; rỗng khi chạy kiểu kho gộp.
 */
export function apps() {
  return isSplit ? WS.apps : [];
}

/**
 * Hàm làm gì: tìm gốc kho cho một đường dẫn bất kỳ trong bố cục TÁCH — đi ngược tới thư mục có workspace.json (dự án); từ trong một repo phần mềm / lõi thì dùng đúng dự án của các script này.
 * @param {string} startDir Thư mục (hoặc tệp) xuất phát.
 * @returns {string|null} Gốc dự án, hoặc null khi không chạy kiểu tách (nơi gọi quay về cách dò kho gộp).
 */
export function findProjectRoot(startDir) {
  if (!isSplit) return null;
  const abs = path.resolve(startDir);
  return L(PROJECT_ROOT, abs) !== null || same(abs, PROJECT_ROOT) ? PROJECT_ROOT : null;
}
