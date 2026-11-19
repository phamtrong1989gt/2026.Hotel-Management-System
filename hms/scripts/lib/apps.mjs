// apps — thư viện DUY NHẤT cho công cụ biết "kho có những phần mềm nào, mỗi phần mềm ở đâu" (D-CORE-77, P1; đề xuất N3 + N6).
//
// Bố cục ba vùng (D-CORE-68/70/75/76):  src/Core (lõi dùng chung) · src/Services/<Dịch vụ>/{BE,FE} (SSO, Gateway…) · src/Apps/<Mã>/ (phần mềm nghiệp vụ, MỖI phần mềm một `app.yaml`).
// Công cụ KHÔNG được cứng `src/BE`, `src/FE`, `src/BE/App`, `src/BE/Core`, `src/FE_SSO` nữa: lấy gốc quét từ đây (hằng vùng + danh sách phần mềm).
//
// Nội dung:
//   • hằng vùng:  ZONE_CORE · ZONE_CORE_FE · ZONE_SERVICES · ZONE_APPS · APP_FILE
//   • sổ phiên + prompt của LÕI (dùng chung mọi phần mềm / dịch vụ, D-CORE-78; dời từ `_core/_session` · `_core/prompts` ngày 2026-11-02, D-CORE-86 e):  CORE_SESSION_DIR · CORE_PROMPTS_DIR · CORE_VARS
//   • đọc hồ sơ:  scanApps · listApps · readApp · validateAppData · appPaths
//   • phân giải "đang làm phần mềm nào" (N6):  resolveApp · describeResolution · resolveAppOrDefault (+ DEFAULT_APP_CODE = null: KHÔNG có phần mềm mặc định)
//   • hồ sơ hợp đồng theo phần mềm (P2, D-CORE-77 Q1: `src/Apps/<Mã>/_contracts`):  contractsRoots · appOfPath · appPaths(app).contracts
//   • bảng biến của luật `_bmad` (đợt đa phần mềm):  appVars · VAR_KEYS   (CLI `--vars`, `--print <khoá>`) — gồm `{app_*}` theo phần mềm VÀ `{core_session}` · `{core_prompts}` (một giá trị cho cả kho)
//   • gốc quét cho công cụ:  beScanRoots · feScanRoots · feSharedRoots · moduleRoots · moduleProjectDirs · classifySource · requireRoots · findRepoRoot
//     (feSharedRoots = nguồn FE DÙNG CHUNG `src/Core/FE`: platform + modules/<m> dùng chung — không nằm trong `paths.fe` của phần mềm nào, nên feScanRoots một mình bỏ sót)
// Mọi hàm THIẾU thư mục gốc (không có src/Apps, hồ sơ hỏng, danh sách gốc quét rỗng) đều NÉM AppsError — không trả "rỗng" để công cụ gọi báo xanh giả.
//
// Dùng:  import { listApps, resolveApp } from '<tới>/scripts/lib/apps.mjs';
// CLI:   node scripts/lib/apps.mjs                                      liệt kê phần mềm
//        node scripts/lib/apps.mjs --resolve [--app <Mã>] [--path p ...] [--module M]    in kết quả phân giải N6 (mã thoát 0 ok · 3 hỏi lại / không có)
//        node scripts/lib/apps.mjs --print <khoá> [--app <Mã>] [--path p ...] [--module M]   in MỘT giá trị của phần mềm (đường dẫn tương đối gốc kho, dấu `/`) — khoá: root · be · fe · api · modules · module · tests · contracts · session · code · host_project · module_project · tests_project · AppPascal · config_key (hoặc đúng tên biến `app_*`) · core_session · core_prompts (hai khoá lõi KHÔNG theo phần mềm: in được dù chưa chỉ rõ phần mềm và kể cả khi kho nhiều phần mềm).
//        node scripts/lib/apps.mjs --vars [--app <Mã>] [--path p ...] [--module M]    in TOÀN BỘ bảng biến `{app_*}` của phần mềm (đợt đa phần mềm: luật `_bmad` viết `{app_fe}`, `{app_module}`… thay cho đường dẫn cứng).
//             Đây là cách lệnh / luật `_bmad` đổi biến `{app_contracts}` (= `--print contracts`), `{app_fe}` (= `--print fe`)… ra đường dẫn thật. Không chỉ rõ phần mềm mà kho có ≥ 2 phần mềm ⇒ mã thoát 3 (hỏi lại, KHÔNG đoán); kho chỉ có một phần mềm ⇒ chọn phần mềm đó. Mã thoát 0 ok · 3 hỏi lại / không có
//        node scripts/lib/apps.mjs --selftest                           ca thuận + ca âm (thiếu app.yaml, trùng, module ở hai phần mềm, đường dẫn ngoài src/Apps…)

import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { parseYaml, YamlError } from './mini-yaml.mjs';
import { L, P, apps as projectApps, findProjectRoot, isKnownRoot } from './workspace.mjs';

/** Thư mục lõi dùng chung (Framework · Modules · Host · Tests), tính từ gốc kho, dấu `/`. */
export const ZONE_CORE = 'src/Core';
/** Nguồn FE dùng chung (platform · modules/<m> dùng chung · tools) — nằm TRONG lõi, tính từ gốc kho, dấu `/` (D-CORE-81 / D-CORE-84). Mỗi FE trỏ tới đây bằng `kit` trong `fe-app.json`. */
export const ZONE_CORE_FE = 'src/Core/FE';
/** Sổ phiên CỦA LÕI (resume · context · decisions · history · backlog · archive) — dùng chung mọi phần mềm và dịch vụ SSO / Gateway (D-CORE-78); tính từ gốc kho, dấu `/`. Dời từ `_core/_session` ngày 2026-11-02 (D-CORE-86 e). Luật `_bmad` viết `{core_session}`. */
export const CORE_SESSION_DIR = `${ZONE_CORE}/_session`;
/** Prompt bàn giao / quy trình CỦA LÕI (vd bàn giao cho phiên `_bmad`) — tính từ gốc kho, dấu `/`. Dời từ `_core/prompts` ngày 2026-11-02 (D-CORE-86 e). Luật `_bmad` viết `{core_prompts}`. */
export const CORE_PROMPTS_DIR = `${ZONE_CORE}/_prompts`;
/** Biến của luật `_bmad` thuộc LÕI (một giá trị cho cả kho, KHÔNG phụ thuộc phần mềm đang làm): `tên biến ⇒ đường dẫn tương đối gốc kho`. {@link appVars} gộp bảng này vào cuối bảng biến. */
export const CORE_VARS = Object.freeze({ core_session: CORE_SESSION_DIR, core_prompts: CORE_PROMPTS_DIR });
/** Thư mục các dịch vụ dùng chung (Sso · Gateway · …), mỗi dịch vụ một thư mục con có `BE` (và `FE` nếu có giao diện). */
export const ZONE_SERVICES = 'src/Services';
/** Thư mục các phần mềm nghiệp vụ; mỗi phần mềm một thư mục con có `app.yaml`. */
export const ZONE_APPS = 'src/Apps';
/** Tên tệp hồ sơ ứng dụng đặt ngay trong thư mục phần mềm. */
export const APP_FILE = 'app.yaml';

/** Thư mục script SQL của máy chủ SSO — CHỈ nên giữ script của CHÍNH SSO (idp · openiddict · phiên · danh mục SSO sở hữu). Script của một phần mềm đặt ở `src/Apps/<Mã>/scripts/sql` (D-CORE-173). */
export const SSO_SQL_DIR = `${ZONE_SERVICES}/Sso/scripts/sql`;

/** Giá trị hợp lệ của `permission_registry` (nơi ĐĂNG KÝ chức năng/quyền khi sinh mã): `local` = script `*-permissions.sql` trên CSDL của chính phần mềm (Standalone, MẶC ĐỊNH khi bỏ trống); `sso` = script đăng ký chạy trên CSDL SSO (Linked) — tệp đặt ở `src/Apps/<Mã>/scripts/sql/` của CHÍNH phần mềm (D-CORE-173; nơi cũ `src/Services/Sso/scripts/sql` vẫn được đọc, xem {@link sqlScriptDirs}). Luật: `_bmad/custom/skills/generate-module.md` mục D. */
export const PERMISSION_REGISTRIES = ['local', 'sso'];

/** Khoá `paths` BẮT BUỘC (chuỗi, tính từ gốc kho). */
export const REQUIRED_PATH_KEYS = ['be', 'fe', 'api', 'modules', 'tests', 'contracts'];
/** Khoá `paths` được phép bỏ trống (null) — chưa có thì để null kèm chú thích. */
export const OPTIONAL_PATH_KEYS = ['session'];
const TOP_KEYS = ['code', 'sso_code', 'sso_app_id', 'permission_registry', 'display_name', 'module_prefix', 'host_project', 'config_key', 'paths', 'ports'];

/** Lỗi của thư viện: thiếu thư mục gốc, hồ sơ ứng dụng hỏng, danh sách gốc quét rỗng… Mang `problems` (danh sách dòng lỗi) khi có nhiều lỗi. */
export class AppsError extends Error {
  /**
   * Hàm làm gì: dựng lỗi thư viện.
   * @param {string} message Nội dung lỗi (tiếng Việt).
   * @param {string[]} [problems] Danh sách lỗi chi tiết (mỗi phần tử một dòng), nếu có.
   */
  constructor(message, problems = []) {
    super(message);
    this.name = 'AppsError';
    this.problems = problems;
  }
}

/**
 * Hàm làm gì: kiểm `p` có phải thư mục tồn tại không (không ném lỗi).
 * @param {string} p Đường dẫn tuyệt đối.
 * @returns {boolean} true nếu là thư mục.
 */
const isDir = (p) => { try { return fs.statSync(p).isDirectory(); } catch { return false; } };
/**
 * Hàm làm gì: kiểm `p` có phải tệp tồn tại không (không ném lỗi).
 * @param {string} p Đường dẫn tuyệt đối.
 * @returns {boolean} true nếu là tệp.
 */
const isFile = (p) => { try { return fs.statSync(p).isFile(); } catch { return false; } };

/**
 * Hàm làm gì: tìm gốc kho bằng cách đi LÊN từ `startDir` tới thư mục đầu tiên có thư mục con `src/Apps` (kho gộp cũ / kho giả của ca phá). Ở bố cục TÁCH (có workspace.json) gốc kho = thư mục
 * DỰ ÁN, tìm được từ MỌI thư mục nằm trong dự án / lõi / một repo phần mềm — kho gộp không có `src/Apps` ở thư mục dự án nên không thể dò theo `src/Apps` nữa.
 * @param {string} startDir Thư mục (hoặc tệp) xuất phát; đường dẫn tương đối được đổi theo thư mục làm việc hiện tại.
 * @returns {string|null} Đường dẫn tuyệt đối của gốc kho, hoặc null nếu đi hết lên tới gốc ổ đĩa mà không thấy.
 */
export function findRepoRoot(startDir) {
  const project = findProjectRoot(startDir);
  if (project) return project;
  let d = path.resolve(startDir);
  try { if (fs.statSync(d).isFile()) d = path.dirname(d); } catch { /* chưa tồn tại: cứ đi lên */ }
  for (;;) {
    if (isDir(path.join(d, ZONE_APPS))) return d;
    const up = path.dirname(d);
    if (up === d) return null;
    d = up;
  }
}

/**
 * Hàm làm gì: đổi đường dẫn bất kỳ (tuyệt đối hoặc tương đối với gốc kho) thành đường dẫn tương đối gốc kho, dấu `/`, đã chuẩn hoá (`a/../b` ⇒ `b`).
 * @param {string} repoRoot Gốc kho (tuyệt đối).
 * @param {string} p Đường dẫn cần đổi.
 * @returns {string|null} Đường dẫn tương đối (`.` nếu chính là gốc), hoặc null nếu nằm NGOÀI gốc kho.
 */
export function relToRepo(repoRoot, p) {
  if (isKnownRoot(repoRoot)) {
    // gốc DỰ ÁN: đường dẫn tương đối hiểu là LOGIC (kho gộp cũ), đường dẫn tuyệt đối đổi ngược về logic theo workspace.json
    const abs = path.isAbsolute(p) ? path.normalize(p) : P(repoRoot, p);
    return L(repoRoot, abs);
  }
  const abs = path.isAbsolute(p) ? path.normalize(p) : path.resolve(repoRoot, p);
  const rel = path.relative(path.resolve(repoRoot), abs);
  if (rel === '') return '.';
  if (rel === '..' || rel.startsWith('..' + path.sep) || path.isAbsolute(rel)) return null;
  return rel.split(path.sep).join('/');
}

/**
 * Hàm làm gì: kiểm cú pháp một đường dẫn trong `paths` của hồ sơ (tương đối gốc kho, dấu `/`).
 * @param {string} v Giá trị đường dẫn.
 * @returns {string|null} Lý do sai, hoặc null nếu hợp lệ (không bắt đầu `/`, không ổ đĩa, không `\`, không đoạn `..`, không rỗng).
 */
function badRelPath(v) {
  if (typeof v !== 'string' || v.trim() === '') return 'phải là chuỗi không rỗng';
  if (v.includes('\\')) return 'dùng dấu "/" (không dùng "\\")';
  if (v.startsWith('/') || /^[A-Za-z]:/.test(v)) return 'phải tính từ gốc kho (không bắt đầu bằng "/" hay ổ đĩa)';
  if (v.split('/').some((s) => s === '..' || s === '' )) return 'không được chứa đoạn ".." hoặc "//"';
  return null;
}

/**
 * Hàm làm gì: kiểm cấu trúc dữ liệu hồ sơ ứng dụng (đã đọc từ YAML) và trả MỌI lỗi tìm được (không ném).
 * Kiểm: khoá lạ ở cấp trên · `code` khớp tên thư mục · các trường bắt buộc đúng kiểu · `paths.*` đúng cú pháp và nằm dưới `src/Apps/<code>/` (kể cả `contracts` = `src/Apps/<code>/_contracts` — hết giai đoạn chuyển tiếp ở P2, D-CORE-77 Q1; `_contracts` ở gốc kho bị từ chối) · `ports` toàn số nguyên 1–65535.
 * KHÔNG kiểm sự tồn tại trên đĩa (việc của `scripts/check-apps.mjs`).
 * @param {*} data Kết quả của {@link parseYaml}.
 * @param {string} dirName Tên thư mục chứa `app.yaml` (so với `code`).
 * @returns {string[]} Danh sách lỗi, rỗng nếu hợp lệ.
 */
export function validateAppData(data, dirName) {
  const errs = [];
  if (data === null || typeof data !== 'object' || Array.isArray(data)) return ['nội dung gốc phải là một bảng "khoá: giá trị"'];
  for (const k of Object.keys(data)) if (!TOP_KEYS.includes(k)) errs.push(`khoá lạ "${k}" (khoá hợp lệ: ${TOP_KEYS.join(', ')})`);
  /** Hàm làm gì: kiểm trường chuỗi cấp trên `k` (khuôn `re` nếu có; `required` ⇒ thiếu là lỗi). Tác dụng phụ: đẩy lỗi vào mảng `errs` của hàm bao ngoài. */
  const str = (k, re, required) => {
    const v = data[k];
    if (v === null || v === undefined) { if (required) errs.push(`thiếu "${k}" (bắt buộc)`); return; }
    if (typeof v !== 'string' || v.trim() === '') errs.push(`"${k}" phải là chuỗi không rỗng`);
    else if (re && !re.test(v)) errs.push(`"${k}" = "${v}" sai khuôn ${re}`);
  };
  str('code', /^[A-Za-z][A-Za-z0-9]*$/, true);
  if (typeof data.code === 'string' && data.code !== dirName) errs.push(`code "${data.code}" không khớp tên thư mục "${dirName}"`);
  str('sso_code', /^[a-z0-9][a-z0-9-]*$/, false);
  if (data.sso_app_id !== null && data.sso_app_id !== undefined && !(Number.isInteger(data.sso_app_id) && data.sso_app_id > 0)) errs.push('"sso_app_id" phải là số nguyên dương hoặc để trống');
  if (data.permission_registry !== null && data.permission_registry !== undefined && !PERMISSION_REGISTRIES.includes(data.permission_registry)) errs.push(`"permission_registry" = ${JSON.stringify(data.permission_registry)}: chỉ nhận ${PERMISSION_REGISTRIES.join(' | ')} (bỏ trống = local)`);
  str('display_name', null, false);
  str('module_prefix', /^[A-Za-z][A-Za-z0-9.]*\.$/, true);
  str('host_project', /^[A-Za-z][A-Za-z0-9.]*$/, true);
  str('config_key', /^[A-Za-z][A-Za-z0-9]*$/, false);

  const p = data.paths;
  if (p === null || p === undefined || typeof p !== 'object' || Array.isArray(p)) errs.push('thiếu "paths" (bảng đường dẫn)');
  else {
    for (const k of Object.keys(p)) if (![...REQUIRED_PATH_KEYS, ...OPTIONAL_PATH_KEYS].includes(k)) errs.push(`paths.${k}: khoá lạ`);
    const under = `src/Apps/${typeof data.code === 'string' ? data.code : dirName}/`;
    for (const k of [...REQUIRED_PATH_KEYS, ...OPTIONAL_PATH_KEYS]) {
      const v = p[k];
      if (v === null || v === undefined) { if (REQUIRED_PATH_KEYS.includes(k)) errs.push(`paths.${k}: thiếu (bắt buộc)`); continue; }
      const why = badRelPath(v);
      if (why) { errs.push(`paths.${k} = ${JSON.stringify(v)}: ${why}`); continue; }
      if (!(v + '/').startsWith(under)) errs.push(`paths.${k} = "${v}": phải nằm dưới ${under}`);
    }
  }

  const ports = data.ports;
  if (ports !== null && ports !== undefined) {
    if (typeof ports !== 'object' || Array.isArray(ports)) errs.push('"ports" phải là bảng các nhóm cổng');
    else for (const [g, grp] of Object.entries(ports)) {
      if (grp === null || typeof grp !== 'object' || Array.isArray(grp)) { errs.push(`ports.${g}: phải là bảng tên cổng ⇒ số`); continue; }
      for (const [n, v] of Object.entries(grp)) if (!(Number.isInteger(v) && v >= 1 && v <= 65535)) errs.push(`ports.${g}.${n} = ${JSON.stringify(v)}: phải là số nguyên 1–65535 (không biết thì bỏ khoá, đừng đoán)`);
    }
  }
  return errs;
}

/**
 * Hàm làm gì: đổi dữ liệu hồ sơ đã kiểm hợp lệ thành đối tượng phần mềm chuẩn dùng trong toàn bộ công cụ.
 * @param {string} repoRoot Gốc kho (tuyệt đối).
 * @param {string} dirName Tên thư mục phần mềm dưới `src/Apps`.
 * @param {object} data Dữ liệu hồ sơ ĐÃ qua {@link validateAppData}.
 * @returns {object} `{ code, dirName, repoRoot, relDir, file, ssoCode, ssoAppId, permissionRegistry, displayName, modulePrefix, hostProject, configKey, paths, ports, raw }`; `permissionRegistry` = `local` | `sso` (bỏ trống ⇒ `local`);
 *   `paths` là bảng đường dẫn TƯƠNG ĐỐI gốc kho (thiếu ⇒ null), `ports` là bảng nhóm ⇒ bảng tên cổng (hoặc null), `raw` là dữ liệu YAML nguyên bản.
 */
function buildApp(repoRoot, dirName, data) {
  const p = data.paths ?? {};
  return {
    code: data.code, dirName, repoRoot: path.resolve(repoRoot), relDir: `${ZONE_APPS}/${dirName}`, file: P(repoRoot, ZONE_APPS, dirName, APP_FILE),
    ssoCode: data.sso_code ?? null, ssoAppId: data.sso_app_id ?? null, permissionRegistry: data.permission_registry ?? 'local', displayName: data.display_name ?? null,
    modulePrefix: data.module_prefix, hostProject: data.host_project, configKey: data.config_key ?? null,
    paths: Object.fromEntries([...REQUIRED_PATH_KEYS, ...OPTIONAL_PATH_KEYS].map((k) => [k, p[k] ?? null])),
    ports: data.ports ?? null, raw: data,
  };
}

/**
 * Hàm làm gì: đọc và kiểm MỘT hồ sơ `src/Apps/<dirName>/app.yaml`.
 * @param {string} repoRoot Gốc kho (tuyệt đối hoặc tương đối).
 * @param {string} dirName Tên thư mục phần mềm.
 * @returns {object} Đối tượng phần mềm chuẩn (xem {@link buildApp}).
 * @throws {AppsError} Không có tệp, YAML sai cú pháp (kèm số dòng), hoặc dữ liệu không hợp lệ (kèm danh sách lỗi trong `problems`).
 */
export function readApp(repoRoot, dirName) {
  const file = P(repoRoot, ZONE_APPS, dirName, APP_FILE);
  if (!isFile(file)) throw new AppsError(`${ZONE_APPS}/${dirName}/${APP_FILE}: không có tệp`);
  let data;
  try { data = parseYaml(fs.readFileSync(file, 'utf8'), `${ZONE_APPS}/${dirName}/${APP_FILE}`); }
  catch (e) { if (e instanceof YamlError) throw new AppsError(e.message, [e.message]); throw e; }
  const errs = validateAppData(data, dirName);
  if (errs.length) throw new AppsError(`${ZONE_APPS}/${dirName}/${APP_FILE}: ${errs.length} lỗi — ${errs[0]}`, errs.map((e) => `${ZONE_APPS}/${dirName}/${APP_FILE}: ${e}`));
  return buildApp(repoRoot, dirName, data);
}

/**
 * Hàm làm gì: quét `src/Apps/*` — đọc từng `app.yaml`, GOM lỗi thay vì ném; ghi lại thư mục con thiếu `app.yaml`.
 * @param {string} repoRoot Gốc kho.
 * @returns {{apps: object[], errors: {dirName:string, message:string, problems:string[]}[], strays: {dirName:string, relDir:string, empty:boolean}[]}}
 *   `apps` = phần mềm đọc được (sắp theo tên thư mục); `errors` = hồ sơ có mà hỏng; `strays` = thư mục KHÔNG có app.yaml (`empty` = không chứa gì).
 * @throws {AppsError} Không có thư mục `src/Apps` (để công cụ đỏ rõ ràng thay vì "0 phần mềm").
 */
export function scanApps(repoRoot) {
  // Gốc DỰ ÁN (bố cục tách): phần mềm KHÔNG nằm chung một thư mục `src/Apps` mà ở repo riêng — danh sách lấy từ workspace.json; không có thư mục "thừa" (strays).
  const split = isKnownRoot(repoRoot);
  const appsDir = path.join(repoRoot, ZONE_APPS);
  if (split && projectApps().length === 0) throw new AppsError(`Không thấy phần mềm nào dưới gốc dự án "${repoRoot}" — workspace.json không liệt kê repo phần mềm nào còn tồn tại (kiểm "apps" và "repos", và các repo đã clone chưa)`);
  if (!split && !isDir(appsDir)) throw new AppsError(`Không thấy thư mục ${ZONE_APPS} dưới gốc kho "${repoRoot}" — sai gốc kho hoặc bố cục chưa phải ba vùng Core/Services/Apps`);
  const apps = [], errors = [], strays = [];
  const names = split ? projectApps().map((a) => a.code).sort() : fs.readdirSync(appsDir, { withFileTypes: true }).filter((e) => e.isDirectory()).map((e) => e.name).sort();
  for (const dirName of names) {
    if (!isFile(P(repoRoot, ZONE_APPS, dirName, APP_FILE))) {
      strays.push({ dirName, relDir: `${ZONE_APPS}/${dirName}`, empty: isDir(P(repoRoot, ZONE_APPS, dirName)) && fs.readdirSync(P(repoRoot, ZONE_APPS, dirName)).length === 0 });
      continue;
    }
    try { apps.push(readApp(repoRoot, dirName)); }
    catch (e) { if (e instanceof AppsError) errors.push({ dirName, message: e.message, problems: e.problems }); else throw e; }
  }
  return { apps, errors, strays };
}

/**
 * Hàm làm gì: liệt kê các phần mềm của kho = mọi `src/Apps/*\/app.yaml` hợp lệ.
 * @param {string} repoRoot Gốc kho.
 * @returns {object[]} Danh sách đối tượng phần mềm (sắp theo tên thư mục); có thể rỗng nếu `src/Apps` chưa có phần mềm nào.
 * @throws {AppsError} Không có `src/Apps`, hoặc BẤT KỲ `app.yaml` hỏng (không bỏ qua lặng lẽ — công cụ phải biết hồ sơ sai).
 */
export function listApps(repoRoot) {
  const { apps, errors } = scanApps(repoRoot);
  if (errors.length) throw new AppsError(`${errors.length} hồ sơ ứng dụng hỏng — ${errors[0].message}`, errors.flatMap((e) => e.problems));
  return apps;
}

/**
 * Hàm làm gì: đổi các đường dẫn tương đối của một phần mềm thành đường dẫn TUYỆT ĐỐI.
 * @param {object} app Đối tượng phần mềm từ {@link listApps} / {@link readApp}.
 * @returns {{root:string, be:string, fe:string, api:string, modules:string, tests:string, contracts:string, session:string|null}}
 *   `root` là thư mục `src/Apps/<Mã>`; `session` là null khi hồ sơ chưa khai. Hàm KHÔNG kiểm tồn tại trên đĩa.
 */
export function appPaths(app) {
  const abs = (rel) => (rel ? path.resolve(P(app.repoRoot, rel)) : null);   // P: gốc dự án ⇒ dịch logic → repo phần mềm / lõi; gốc lạ ⇒ nối thẳng như cũ
  return {
    root: abs(app.relDir), be: abs(app.paths.be), fe: abs(app.paths.fe), api: abs(app.paths.api),
    modules: abs(app.paths.modules), tests: abs(app.paths.tests), contracts: abs(app.paths.contracts), session: abs(app.paths.session),
  };
}

/**
 * Hàm làm gì: các thư mục script SQL mà công cụ phải ĐỌC khi tìm script của MỘT phần mềm — MỘT nguồn cho probe r84 · test parity · route-parity · sqlrun (D-CORE-173).
 * Luật đặt tệp: script phục vụ phần mềm nào thì nằm ở `src/Apps/<Mã>/scripts/sql` của phần mềm đó, KỂ CẢ khi script chạy trên CSDL SSO; `src/Services/Sso/scripts/sql` chỉ giữ script của chính SSO.
 * Công cụ KHÔNG đoán «chạy ở đâu» theo thư mục — theo tiêu đề tệp, dấu `_sso-` trong tên và `DECLARE @AppCode` trong nội dung. Vì còn tệp cũ chưa chuyển, hàm trả CẢ thư mục SSO (đứng sau); người gọi lọc theo nội dung.
 * @param {object} app Đối tượng phần mềm từ {@link listApps} / {@link readApp}.
 * @returns {{own:string, sso:string, all:string[]}} `own` = thư mục script của phần mềm; `sso` = thư mục script của SSO; `all` = [own, sso] (tuyệt đối, theo thứ tự đọc). Không kiểm tồn tại, không đọc đĩa.
 */
export function sqlScriptDirs(app) {
  const own = path.resolve(P(app.repoRoot, app.relDir, 'scripts', 'sql'));
  const sso = path.resolve(P(app.repoRoot, SSO_SQL_DIR));
  return { own, sso, all: [own, sso] };
}

/**
 * Hàm làm gì: tóm tắt một phần mềm cho danh sách ứng viên.
 * @param {object} app Đối tượng phần mềm.
 * @returns {{code:string, relDir:string, displayName:string|null}} Dữ liệu đủ để lệnh HỎI người dùng.
 */
const candidate = (app) => ({ code: app.code, relDir: app.relDir, displayName: app.displayName });

/**
 * Hàm làm gì: phần mềm `app` có chứa module tên `name` không — có thư mục `<contracts>/modules/<name>` HOẶC `<modules>/<module_prefix><name>`.
 * @param {object} app Đối tượng phần mềm.
 * @param {string} name Tên module (đã kiểm khuôn tên an toàn).
 * @returns {boolean} true nếu một trong hai thư mục tồn tại trên đĩa.
 */
function hasModule(app, name) {
  const a = appPaths(app);
  return isDir(path.join(a.contracts, 'modules', name)) || isDir(path.join(a.modules, app.modulePrefix + name));
}

/**
 * Hàm làm gì: phân giải "đang làm việc với phần mềm nào" theo ĐÚNG thứ tự N6 (D-CORE-77), dừng ở bước đầu tiên ra MỘT kết quả:
 *   (1) `app` tường minh (mã không phân biệt hoa thường; chấp nhận đuôi `:`) →
 *   (2) đường dẫn trong `paths` nằm dưới `src/Apps/<Mã>/` (đường dẫn ngoài `src/Apps`, vd `src/Core/…`, bị bỏ qua) →
 *   (3) `moduleName` tra các phần mềm (module chỉ có ở MỘT phần mềm ⇒ chọn; ở nhiều ⇒ `ambiguous`; không ở đâu ⇒ xuống bước 4) →
 *   (4) kho chỉ có MỘT phần mềm ⇒ chọn, `via: 'only-one'` →
 *   (5) còn lại ⇒ `none` (không có phần mềm nào) hoặc `ambiguous` (nhiều phần mềm) kèm `candidates` để lệnh HỎI — KHÔNG đoán, KHÔNG in lời nhắc.
 * @param {{app?:string, paths?:string[], moduleName?:string}} args Đối số của lệnh; mọi trường tuỳ chọn.
 * @param {string} repoRoot Gốc kho (tuyệt đối hoặc tương đối).
 * @returns {{status:'ok'|'ambiguous'|'none', app:object|null, via:'explicit'|'path'|'module'|'only-one'|'ask', candidates:{code:string,relDir:string,displayName:string|null}[], reason:string}}
 *   `app` chỉ có khi `status = 'ok'`; `candidates` = các phần mềm đang cân nhắc ở bước quyết định; `reason` là một câu giải thích (tiếng Việt).
 * @throws {AppsError} `src/Apps` không tồn tại hoặc một `app.yaml` hỏng (xem {@link listApps}).
 */
export function resolveApp(args, repoRoot) {
  const apps = listApps(repoRoot);
  const all = apps.map(candidate);
  /** Hàm làm gì: tìm phần mềm theo tên THƯ MỤC (không phân biệt hoa thường). Trả về đối tượng phần mềm hoặc undefined. */
  const byDir = (dirName) => apps.find((a) => a.dirName.toLowerCase() === String(dirName).toLowerCase());
  const { app: explicit, paths = [], moduleName } = args ?? {};

  if (explicit !== undefined && explicit !== null && String(explicit).trim() !== '') {
    const code = String(explicit).trim().replace(/:$/, '');
    const hit = apps.find((a) => a.code.toLowerCase() === code.toLowerCase());
    if (hit) return { status: 'ok', app: hit, via: 'explicit', candidates: [candidate(hit)], reason: `--app ${code} khớp ${hit.relDir}` };
    return { status: 'none', app: null, via: 'explicit', candidates: all, reason: `--app ${code}: không có phần mềm mã "${code}" (có: ${apps.map((a) => a.code).join(', ') || 'không có'})` };
  }

  const seen = new Map();
  for (const p of paths) {
    const rel = relToRepo(repoRoot, p);
    if (rel === null) continue;
    const seg = rel.split('/');
    if (seg[0] === 'src' && seg[1] === 'Apps' && seg[2]) seen.set(seg[2].toLowerCase(), seg[2]);
  }
  if (seen.size === 1) {
    const [dirName] = seen.values();
    const hit = byDir(dirName);
    if (hit) return { status: 'ok', app: hit, via: 'path', candidates: [candidate(hit)], reason: `đường dẫn nằm dưới ${hit.relDir}/` };
    return { status: 'none', app: null, via: 'path', candidates: all, reason: `đường dẫn nằm dưới ${ZONE_APPS}/${dirName}/ nhưng thư mục đó chưa có ${APP_FILE} hợp lệ` };
  }
  if (seen.size > 1) {
    const hits = [...seen.values()].map(byDir).filter(Boolean);
    return { status: 'ambiguous', app: null, via: 'path', candidates: hits.map(candidate), reason: `đường dẫn thuộc nhiều phần mềm: ${[...seen.values()].join(', ')}` };
  }

  if (moduleName !== undefined && moduleName !== null && String(moduleName).trim() !== '') {
    const name = String(moduleName).trim();
    if (!/^[A-Za-z0-9_.-]+$/.test(name) || name === '.' || name === '..') return { status: 'none', app: null, via: 'module', candidates: all, reason: `tên module "${name}" không hợp lệ` };
    const hits = apps.filter((a) => hasModule(a, name));
    if (hits.length === 1) return { status: 'ok', app: hits[0], via: 'module', candidates: [candidate(hits[0])], reason: `module ${name} chỉ có ở ${hits[0].relDir}` };
    if (hits.length > 1) return { status: 'ambiguous', app: null, via: 'module', candidates: hits.map(candidate), reason: `module ${name} có ở ${hits.length} phần mềm: ${hits.map((a) => a.code).join(', ')}` };
  }

  if (apps.length === 1) return { status: 'ok', app: apps[0], via: 'only-one', candidates: [candidate(apps[0])], reason: `mặc định vì kho chỉ có một phần mềm (${apps[0].relDir})` };
  if (apps.length === 0) return { status: 'none', app: null, via: 'ask', candidates: [], reason: `kho chưa có phần mềm nào (không có ${ZONE_APPS}/*/${APP_FILE})` };
  return { status: 'ambiguous', app: null, via: 'ask', candidates: all, reason: `kho có ${apps.length} phần mềm và đối số không chỉ rõ phần mềm nào — hỏi người dùng` };
}

/**
 * Hàm làm gì: viết kết quả {@link resolveApp} thành MỘT dòng ngắn cho đầu phiên / nhật ký (không phải lời nhắc hỏi).
 * @param {{status:string, app:object|null, via:string, candidates:object[], reason:string}} res Kết quả của {@link resolveApp}.
 * @returns {string} `app=<Mã> · root=src/Apps/<Mã> · via=only-one` khi ok; ngược lại `app=? · status=ambiguous · ứng viên: AAA, BBB · lý do`.
 */
export function describeResolution(res) {
  if (res.status === 'ok') return `app=${res.app.code} · root=${res.app.relDir} · via=${res.via}`;
  return `app=? · status=${res.status} · ứng viên: ${res.candidates.map((c) => c.code).join(', ') || 'không có'} · ${res.reason}`;
}

/**
 * Mã phần mềm MẶC ĐỊNH của các công cụ KHÔNG nhận được thông tin nào về phần mềm đang làm (không `--app`, không đường dẫn, không tên module) khi kho có NHIỀU phần mềm.
 * Bản dùng chung cho nhiều dự án KHÔNG có mặc định: `null` — kho nhiều phần mềm mà lệnh không chỉ rõ ⇒ `ambiguous` để lệnh HỎI người dùng (không chọn ngầm một tên cứng).
 * Giữ hằng này (và {@link resolveAppOrDefault}) vì công cụ kiểm của lõi (`_bmad/tests`) khai tên xuất của thư viện này theo bảng cố định.
 */
export const DEFAULT_APP_CODE = null;

/**
 * Hàm làm gì: tên cũ của {@link resolveApp} được giữ cho tương thích — vì {@link DEFAULT_APP_CODE} là `null` nên KHÔNG bao giờ rơi về phần mềm mặc định: kết quả LUÔN bằng `resolveApp(args, repoRoot)`
 * (kho một phần mềm ⇒ chọn nó; nhiều phần mềm mà không chỉ rõ ⇒ `ambiguous`; không có phần mềm ⇒ `none`).
 * @param {{app?:string, paths?:string[], moduleName?:string}} args Đối số của lệnh; mọi trường tuỳ chọn.
 * @param {string} repoRoot Gốc kho.
 * @returns {{status:'ok'|'ambiguous'|'none', app:object|null, via:string, candidates:object[], reason:string}} Cùng dạng với resolveApp.
 * @throws {AppsError} Cùng điều kiện với resolveApp.
 */
export function resolveAppOrDefault(args, repoRoot) {
  return resolveApp(args, repoRoot);
}

/**
 * Hàm làm gì: liệt kê thư mục hồ sơ hợp đồng (`paths.contracts`) CÓ TỒN TẠI của mọi phần mềm — nguồn để công cụ duyệt "mọi module / mọi hồ sơ" theo TỪNG phần mềm
 * (mỗi phần mềm một `_contracts` riêng: `src/Apps/<Mã>/_contracts`, D-CORE-77 Q1).
 * @param {string} repoRoot Gốc kho.
 * @returns {{app:object, abs:string, rel:string}[]} `abs` đường dẫn tuyệt đối, `rel` tương đối gốc kho (dấu `/`); sắp theo tên thư mục phần mềm; phần mềm chưa có thư mục hợp đồng bị bỏ.
 * @throws {AppsError} Không có `src/Apps` hoặc một `app.yaml` hỏng (xem {@link listApps}).
 */
export function contractsRoots(repoRoot) {
  return listApps(repoRoot).map((app) => ({ app, abs: appPaths(app).contracts, rel: app.paths.contracts })).filter((c) => isDir(c.abs));
}

/**
 * Hàm làm gì: cho biết một đường dẫn (tuyệt đối hoặc tương đối gốc kho) nằm dưới thư mục `src/Apps/<Mã>/` của phần mềm nào.
 * @param {string} repoRoot Gốc kho.
 * @param {string} p Đường dẫn cần tra.
 * @returns {object|null} Đối tượng phần mềm, hoặc null nếu đường dẫn ngoài `src/Apps/<Mã>/` hoặc thư mục đó chưa có `app.yaml` hợp lệ.
 * @throws {AppsError} Không có `src/Apps` hoặc một `app.yaml` hỏng.
 */
export function appOfPath(repoRoot, p) {
  const rel = relToRepo(repoRoot, p);
  if (rel === null) return null;
  const seg = rel.split('/');
  if (seg[0] !== 'src' || seg[1] !== 'Apps' || !seg[2]) return null;
  return listApps(repoRoot).find((a) => a.dirName.toLowerCase() === seg[2].toLowerCase()) ?? null;
}

/**
 * Hàm làm gì: phân loại một đường dẫn tương đối gốc kho theo ba vùng mã nguồn.
 * @param {string} rel Đường dẫn tương đối gốc kho (dấu `/` hoặc `\`).
 * @returns {{zone:'core'|'services'|'apps', name:string|null, side:'BE'|'FE'|null}|null}
 *   `core` (mọi thứ dưới `src/Core`, side `BE`) · `services` / `apps` (name = tên dịch vụ / mã phần mềm; side = `BE` hoặc `FE` theo thư mục con trực tiếp, null nếu khác) · null nếu không dưới ba vùng.
 */
export function classifySource(rel) {
  const s = String(rel).replace(/\\/g, '/').replace(/^\.\//, '').split('/');
  if (s[0] !== 'src') return null;
  if (s[1] === 'Core') return { zone: 'core', name: null, side: 'BE' };
  if (s[1] === 'Services' || s[1] === 'Apps') {
    if (!s[2]) return null;
    return { zone: s[1] === 'Services' ? 'services' : 'apps', name: s[2], side: s[3] === 'BE' || s[3] === 'FE' ? s[3] : null };
  }
  return null;
}

/**
 * Hàm làm gì: liệt kê thư mục con `BE` hoặc `FE` của từng dịch vụ dưới `src/Services` đang tồn tại.
 * @param {string} repoRoot Gốc kho.
 * @param {'BE'|'FE'} side Phía cần liệt kê.
 * @returns {string[]} Đường dẫn tuyệt đối (rỗng nếu chưa có `src/Services`).
 */
function serviceSideDirs(repoRoot, side) {
  const dir = P(repoRoot, ZONE_SERVICES);
  if (!isDir(dir)) return [];
  return fs.readdirSync(dir, { withFileTypes: true }).filter((e) => e.isDirectory()).map((e) => path.join(dir, e.name, side)).filter(isDir).sort();
}

/**
 * Hàm làm gì: danh sách GỐC QUÉT mã BE của cả kho — lõi (`src/Core`), `BE` của từng dịch vụ, `BE` của từng phần mềm (theo `app.yaml`). Chỉ giữ thư mục tồn tại.
 * @param {string} repoRoot Gốc kho.
 * @returns {string[]} Đường dẫn tuyệt đối (thứ tự: lõi, dịch vụ, phần mềm). Có thể rỗng — nơi gọi PHẢI kiểm bằng {@link requireRoots}.
 * @throws {AppsError} `src/Apps` không tồn tại hoặc `app.yaml` hỏng.
 */
export function beScanRoots(repoRoot) {
  const roots = [P(repoRoot, ZONE_CORE), ...serviceSideDirs(repoRoot, 'BE'), ...listApps(repoRoot).map((a) => appPaths(a).be)];
  return roots.filter(isDir);
}

/**
 * Hàm làm gì: danh sách GỐC QUÉT giao diện (Angular) của cả kho — `FE` của từng phần mềm (theo `app.yaml`) rồi `FE` của từng dịch vụ có giao diện. Chỉ giữ thư mục tồn tại.
 * @param {string} repoRoot Gốc kho.
 * @returns {string[]} Đường dẫn tuyệt đối. Có thể rỗng — nơi gọi PHẢI kiểm bằng {@link requireRoots}.
 * @throws {AppsError} `src/Apps` không tồn tại hoặc `app.yaml` hỏng.
 */
export function feScanRoots(repoRoot) {
  return [...listApps(repoRoot).map((a) => appPaths(a).fe), ...serviceSideDirs(repoRoot, 'FE')].filter(isDir);
}

/**
 * Hàm làm gì: liệt kê thư mục NGUỒN FE DÙNG CHUNG (kit) mà các giao diện trong kho cùng dùng = `src/Core/FE` (có `platform/`, `modules/<m>/`, `tools/`) cộng mọi `kit` khai trong `fe-app.json`
 * của FE phần mềm / dịch vụ (đường dẫn `kit` tính từ thư mục FE). Chỉ giữ thư mục tồn tại, không trùng.
 * Vì sao cần: từ khi `platform/` + module dùng chung (audit-log · operations · notification) dời khỏi từng FE sang `src/Core/FE`, quét theo {@link feScanRoots} một mình bỏ sót chúng —
 * tài liệu nhắc `modules/audit-log/…` bị báo "thiếu" giả, linter bố cục không quét module chung. Ánh xạ đường dẫn LOGIC của một FE → nguồn chung: `src/app/platform/**` → `<kit>/platform/**`,
 * `src/app/modules/<m>/**` (m chung) → `<kit>/modules/<m>/**` (xem `src/Core/FE/tools/fe-overlay-fs.mjs`).
 * @param {string} repoRoot Gốc kho.
 * @returns {string[]} Đường dẫn tuyệt đối của thư mục nguồn chung (thứ tự: mặc định `src/Core/FE`, rồi theo từng FE). Có thể rỗng (kho chưa có nguồn chung) — nơi cần bắt buộc PHẢI {@link requireRoots}.
 * @throws {AppsError} `src/Apps` không tồn tại, `app.yaml` hỏng, hoặc một `fe-app.json` không phải JSON hợp lệ (không bỏ qua lặng lẽ — kit sai thì công cụ phải đỏ).
 */
export function feSharedRoots(repoRoot) {
  const seen = new Set();
  const out = [];
  /** Hàm làm gì: thêm `dir` vào kết quả nếu là thư mục tồn tại và chưa có. Tác dụng phụ: đẩy vào mảng `out` / tập `seen` của hàm bao ngoài. */
  const add = (dir) => { const abs = path.resolve(dir); if (isDir(abs) && !seen.has(abs)) { seen.add(abs); out.push(abs); } };
  add(P(repoRoot, ZONE_CORE_FE));
  for (const fe of feScanRoots(repoRoot)) {
    const f = path.join(fe, 'fe-app.json');
    if (!isFile(f)) continue;
    let cfg;
    try { cfg = JSON.parse(fs.readFileSync(f, 'utf8')); }
    catch (e) { throw new AppsError(`${L(repoRoot, f) ?? f}: không phải JSON hợp lệ — ${e.message}`); }
    if (cfg && typeof cfg.kit === 'string' && cfg.kit.trim() !== '') add(path.resolve(fe, cfg.kit));
  }
  return out;
}

/**
 * Hàm làm gì: liệt kê các thư mục chứa dự án module — lõi `src/Core/Modules` (tiền tố `PTCore.Modules.`) và `modules` của từng phần mềm (tiền tố `module_prefix`).
 * @param {string} repoRoot Gốc kho.
 * @returns {{kind:'core'|'app', app:object|null, dir:string, prefix:string}[]} Chỉ gồm thư mục tồn tại; `prefix` đã có dấu chấm cuối (vd `App.Modules.`).
 * @throws {AppsError} `src/Apps` không tồn tại hoặc `app.yaml` hỏng.
 */
export function moduleRoots(repoRoot) {
  const out = [];
  const core = P(repoRoot, ZONE_CORE, 'Modules');
  if (isDir(core)) out.push({ kind: 'core', app: null, dir: core, prefix: 'PTCore.Modules.' });
  for (const a of listApps(repoRoot)) { const dir = appPaths(a).modules; if (isDir(dir)) out.push({ kind: 'app', app: a, dir, prefix: a.modulePrefix }); }
  return out;
}

/**
 * Hàm làm gì: tìm thư mục dự án module của một phần mềm ứng với TÊN module `moduleName` trong spec (`module.yaml → moduleName`, `root.sharedOwner`…).
 * Hai cách khớp, theo thứ tự: (1) `exact` — `<paths.modules>/<module_prefix><moduleName>` (vd `App.Modules.Test`); (2) `config_key` — khi `moduleName` trùng `config_key` của hồ sơ
 * (không phân biệt hoa thường) và khác `code`, coi là BÍ DANH của dự án chính `<module_prefix><code>` (vd phần mềm mã `ZED` có `config_key: Main` ⇒ `Main` → `App.Modules.ZED`).
 * Cách (2) là cầu nối cho spec khai `moduleName: <config_key>` (vd `Main`) trong khi dự án module thật mang tên theo mã phần mềm: nếu sau này thống nhất một cách đặt tên thì sửa hoặc bỏ ở đây — MỘT chỗ.
 * @param {object} app Đối tượng phần mềm.
 * @param {string} moduleName Tên module theo spec.
 * @returns {{dir:string, via:'exact'|'config_key'}[]} Các thư mục TỒN TẠI trên đĩa (có thể rỗng; không trùng).
 */
export function moduleProjectDirs(app, moduleName) {
  const { modules } = appPaths(app);
  const out = [];
  const exact = path.join(modules, app.modulePrefix + moduleName);
  if (isDir(exact)) out.push({ dir: exact, via: 'exact' });
  if (app.configKey && moduleName.toLowerCase() === app.configKey.toLowerCase() && moduleName.toLowerCase() !== app.code.toLowerCase()) {
    const alias = path.join(modules, app.modulePrefix + app.code);
    if (isDir(alias) && !out.some((o) => o.dir === alias)) out.push({ dir: alias, via: 'config_key' });
  }
  return out;
}

/** Tên các BIẾN của luật `_bmad` mà {@link appVars} trả về (theo thứ tự in ra); `--print <khoá>` chấp nhận cả tên này lẫn tên không có `app_`. */
export const VAR_KEYS = ['app_code', 'app_root', 'app_be', 'app_fe', 'app_api', 'app_modules', 'app_module', 'app_tests', 'app_contracts', 'app_session', 'host_project', 'module_project', 'tests_project', 'AppPascal', 'config_key', 'sso_code', 'permission_registry', 'be_roots', ...Object.keys(CORE_VARS)];

/**
 * Hàm làm gì: tính BẢNG BIẾN `{app_*}` của một phần mềm — nguồn DUY NHẤT để đổi biến trong luật / skill / prompt của `_bmad` ra giá trị thật (đợt đa phần mềm, D-CORE-77 Q4 + D1).
 * Biến suy ra (không có sẵn trong app.yaml): `app_module` = `<paths.modules>/<module_prefix><code>` (dự án module CHÍNH của phần mềm, vd `src/Apps/ZED/BE/Modules/App.Modules.ZED`);
 * `module_project` = `<module_prefix><code>` (vd `App.Modules.ZED`); `tests_project` = tên thư mục cuối của `paths.tests`; `AppPascal` = `code` viết Pascal (ZED → `Zed`, YAK → `Yak`;
 * dùng trong tên kiểu `{AppPascal}Module`, `Add{AppPascal}Module`, `I{AppPascal}DbContext`, `{AppPascal}Settings`…).
 * Cuối bảng là biến CỦA LÕI ({@link CORE_VARS}: `core_session`, `core_prompts`) — cùng một giá trị cho mọi phần mềm.
 * @param {object} app Đối tượng phần mềm từ {@link listApps} / {@link readApp}.
 * @returns {Record<string, string|null>} Bảng `tên biến ⇒ giá trị` (đường dẫn tương đối gốc kho, dấu `/`); `app_session` là null khi hồ sơ chưa khai.
 */
export function appVars(app) {
  const pascal = app.code.charAt(0).toUpperCase() + app.code.slice(1).toLowerCase();
  return {
    app_code: app.code, app_root: app.relDir, app_be: app.paths.be, app_fe: app.paths.fe, app_api: app.paths.api, app_modules: app.paths.modules,
    app_module: `${app.paths.modules}/${app.modulePrefix}${app.code}`, app_tests: app.paths.tests, app_contracts: app.paths.contracts, app_session: app.paths.session,
    host_project: app.hostProject, module_project: `${app.modulePrefix}${app.code}`, tests_project: app.paths.tests.split('/').pop(), AppPascal: pascal, config_key: app.configKey, sso_code: app.ssoCode, permission_registry: app.permissionRegistry, be_roots: `${ZONE_CORE} ${ZONE_SERVICES} ${app.paths.be}`,
    ...CORE_VARS,
  };
}

/**
 * Hàm làm gì: chặn "xanh giả do quét 0 thư mục" — ném lỗi rõ ràng khi danh sách gốc quét rỗng.
 * @param {string[]} roots Danh sách gốc quét (kết quả của {@link beScanRoots} / {@link feScanRoots} / {@link moduleRoots}…).
 * @param {string} what Mô tả việc đang quét, dùng trong thông báo (vd "mã BE").
 * @returns {string[]} Chính `roots` khi không rỗng.
 * @throws {AppsError} Khi `roots` rỗng.
 */
export function requireRoots(roots, what) {
  if (!roots || roots.length === 0) throw new AppsError(`Không có thư mục gốc nào để quét ${what} (kiểm src/Core, src/Services/*/BE|FE, src/Apps/*/${APP_FILE}) — dừng thay vì báo PASS với 0 tệp`);
  return roots;
}

// ───────────────────────────── CLI + tự kiểm ─────────────────────────────

/**
 * Hàm làm gì: tự kiểm thư viện trên các kho GIẢ dựng trong thư mục tạm (ca thuận + ca âm). Không đụng kho thật.
 * Tác dụng phụ: tạo và xoá thư mục tạm; in từng ca ra stdout.
 * @returns {number} Số ca sai (0 = đạt).
 */
export function selftest() {
  let bad = 0;
  /** Hàm làm gì: ghi kết quả MỘT ca (in OK / BAD kèm ghi chú khi sai). Tác dụng phụ: tăng `bad` khi sai, in ra stdout. */
  const ok = (name, cond, extra = '') => { if (!cond) bad++; console.log(`${cond ? 'OK  ' : 'BAD '}${name}${cond || !extra ? '' : '  ← ' + extra}`); };
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'apps-selftest-'));
  /** Hàm làm gì: dựng văn bản `app.yaml` hợp lệ cho phần mềm `code` (cổng dev 5000; paths dưới src/Apps/<code>). Trả về chuỗi YAML. */
  const yaml = (code, extra = {}) => {
    const d = { code, sso_code: code.toLowerCase(), sso_app_id: 6, display_name: `PM ${code}`, module_prefix: 'App.Modules.', host_project: `App.Api.${code}`, config_key: 'Main', ...extra };
    const base = `src/Apps/${code}`;
    return [
      `code: ${d.code}`, d.sso_code === null ? 'sso_code:' : `sso_code: ${d.sso_code}`, `sso_app_id: ${d.sso_app_id}`, `display_name: ${d.display_name}`,
      `module_prefix: ${d.module_prefix}`, `host_project: ${d.host_project}`, `config_key: ${d.config_key}`,
      'paths:', `  be: ${base}/BE`, `  fe: ${base}/FE`, `  api: ${base}/BE/${d.host_project}`, `  modules: ${base}/BE/Modules`, `  tests: ${base}/BE/Tests/T`, `  contracts: ${base}/_contracts`, '  session: null',
      'ports:', '  dev:', '    be_http: 5000', '',
    ].join('\n');
  };
  /** Hàm làm gì: ghi tệp `rel` (tạo thư mục cha) dưới `root`. Tác dụng phụ: ghi đĩa trong thư mục tạm. */
  const put = (root, rel, text = '') => { const p = path.join(root, rel); fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, text); };
  /** Hàm làm gì: dựng phần mềm giả `code` dưới `root` (app.yaml + thư mục BE/Modules + FE). `yamlText` thay hồ sơ mặc định để dựng ca hỏng. Tác dụng phụ: ghi đĩa trong thư mục tạm. */
  const mkApp = (root, code, yamlText) => { put(root, `src/Apps/${code}/${APP_FILE}`, yamlText ?? yaml(code)); fs.mkdirSync(path.join(root, `src/Apps/${code}/BE/Modules`), { recursive: true }); fs.mkdirSync(path.join(root, `src/Apps/${code}/FE`), { recursive: true }); };
  /** Hàm làm gì: chạy `fn`; trả AppsError nếu nó ném, null nếu không, chuỗi mô tả nếu ném lỗi loại khác. */
  const throwsApps = (fn) => { try { fn(); return null; } catch (e) { return e instanceof AppsError ? e : `lỗi khác: ${e}`; } };
  try {
    // ── kho 1 phần mềm ──
    const r1 = path.join(tmp, 'one'); mkApp(r1, 'ZED'); fs.mkdirSync(path.join(r1, 'src/Apps/ZED/_contracts/modules/PlaceX'), { recursive: true }); fs.mkdirSync(path.join(r1, 'src/Apps/ZED/BE/Modules/App.Modules.ZED'), { recursive: true });
    fs.mkdirSync(path.join(r1, 'src/Core/Modules'), { recursive: true }); fs.mkdirSync(path.join(r1, 'src/Services/Sso/BE'), { recursive: true }); fs.mkdirSync(path.join(r1, 'src/Services/Sso/FE'), { recursive: true });
    const a1 = listApps(r1);
    ok('thuan: listApps đọc 1 phần mềm, code=ZED, ssoAppId=6', a1.length === 1 && a1[0].code === 'ZED' && a1[0].ssoAppId === 6);
    const ap = appPaths(a1[0]);
    ok('thuan: appPaths tuyệt đối + session=null', path.isAbsolute(ap.be) && ap.be === path.join(path.resolve(r1), 'src', 'Apps', 'ZED', 'BE') && ap.session === null && ap.contracts === path.join(path.resolve(r1), 'src', 'Apps', 'ZED', '_contracts'));
    ok('thuan: sqlScriptDirs = [src/Apps/ZED/scripts/sql, src/Services/Sso/scripts/sql] tuyệt đối (own trước, sso sau)', (() => { const d = sqlScriptDirs(a1[0]); const rel = (p) => path.relative(r1, p).split(path.sep).join('/'); return d.all.length === 2 && d.all.every((p) => path.isAbsolute(p)) && rel(d.own) === 'src/Apps/ZED/scripts/sql' && rel(d.sso) === SSO_SQL_DIR && d.all[0] === d.own && d.all[1] === d.sso; })());
    ok('thuan: N6(1) --app tường minh (không phân biệt hoa thường, đuôi ":")', ['ZED', 'zed', 'ZED:'].every((x) => { const r = resolveApp({ app: x }, r1); return r.status === 'ok' && r.via === 'explicit' && r.app.code === 'ZED'; }));
    ok('thuan: N6(2) đường dẫn dưới src/Apps/ZED ⇒ via path', (() => { const r = resolveApp({ paths: ['src/Apps/ZED/FE/src/app/x.ts'] }, r1); return r.status === 'ok' && r.via === 'path'; })());
    ok('thuan: N6(2) đường dẫn tuyệt đối dưới src/Apps/ZED ⇒ via path', resolveApp({ paths: [path.join(r1, 'src/Apps/ZED/BE/x.cs')] }, r1).via === 'path');
    ok('thuan: N6(3) module trong _contracts ⇒ via module', (() => { const r = resolveApp({ moduleName: 'PlaceX' }, r1); return r.status === 'ok' && r.via === 'module'; })());
    ok('thuan: N6(3) module là dự án App.Modules.ZED ⇒ via module', resolveApp({ moduleName: 'ZED' }, r1).via === 'module');
    ok('thuan: N6(4) chỉ một phần mềm ⇒ only-one (kể cả module không ở đâu)', (() => { const r = resolveApp({ moduleName: 'KhongCo' }, r1); const r2 = resolveApp({}, r1); return r.via === 'only-one' && r2.via === 'only-one' && r.status === 'ok'; })());
    ok('thuan: N6 đường dẫn ngoài src/Apps (src/Core) bị bỏ qua ⇒ rơi xuống only-one', resolveApp({ paths: ['src/Core/Framework/x.cs', 'scripts/a.mjs'] }, r1).via === 'only-one');
    ok('thuan: describeResolution ok', describeResolution(resolveApp({ app: 'ZED' }, r1)).startsWith('app=ZED · root=src/Apps/ZED · via=explicit'));
    ok('thuan: beScanRoots = Core + Services/Sso/BE + Apps/ZED/BE', beScanRoots(r1).map((p) => path.relative(r1, p).split(path.sep).join('/')).join(',') === 'src/Core,src/Services/Sso/BE,src/Apps/ZED/BE');
    ok('thuan: feScanRoots = Apps/ZED/FE + Services/Sso/FE', feScanRoots(r1).map((p) => path.relative(r1, p).split(path.sep).join('/')).join(',') === 'src/Apps/ZED/FE,src/Services/Sso/FE');
    ok('thuan: moduleRoots = core + app', moduleRoots(r1).map((m) => m.kind + ':' + m.prefix).join(',') === 'core:PTCore.Modules.,app:App.Modules.');
    ok('thuan: moduleProjectDirs khớp đúng tên (exact) và bí danh config_key (Main → App.Modules.ZED)', (() => {
      const m = (n) => moduleProjectDirs(a1[0], n).map((x) => `${path.basename(x.dir)}:${x.via}`).join(',');
      return m('ZED') === 'App.Modules.ZED:exact' && m('Main') === 'App.Modules.ZED:config_key' && m('main') === 'App.Modules.ZED:config_key';
    })());
    ok('am: moduleProjectDirs tên không có ⇒ [] (không đoán)', moduleProjectDirs(a1[0], 'KhongCo').length === 0);
    ok('thuan: appVars — app_module / module_project / tests_project / AppPascal suy đúng từ hồ sơ', (() => { const v = appVars(a1[0]); return v.app_module === 'src/Apps/ZED/BE/Modules/App.Modules.ZED' && v.module_project === 'App.Modules.ZED' && v.tests_project === 'T' && v.AppPascal === 'Zed' && v.app_fe === 'src/Apps/ZED/FE' && v.app_session === null && v.host_project === 'App.Api.ZED' && VAR_KEYS.every((k) => k in v); })());
    ok('thuan: permission_registry — bỏ trống ⇒ local; appVars có sso_code + permission_registry', (() => { const v = appVars(a1[0]); return a1[0].permissionRegistry === 'local' && v.permission_registry === 'local' && v.sso_code === 'zed' && VAR_KEYS.includes('sso_code') && VAR_KEYS.includes('permission_registry'); })());
    ok('thuan: permission_registry: sso ⇒ hợp lệ, readApp trả "sso"', (() => { const rS = path.join(tmp, 'reg-sso'); mkApp(rS, 'ZED', yaml('ZED') + 'permission_registry: sso\n'); return readApp(rS, 'ZED').permissionRegistry === 'sso'; })());
    ok('am: permission_registry giá trị lạ ("central") ⇒ AppsError nêu khoá', (() => { const rB = path.join(tmp, 'reg-bad'); mkApp(rB, 'ZED', yaml('ZED') + 'permission_registry: central\n'); const e = throwsApps(() => readApp(rB, 'ZED')); return e instanceof AppsError && e.problems.some((p) => p.includes('permission_registry')); })());
    ok('thuan: classifySource', (() => { const c = (x) => JSON.stringify(classifySource(x)); return c('src/Core/Modules/X/a.cs') === '{"zone":"core","name":null,"side":"BE"}' && c('src\\Apps\\ZED\\FE\\a.ts') === '{"zone":"apps","name":"ZED","side":"FE"}' && c('src/Services/Sso/BE/a.cs') === '{"zone":"services","name":"Sso","side":"BE"}' && c('scripts/a.mjs') === 'null' && c('src/BE/x') === 'null'; })());

    // ── nguồn FE dùng chung (kit): src/Core/FE + `kit` của fe-app.json ──
    const rKit = path.join(tmp, 'kit'); mkApp(rKit, 'ZED'); fs.mkdirSync(path.join(rKit, 'src/Services/Sso/FE'), { recursive: true });
    const relK = (arr) => arr.map((p) => path.relative(rKit, p).split(path.sep).join('/')).join(',');
    ok('am: feSharedRoots kho CHƯA có src/Core/FE và không có fe-app.json ⇒ [] (nơi gọi tự requireRoots, không đoán)', feSharedRoots(rKit).length === 0);
    fs.mkdirSync(path.join(rKit, 'src/Core/FE/modules/audit-log'), { recursive: true }); fs.mkdirSync(path.join(rKit, 'src/Core/FE/platform'), { recursive: true });
    ok('thuan: feSharedRoots có src/Core/FE ⇒ [src/Core/FE] (tuyệt đối)', relK(feSharedRoots(rKit)) === 'src/Core/FE' && path.isAbsolute(feSharedRoots(rKit)[0]));
    put(rKit, 'src/Apps/ZED/FE/fe-app.json', JSON.stringify({ app: 'ZED', kit: '../../../Core/FE', sharedModules: ['audit-log'] }));
    put(rKit, 'src/Services/Sso/FE/fe-app.json', JSON.stringify({ app: 'SSO', kit: '../../../Core/FE' }));
    ok('thuan: nhiều FE cùng khai một kit ⇒ không nhân đôi', relK(feSharedRoots(rKit)) === 'src/Core/FE');
    fs.mkdirSync(path.join(rKit, 'src/Core/FE2'), { recursive: true });
    put(rKit, 'src/Services/Sso/FE/fe-app.json', JSON.stringify({ app: 'SSO', kit: '../../../Core/FE2' }));
    ok('thuan: một FE khai kit KHÁC (có tồn tại) ⇒ thêm sau mặc định', relK(feSharedRoots(rKit)) === 'src/Core/FE,src/Core/FE2');
    put(rKit, 'src/Services/Sso/FE/fe-app.json', JSON.stringify({ app: 'SSO', kit: '../../../Core/KhongCo' }));
    ok('am: kit trỏ thư mục không tồn tại ⇒ bị bỏ (không đoán)', relK(feSharedRoots(rKit)) === 'src/Core/FE');
    put(rKit, 'src/Services/Sso/FE/fe-app.json', '{ kit: ');
    ok('am: fe-app.json không phải JSON ⇒ AppsError nêu đường dẫn tệp (không bỏ qua lặng lẽ)', (() => { const x = throwsApps(() => feSharedRoots(rKit)); return typeof x === 'object' && x !== null && /fe-app\.json: không phải JSON/.test(x.message); })());

    // ── ca âm trên kho 1 phần mềm ──
    const e1 = resolveApp({ app: 'KhongCo' }, r1);
    ok('am: --app lạ ⇒ none + ứng viên liệt kê đủ', e1.status === 'none' && e1.via === 'explicit' && e1.candidates.length === 1 && !e1.app);
    mkApp(r1, 'LAL_THO'); fs.rmSync(path.join(r1, 'src/Apps/LAL_THO', APP_FILE));
    const e2 = resolveApp({ paths: ['src/Apps/LAL_THO/BE/a.cs'] }, r1);
    ok('am: đường dẫn dưới thư mục thiếu app.yaml ⇒ none (không đoán sang ZED)', e2.status === 'none' && e2.via === 'path');
    ok('am: scanApps ghi thư mục thiếu app.yaml vào strays, listApps không tính', scanApps(r1).strays.some((s) => s.dirName === 'LAL_THO') && listApps(r1).length === 1);
    ok('am: tên module có ".." bị từ chối', resolveApp({ moduleName: '../etc' }, r1).status === 'none');

    // ── kho 2 phần mềm ──
    const r2 = path.join(tmp, 'two'); mkApp(r2, 'ZED'); mkApp(r2, 'YAK');
    fs.mkdirSync(path.join(r2, 'src/Apps/YAK/BE/Modules/App.Modules.OnlyYak'), { recursive: true });
    fs.mkdirSync(path.join(r2, 'src/Apps/ZED/BE/Modules/App.Modules.Both'), { recursive: true }); fs.mkdirSync(path.join(r2, 'src/Apps/YAK/BE/Modules/App.Modules.Both'), { recursive: true });
    ok('thuan: 2 phần mềm — N6(2) đường dẫn YAK', (() => { const r = resolveApp({ paths: ['src/Apps/YAK/FE/a.ts'] }, r2); return r.status === 'ok' && r.app.code === 'YAK' && r.via === 'path'; })());
    ok('thuan: 2 phần mềm — N6(2) đường dẫn có ".." chuẩn hoá về YAK', resolveApp({ paths: ['src/Apps/ZED/../YAK/a.ts'] }, r2).app?.code === 'YAK');
    ok('thuan: 2 phần mềm — N6(3) module chỉ ở YAK ⇒ YAK', (() => { const r = resolveApp({ moduleName: 'OnlyYak' }, r2); return r.status === 'ok' && r.app.code === 'YAK' && r.via === 'module'; })());
    ok('thuan: 2 phần mềm — N6(1) thắng N6(2)', resolveApp({ app: 'ZED', paths: ['src/Apps/YAK/a'] }, r2).app.code === 'ZED');
    const am1 = resolveApp({ moduleName: 'Both' }, r2);
    ok('am: module có ở HAI phần mềm ⇒ ambiguous + 2 ứng viên', am1.status === 'ambiguous' && am1.candidates.length === 2 && am1.via === 'module' && !am1.app);
    const am2 = resolveApp({ paths: ['src/Apps/ZED/a', 'src/Apps/YAK/b'] }, r2);
    ok('am: đường dẫn thuộc hai phần mềm ⇒ ambiguous', am2.status === 'ambiguous' && am2.candidates.length === 2 && am2.via === 'path');
    const am3 = resolveApp({}, r2);
    ok('am: không đối số, 2 phần mềm ⇒ ambiguous (hỏi, không đoán)', am3.status === 'ambiguous' && am3.via === 'ask' && am3.candidates.length === 2);
    ok('am: module không ở đâu, 2 phần mềm ⇒ ambiguous (không rơi về only-one)', resolveApp({ moduleName: 'KhongCo' }, r2).status === 'ambiguous');
    ok('am: đường dẫn ngoài src/Apps + 2 phần mềm ⇒ ambiguous', resolveApp({ paths: ['src/Core/a.cs'] }, r2).status === 'ambiguous');
    ok('am: describeResolution ambiguous không bịa app', describeResolution(am3).startsWith('app=? · status=ambiguous · ứng viên: YAK, ZED'));

    // ── hồ sơ hỏng / thiếu thư mục ──
    const r3 = path.join(tmp, 'bad'); mkApp(r3, 'ZED', yaml('ZED').replace('code: ZED', 'code: KHAC'));
    const x1 = throwsApps(() => listApps(r3));
    ok('am: code khác tên thư mục ⇒ AppsError nêu "không khớp tên thư mục"', typeof x1 === 'object' && x1 !== null && x1.problems.some((p) => p.includes('không khớp tên thư mục')), String(x1?.message ?? x1));
    const r4 = path.join(tmp, 'bad2'); mkApp(r4, 'ZED', yaml('ZED').replace('  be: src/Apps/ZED/BE\n', '  be: src/Apps/ZED/BE\n  fe: src/Apps/ZED/FE\n').replace('host_project: App.Api.ZED', 'host_project: App.Api.ZED\nkhoa_la: 1'));
    const x2 = throwsApps(() => listApps(r4));
    ok('am: khoá lạ / khoá trùng ⇒ AppsError (YAML chặt)', typeof x2 === 'object' && x2 !== null, String(x2));
    const r5 = path.join(tmp, 'bad3'); mkApp(r5, 'ZED', yaml('ZED').replace('  be: src/Apps/ZED/BE', '  be: ../Core'));
    const x3 = throwsApps(() => listApps(r5));
    ok('am: paths.be chứa ".." ⇒ AppsError', typeof x3 === 'object' && x3 !== null && x3.problems.some((p) => p.includes('paths.be')), String(x3?.message ?? x3));
    const r6 = path.join(tmp, 'bad4'); mkApp(r6, 'ZED', yaml('ZED').replace('  tests: src/Apps/ZED/BE/Tests/T', '  tests: src/Apps/OTHER/BE/Tests/T'));
    ok('am: paths.tests ngoài src/Apps/<Mã>/ ⇒ AppsError', (() => { const x = throwsApps(() => listApps(r6)); return typeof x === 'object' && x !== null && x.problems.some((p) => p.includes('phải nằm dưới')); })());
    const r7 = path.join(tmp, 'bad5'); mkApp(r7, 'ZED', yaml('ZED').replace('    be_http: 5000', '    be_http: 99999'));
    ok('am: cổng ngoài 1–65535 ⇒ AppsError', (() => { const x = throwsApps(() => listApps(r7)); return typeof x === 'object' && x !== null && x.problems.some((p) => p.includes('1–65535')); })());
    ok('am: không có src/Apps ⇒ AppsError (không trả rỗng)', (() => { fs.mkdirSync(path.join(tmp, 'empty/src/Core'), { recursive: true }); const x = throwsApps(() => listApps(path.join(tmp, 'empty'))); return typeof x === 'object' && x !== null && /Không thấy thư mục src\/Apps/.test(x.message); })());
    ok('am: src/Apps rỗng ⇒ 0 phần mềm, resolveApp = none', (() => { fs.mkdirSync(path.join(tmp, 'zero/src/Apps'), { recursive: true }); return listApps(path.join(tmp, 'zero')).length === 0 && resolveApp({}, path.join(tmp, 'zero')).status === 'none'; })());
    ok('am: requireRoots([]) ném AppsError, requireRoots([x]) trả nguyên', throwsApps(() => requireRoots([], 'thử')) instanceof AppsError && requireRoots(['a'], 'thử')[0] === 'a');
    ok('am: beScanRoots kho chỉ có src/Apps rỗng ⇒ [] (nơi gọi phải requireRoots)', beScanRoots(path.join(tmp, 'zero')).length === 0);
    ok('thuan: findRepoRoot đi lên từ tệp sâu', findRepoRoot(path.join(r1, 'src/Apps/ZED/BE/Modules/App.Modules.ZED')) === path.resolve(r1));

    // ── P2 (D-CORE-77 Q1): hồ sơ hợp đồng CẠNH MÃ ──
    ok('thuan: contractsRoots kho 1 phần mềm ⇒ src/Apps/ZED/_contracts (đã tồn tại)', (() => { const c = contractsRoots(r1); return c.length === 1 && c[0].rel === 'src/Apps/ZED/_contracts' && c[0].abs === path.join(path.resolve(r1), 'src', 'Apps', 'ZED', '_contracts'); })());
    ok('thuan: contractsRoots bỏ phần mềm CHƯA có thư mục hợp đồng', (() => { const c = contractsRoots(r2); return c.length === 0; })());
    ok('thuan: appOfPath nhận đường dẫn tuyệt đối / tương đối dưới src/Apps/<Mã>', appOfPath(r1, 'src/Apps/ZED/_contracts/modules/PlaceX')?.code === 'ZED' && appOfPath(r1, path.join(r1, 'src/Apps/ZED/FE/a.ts'))?.code === 'ZED');
    ok('am: appOfPath đường dẫn NGOÀI src/Apps (src/Core, _contracts gốc kho cũ) ⇒ null', appOfPath(r1, 'src/Core/x.cs') === null && appOfPath(r1, '_contracts/modules/PlaceX') === null);
    ok('am: resolveAppOrDefault kho 2 phần mềm, KHÔNG thông tin ⇒ ambiguous (KHÔNG có phần mềm mặc định cứng) và DEFAULT_APP_CODE = null', (() => { const r = resolveAppOrDefault({}, r2); return DEFAULT_APP_CODE === null && r.status === 'ambiguous' && r.via === 'ask' && !r.app && r.candidates.length === 2; })());
    ok('am: resolveAppOrDefault CÓ tên module không ở đâu, 2 phần mềm ⇒ vẫn ambiguous (không đoán)', resolveAppOrDefault({ moduleName: 'KhongCo' }, r2).status === 'ambiguous');
    ok('am: resolveAppOrDefault --app lạ ⇒ none (không rơi về mặc định)', resolveAppOrDefault({ app: 'KhongCo' }, r2).status === 'none');
    ok('thuan: resolveAppOrDefault module chỉ ở YAK ⇒ YAK (module thắng mặc định)', resolveAppOrDefault({ moduleName: 'OnlyYak' }, r2).app?.code === 'YAK');
    const rNoDef = path.join(tmp, 'nodef'); mkApp(rNoDef, 'AAA'); mkApp(rNoDef, 'CCC');
    ok('am: kho nhiều phần mềm với tên bất kỳ (AAA, CCC), không thông tin ⇒ ambiguous', resolveAppOrDefault({}, rNoDef).status === 'ambiguous');
    ok('thuan: kho MỘT phần mềm, không thông tin ⇒ chọn phần mềm đó (only-one) — kể cả tên khác ZED', (() => { const rOne = path.join(tmp, 'one-aaa'); mkApp(rOne, 'AAA'); const r = resolveAppOrDefault({}, rOne); return r.status === 'ok' && r.app.code === 'AAA' && r.via === 'only-one'; })());

    // ── D-CORE-86 (e): sổ phiên + prompt của LÕI dời về src/Core/_session · src/Core/_prompts — biến {core_session} · {core_prompts} ──
    ok('thuan: CORE_SESSION_DIR / CORE_PROMPTS_DIR đúng vị trí mới (dưới src/Core, tên có tiền tố "_" cùng kiểu _session / _contracts)', CORE_SESSION_DIR === 'src/Core/_session' && CORE_PROMPTS_DIR === 'src/Core/_prompts');
    ok('thuan: VAR_KEYS có core_session + core_prompts; appVars trả ĐÚNG giá trị ở MỌI phần mềm (không theo phần mềm) và KHÔNG còn chuỗi "_core"', (() => {
      const vs = [...listApps(r2), ...listApps(rNoDef)].map(appVars);
      return VAR_KEYS.includes('core_session') && VAR_KEYS.includes('core_prompts') && vs.length >= 4
        && vs.every((v) => v.core_session === 'src/Core/_session' && v.core_prompts === 'src/Core/_prompts' && Object.values(v).every((x) => x === null || !/(^|[/\s])_core([/\s]|$)/.test(String(x))));
    })());
    /** Hàm làm gì: chạy CLI THẬT của tệp này (`node apps.mjs …args`) trên kho giả `root`; trả {code, out, err}. Tác dụng phụ: sinh một tiến trình con ngắn. */
    const cli1 = (root, ...args) => { const r = spawnSync(process.execPath, [fileURLToPath(import.meta.url), ...args, '--root', root], { encoding: 'utf8' }); return { code: r.status, out: (r.stdout ?? '').trim(), err: (r.stderr ?? '').trim() }; };
    ok('thuan: CLI --print core_session / core_prompts in đúng đường dẫn MỚI (kho 2 phần mềm, không cần chỉ rõ phần mềm)', (() => { const a = cli1(r2, '--print', 'core_session'), b = cli1(r2, '--print', 'core_prompts'); return a.code === 0 && a.out === 'src/Core/_session' && b.code === 0 && b.out === 'src/Core/_prompts'; })());
    ok('phá: kho nhiều phần mềm, KHÔNG chỉ rõ ⇒ `--print app_fe` hỏi lại (exit 3) NHƯNG `--print core_session` vẫn in được (biến lõi không phụ thuộc phần mềm); thêm `--app` ⇒ in đúng', (() => { const fe = cli1(rNoDef, '--print', 'app_fe'), cs = cli1(rNoDef, '--print', 'core_session'), ok1 = cli1(rNoDef, '--print', 'app_fe', '--app', 'CCC'); return fe.code === 3 && cs.code === 0 && cs.out === 'src/Core/_session' && ok1.code === 0 && ok1.out === 'src/Apps/CCC/FE'; })());
    ok('thuan: CLI --vars liệt kê {core_session} · {core_prompts} cuối bảng', (() => { const v = cli1(r2, '--vars', '--app', 'ZED'); return v.code === 0 && v.out.includes('{core_session} = src/Core/_session') && v.out.includes('{core_prompts} = src/Core/_prompts'); })());
    const rOld = path.join(tmp, 'oldc'); mkApp(rOld, 'ZED', yaml('ZED').replace('  contracts: src/Apps/ZED/_contracts', '  contracts: _contracts'));
    ok('am: paths.contracts = "_contracts" (gốc kho, cách cũ trước P2) ⇒ AppsError "phải nằm dưới src/Apps/ZED/"', (() => { const x = throwsApps(() => listApps(rOld)); return typeof x === 'object' && x !== null && x.problems.some((p) => p.includes('paths.contracts') && p.includes('phải nằm dưới src/Apps/ZED/')); })());
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
    console.log(`(đã dọn thư mục tạm: ${fs.existsSync(tmp) ? 'CHƯA' : 'rồi'})`);
  }
  console.log(bad ? `${bad} ca SAI` : 'apps selftest: tất cả ca đúng kỳ vọng');
  return bad;
}

/**
 * Hàm làm gì: điểm vào dòng lệnh — liệt kê phần mềm, phân giải N6 hoặc chạy tự kiểm.
 * @param {string[]} argv Đối số sau tên tệp.
 * @returns {number} Mã thoát: 0 ok · 1 selftest sai · 2 lỗi đối số / thư viện · 3 phân giải cần hỏi lại hoặc không có.
 */
function cli(argv) {
  if (argv.includes('--selftest')) return selftest() ? 1 : 0;
  /** Hàm làm gì: lấy MỌI giá trị đứng sau cờ `k` trong `argv` (cờ lặp nhiều lần ⇒ nhiều giá trị). Trả về mảng chuỗi. */
  const get = (k) => { const out = []; for (let i = 0; i < argv.length; i++) if (argv[i] === k && argv[i + 1]) out.push(argv[++i]); return out; };
  const repoRoot = path.resolve(get('--root')[0] ?? findRepoRoot(path.dirname(fileURLToPath(import.meta.url))) ?? process.cwd());
  try {
    if (argv.includes('--resolve')) {
      const res = resolveApp({ app: get('--app')[0], paths: get('--path'), moduleName: get('--module')[0] }, repoRoot);
      console.log(describeResolution(res));
      return res.status === 'ok' ? 0 : 3;
    }
    if (argv.includes('--vars')) {
      const res = resolveAppOrDefault({ app: get('--app')[0], paths: get('--path'), moduleName: get('--module')[0] }, repoRoot);
      if (res.status !== 'ok') { console.error(describeResolution(res)); return 3; }
      for (const [k, v] of Object.entries(appVars(res.app))) console.log(`{${k}} = ${v ?? '(chưa khai)'}`);
      return 0;
    }
    if (argv.includes('--print')) {
      const key = get('--print')[0];
      const KEYS = ['root', 'be', 'fe', 'api', 'modules', 'tests', 'contracts', 'session', 'module', 'code'];
      if (!KEYS.includes(key) && !VAR_KEYS.includes(key)) { console.error(`--print cần một khoá trong: ${[...new Set([...KEYS, ...VAR_KEYS])].join(', ')}`); return 2; }
      if (Object.hasOwn(CORE_VARS, key)) { console.log(CORE_VARS[key]); return 0; }   // biến của LÕI: không theo phần mềm ⇒ KHÔNG phân giải phần mềm (đỡ hỏi lại khi kho nhiều phần mềm)
      const res = resolveAppOrDefault({ app: get('--app')[0], paths: get('--path'), moduleName: get('--module')[0] }, repoRoot);
      if (res.status !== 'ok') { console.error(describeResolution(res)); return 3; }
      const vars = appVars(res.app);
      const name = VAR_KEYS.includes(key) ? key : (VAR_KEYS.includes(`app_${key}`) ? `app_${key}` : key);
      const val = name in vars ? vars[name] : null;
      if (!val) { console.error(`phần mềm ${res.app.code}: ${name} chưa khai trong ${res.app.relDir}/${APP_FILE}`); return 3; }
      console.log(val);
      return 0;
    }
    const apps = listApps(repoRoot);
    console.log(`Gốc kho: ${repoRoot}\n${apps.length} phần mềm:`);
    for (const a of apps) console.log(`  ${a.code.padEnd(8)} ${a.relDir.padEnd(18)} sso=${a.ssoCode ?? '—'}#${a.ssoAppId ?? '—'}  host=${a.hostProject}  config=${a.configKey ?? '—'}`);
    return 0;
  } catch (e) {
    if (e instanceof AppsError) { console.error(e.message); for (const p of e.problems.slice(0, 20)) console.error('  - ' + p); return 2; }
    throw e;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) process.exit(cli(process.argv.slice(2)));
