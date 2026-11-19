#!/usr/bin/env node
/**
 * check-ports.mjs — KIỂM CỔNG DEV của MỌI phần mềm trong dự án. Danh sách phần mềm lấy ĐỘNG từ workspace.json (qua lib/apps.mjs); nguồn chân lý cổng là `app.yaml → ports`
 * (nhóm `dev` = máy coder, nhóm `agent` = stack chạy chung với phiên Claude; khoá `be_http`, `be_https`, `fe`). KHÔNG cứng tên phần mềm nào.
 *
 * KIỂM (mỗi phép so là một dòng KHỚP / LỆCH trong bảng báo cáo)
 *   (a) Công thức khối, theo từng nhóm: `be_http` chia hết cho 10 · `be_https` = `be_http` + 1 · `fe` = `be_http` − 800 · nhóm `agent` = nhóm `dev` + 10 cho MỖI cổng.
 *   (b) Không trùng cổng: giữa MỌI cổng của MỌI phần mềm (mọi nhóm, kể cả FE) và không trùng cổng cố định của dịch vụ lõi (SSO 5100 / 5101 / 5110 / 5111 / 4300 / 4310 · gateway 5200 / 5201 / 5210 / 5211 ·
 *       mini-rp 5300 · File API 5600 / 5601) và không nằm trong dải dành riêng 8000–8999, 9900–9999.
 *   (c) Bảng `docs/deploy/bang-cong-dev.md` mục `## 2.` (cột: Thành phần | BE http | BE https | FE (Angular) | Tên miền dev | Ghi chú): hàng `<MÃ> — máy coder` và `<MÃ> — stack agent`
 *       phải khớp app.yaml (ô cổng có thể là `—` = không có).
 *   (d) `<paths.api>/Properties/launchSettings.json`: hồ sơ `<host_project>` có applicationUrl `https://localhost:<https>;http://localhost:<http>`; hồ sơ `<host_project>.Agent` theo nhóm agent
 *       và `ApiSettings__UseCors` = `http://localhost:<fe agent>`.
 *   (e) `<paths.fe>/angular.json` (nếu có): mọi project có mục `serve` — `configurations.development.port` (thiếu ⇒ `options.port` ⇒ mặc định Angular 4200) = `fe` dev; `configurations.agent.port` (nếu khai) = `fe` agent.
 *   (f) `<paths.fe>/src/environments/environment.ts` và `environment.agent.ts` (nếu có): `baseApiUrl: '…'` có cổng = `be_https` của nhóm tương ứng.
 *   Tệp TUỲ CHỌN (angular.json, environment*.ts) thiếu ⇒ bỏ qua có GHI CHÚ. Tệp BẮT BUỘC thiếu (launchSettings.json, bảng tài liệu, hàng của bảng, nhóm `ports.dev`) ⇒ ĐỎ.
 *
 * Phần mềm khai thêm nhóm cổng khác (vd `linked`) vẫn được kiểm TRÙNG cổng (b) nhưng không áp công thức khối.
 * Công cụ DEV, Node thuần, ESM, KHÔNG gói ngoài, chỉ ĐỌC tệp (không ghi, không mở cổng).
 *
 * Dùng (ở thư mục DỰ ÁN):
 *   node scripts/check-ports.mjs                 kiểm thật trên dự án đang có
 *   node scripts/check-ports.mjs --root <dir>    kiểm trên một bản sao / kho giả (gốc kho = thư mục dự án, hoặc kho gộp có src/Apps/<Mã>)
 *   node scripts/check-ports.mjs --json          in kết quả dạng JSON
 *   node scripts/check-ports.mjs --selftest      tự kiểm: ca thuận + ca phá (cổng trùng, lệch công thức, trùng cổng lõi, thiếu hàng bảng, lệch launchSettings, …) — mỗi ca phá PHẢI đỏ
 * Mã thoát: 0 đạt · 1 có LỆCH / TRÙNG / không đọc được hồ sơ phần mềm (hoặc selftest sai) · 2 tham số sai.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { AppsError, appPaths, findRepoRoot, listApps } from './lib/apps.mjs';
import { parseJsonc } from './lib/jsonc.mjs';
import { L, P } from './lib/workspace.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));

/** Tệp bảng cổng của dự án (đường dẫn LOGIC tính từ gốc kho). */
export const DOC_FILE = 'docs/deploy/bang-cong-dev.md';
/** Tên nhóm cổng: máy coder và stack agent. */
const GROUP_DEV = 'dev';
const GROUP_AGENT = 'agent';
/** Cộng thêm vào MỖI cổng của nhóm `dev` để ra cổng của nhóm `agent`. */
const AGENT_OFFSET = 10;
/** Ba khoá cổng được kiểm công thức, theo thứ tự hiển thị. */
const PORT_KEYS = ['be_http', 'be_https', 'fe'];

/** Cổng CỐ ĐỊNH của dịch vụ lõi (SSO · gateway · công cụ dev · File API): phần mềm của dự án KHÔNG được dùng. Mỗi phần tử `{ port, owner }`. */
export const CORE_FIXED_PORTS = Object.freeze([
  [5100, 'SSO — BE http'], [5101, 'SSO — BE https'], [5110, 'SSO stack agent — BE http'], [5111, 'SSO stack agent — BE https'], [4300, 'SSO — FE'], [4310, 'SSO stack agent — FE'],
  [5200, 'API gateway — BE http'], [5201, 'API gateway — BE https'], [5210, 'API gateway stack agent — BE http'], [5211, 'API gateway stack agent — BE https'],
  [5300, 'công cụ dev mini-rp'], [5600, 'File API — http (dự trữ)'], [5601, 'File API — https'],
].map(([port, owner]) => Object.freeze({ port, owner })));

/** Dải cổng DÀNH RIÊNG (máy chủ luồng sau này): không phần mềm nào được khai cổng trong dải. Mỗi phần tử `{ from, to, why }` (hai đầu đều thuộc dải). */
export const RESERVED_RANGES = Object.freeze([
  Object.freeze({ from: 8000, to: 8999, why: 'dành riêng cho máy chủ luồng' }),
  Object.freeze({ from: 9900, to: 9999, why: 'dành riêng cho máy chủ luồng' }),
]);

// ════════════════════════════════════════════════════════════════════════════
// 1. TIỆN ÍCH ĐỌC (bảng markdown · địa chỉ · tệp)
// ════════════════════════════════════════════════════════════════════════════

/**
 * Hàm làm gì: chuẩn hoá tên ô của bảng markdown để so khớp — bỏ dấu backtick và dấu sao (in đậm), gộp khoảng trắng, dạng NFC.
 * @param {string} cell Nội dung ô.
 * @returns {string} Chuỗi đã chuẩn hoá. Tác dụng phụ: không.
 */
function normCell(cell) {
  return cell.replace(/[`*]/g, '').replace(/\s+/g, ' ').trim().normalize('NFC');
}

/**
 * Hàm làm gì: đọc một ô cổng của bảng tài liệu.
 * @param {string} cell Nội dung ô, vd `5400`, `**4600**`, `—`.
 * @returns {number|string|null} Số cổng; null nếu ô trống hoặc `—` / `-`; chuỗi gốc nếu không phải số (sẽ bị coi là lệch). Tác dụng phụ: không.
 */
function parsePortCell(cell) {
  const c = normCell(cell);
  if (c === '' || c === '—' || c === '-') return null;
  const n = Number(c);
  return Number.isInteger(n) ? n : c;
}

/**
 * Hàm làm gì: trích các hàng của bảng ở mục `## 2.` của tài liệu cổng (chỉ trong mục 2 — dừng ở tiêu đề `## ` kế tiếp).
 * @param {string} text Nội dung tài liệu.
 * @returns {Map<string, {http: number|string|null, https: number|string|null, fe: number|string|null, host: string|null}>} Theo tên ô đầu đã chuẩn hoá (vd `ZED — máy coder`).
 * Tác dụng phụ: không.
 */
export function parseDocTable(text) {
  const rows = new Map();
  let inSection = false;
  for (const line of text.split(/\r?\n/)) {
    if (/^##\s+2\./.test(line)) { inSection = true; continue; }
    if (inSection && /^##\s/.test(line)) break;
    if (!inSection || !line.trimStart().startsWith('|')) continue;
    const cells = line.trim().replace(/^\|/, '').replace(/\|$/, '').split('|');
    if (cells.length < 5 || cells.every((c) => /^[\s:-]*$/.test(c))) continue;
    const host = normCell(cells[4]);
    rows.set(normCell(cells[0]), { http: parsePortCell(cells[1]), https: parsePortCell(cells[2]), fe: parsePortCell(cells[3]), host: host === '' || host === '—' || host === '-' ? null : host });
  }
  return rows;
}

/**
 * Hàm làm gì: lấy số cổng của một địa chỉ (cổng ngầm định: https = 443, http = 80).
 * @param {string} url Địa chỉ tuyệt đối, vd `https://localhost:5401`.
 * @returns {number|undefined} Số cổng; undefined nếu không phải địa chỉ tuyệt đối http(s). Tác dụng phụ: không.
 */
export function portOf(url) {
  try {
    const u = new URL(url);
    if (u.port !== '') return Number(u.port);
    if (u.protocol === 'https:') return 443;
    if (u.protocol === 'http:') return 80;
    return undefined;
  } catch {
    return undefined;
  }
}

/**
 * Hàm làm gì: lấy giá trị `baseApiUrl: '…'` đầu tiên trong một tệp environment*.ts, BỎ QUA dòng chú thích (`//`, `/*`, `*`).
 * @param {string} text Nội dung tệp TypeScript.
 * @returns {string|null} Giá trị chuỗi (có thể rỗng), hoặc null khi không có dòng `baseApiUrl` nào. Tác dụng phụ: không.
 */
export function baseApiUrlOf(text) {
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (line.startsWith('//') || line.startsWith('/*') || line.startsWith('*')) continue;
    const m = /\bbaseApiUrl\s*:\s*(['"`])([^'"`]*)\1/.exec(line);
    if (m) return m[2];
  }
  return null;
}

/**
 * Hàm làm gì: đọc tệp văn bản, bỏ BOM; không đọc được thì trả null (không ném lỗi).
 * @param {string} abs Đường dẫn tuyệt đối. @returns {string|null} Nội dung hoặc null. Tác dụng phụ: đọc đĩa.
 */
function readOrNull(abs) {
  try { return fs.readFileSync(abs, 'utf8').replace(/^﻿/, ''); } catch { return null; }
}

/**
 * Hàm làm gì: kiểm `abs` có phải thư mục tồn tại không (không ném lỗi).
 * @param {string} abs Đường dẫn tuyệt đối. @returns {boolean} true nếu là thư mục. Tác dụng phụ: đọc đĩa.
 */
function isDir(abs) {
  try { return fs.statSync(abs).isDirectory(); } catch { return false; }
}

/**
 * Hàm làm gì: hiển thị một giá trị cổng ở bảng báo cáo — null / undefined là `—` (không có), còn lại là chuỗi của giá trị.
 * @param {unknown} v Giá trị. @returns {string} Chuỗi hiển thị. Tác dụng phụ: không.
 */
function show(v) {
  return v === null || v === undefined ? '—' : String(v);
}

/**
 * Hàm làm gì: chuẩn hoá giá trị cổng để so sánh — undefined coi như null (không có).
 * @param {unknown} v Giá trị. @returns {unknown} Giá trị đã chuẩn hoá. Tác dụng phụ: không.
 */
function norm(v) {
  return v === undefined ? null : v;
}

// ════════════════════════════════════════════════════════════════════════════
// 2. QUY TẮC KHỐI + NẠP MÔ HÌNH TỪ ĐĨA
// ════════════════════════════════════════════════════════════════════════════

/**
 * Hàm làm gì: liệt kê chỗ một nhóm cổng vi phạm quy tắc khối.
 * @param {{be_http?:number, be_https?:number, fe?:number}} grp Nhóm cổng của app.yaml (dev hoặc agent).
 * @param {{needFe?:boolean}} [opt] `needFe`: nhóm PHẢI có `fe` (khi nhóm `dev` của cùng phần mềm có FE). Mặc định false = `fe` tuỳ chọn.
 * @returns {string[]} Các lỗi (tiếng Việt); rỗng = đúng quy tắc. Tác dụng phụ: không.
 */
export function ruleViolations(grp, { needFe = false } = {}) {
  const errors = [];
  if (!Number.isInteger(grp.be_http)) { errors.push('thiếu be_http'); return errors; }
  if (grp.be_http % 10 !== 0) errors.push(`be_http ${grp.be_http} không chia hết cho 10`);
  if (!Number.isInteger(grp.be_https)) errors.push('thiếu be_https');
  else if (grp.be_https !== grp.be_http + 1) errors.push(`be_https ${grp.be_https} ≠ be_http + 1 (${grp.be_http + 1})`);
  if (grp.fe === undefined || grp.fe === null) { if (needFe) errors.push('thiếu fe (nhóm dev có FE)'); }
  else if (grp.fe !== grp.be_http - 800) errors.push(`fe ${grp.fe} ≠ be_http − 800 (${grp.be_http - 800})`);
  return errors;
}

/**
 * Hàm làm gì: nạp MÔ HÌNH kiểm cổng từ đĩa — mọi phần mềm (hồ sơ app.yaml hợp lệ) cùng nội dung các tệp cần đối chiếu. Mô hình là dữ liệu thuần nên {@link checkModel} thử được không cần đĩa.
 * @param {string} root Gốc kho (thư mục dự án; hoặc gốc kho gộp / kho giả có `src/Apps/<Mã>`).
 * @returns {{doc:{rel:string, text:string|null}, apps:{code:string, hostProject:string, ports:object|null, feDirExists:boolean,
 *   launch:{rel:string, text:string|null}, angular:{rel:string, text:string|null}, envDev:{rel:string, text:string|null}, envAgent:{rel:string, text:string|null}}[]}}
 *   `text` = null khi tệp không có. `rel` là đường dẫn LOGIC để in báo cáo.
 * @throws {AppsError} Không có phần mềm nào hoặc một app.yaml hỏng (xem listApps) — nơi gọi báo ĐỎ.
 * Tác dụng phụ: đọc đĩa.
 */
export function loadModel(root) {
  /** Hàm làm gì: gói một đường dẫn tuyệt đối thành `{ rel, text }` (rel = đường dẫn logic để in). Tác dụng phụ: đọc đĩa. */
  const file = (abs) => ({ rel: L(root, abs) ?? abs, text: readOrNull(abs) });
  return {
    doc: { rel: DOC_FILE, text: readOrNull(P(root, DOC_FILE)) },
    apps: listApps(root).map((a) => {
      const ap = appPaths(a);
      return {
        code: a.code, hostProject: a.hostProject, ports: a.ports ?? null, feDirExists: isDir(ap.fe),
        launch: file(path.join(ap.api, 'Properties', 'launchSettings.json')),
        angular: file(path.join(ap.fe, 'angular.json')),
        envDev: file(path.join(ap.fe, 'src', 'environments', 'environment.ts')),
        envAgent: file(path.join(ap.fe, 'src', 'environments', 'environment.agent.ts')),
      };
    }),
  };
}

// ════════════════════════════════════════════════════════════════════════════
// 3. KIỂM
// ════════════════════════════════════════════════════════════════════════════

/**
 * Hàm làm gì: tạo bộ ghi kết quả (các dòng so sánh + ghi chú) dùng chung cho các phép kiểm con.
 * @returns {{rows:{component:string, source:string, actual:string, expected:string, ok:boolean}[], notes:string[],
 *   add:(component:string, source:string, actual:string, expected:string, ok:boolean)=>void, eq:(component:string, source:string, actual:unknown, expected:unknown)=>void}}
 * Tác dụng phụ: không (các hàm trả về chỉ ghi vào mảng của bộ ghi).
 */
function makeReporter() {
  const rows = [];
  const notes = [];
  /** Hàm làm gì: ghi một dòng kết quả (chuỗi hiển thị đã sẵn) vào `rows`. */
  const add = (component, source, actual, expected, ok) => { rows.push({ component, source, actual, expected, ok }); };
  /** Hàm làm gì: so hai giá trị cổng (undefined = null = «—») và ghi một dòng KHỚP / LỆCH. */
  const eq = (component, source, actual, expected) => add(component, source, show(actual), show(expected), norm(actual) === norm(expected));
  return { rows, notes, add, eq };
}

/**
 * Hàm làm gì: kiểm công thức khối cho nhóm `dev` và `agent` của một phần mềm, rồi quan hệ agent = dev + 10 cho từng khoá.
 * @param {ReturnType<typeof makeReporter>} rep Bộ ghi. @param {string} code Mã phần mềm.
 * @param {object} dev Nhóm dev (bắt buộc). @param {object|null} agent Nhóm agent (null = chưa khai).
 * @returns {void} Chỉ ghi vào `rep`. Tác dụng phụ: không.
 */
function checkRules(rep, code, dev, agent) {
  const hasFe = dev.fe !== undefined && dev.fe !== null;
  for (const [grp, label] of [[dev, 'máy coder'], [agent, 'stack agent']]) {
    if (!grp) continue;
    const errs = ruleViolations(grp, { needFe: hasFe });
    const text = PORT_KEYS.map((k) => `${k} ${show(grp[k])}`).join(' · ');
    rep.add(`${code} — ${label}`, 'app.yaml · quy tắc khối', errs.length ? errs.join('; ') : text, 'be_http % 10 = 0 · be_https = be_http + 1 · fe = be_http − 800', errs.length === 0);
  }
  if (!agent) { rep.notes.push(`${code}: không khai ports.agent — bỏ qua mọi kiểm của stack agent.`); return; }
  for (const k of PORT_KEYS) {
    if (norm(dev[k]) === null && norm(agent[k]) === null) continue;
    rep.eq(`${code} — stack agent`, `app.yaml · agent.${k} = dev.${k} + ${AGENT_OFFSET}`, agent[k], norm(dev[k]) === null ? null : dev[k] + AGENT_OFFSET);
  }
}

/**
 * Hàm làm gì: đối chiếu hàng `<MÃ> — máy coder` / `<MÃ> — stack agent` của bảng tài liệu với app.yaml (từng ô BE http · BE https · FE).
 * @param {ReturnType<typeof makeReporter>} rep Bộ ghi. @param {Map<string, object>|null} table Bảng đã phân tích (null = tài liệu không đọc được).
 * @param {string} docRel Đường dẫn logic của tài liệu (để in). @param {string} code Mã phần mềm. @param {object} dev Nhóm dev. @param {object|null} agent Nhóm agent.
 * @returns {void} Chỉ ghi vào `rep`. Tác dụng phụ: không.
 */
function checkDocRows(rep, table, docRel, code, dev, agent) {
  for (const [grp, label, required] of [[dev, 'máy coder', true], [agent, 'stack agent', false]]) {
    const name = `${code} — ${label}`;
    const row = table?.get(name);
    if (!table) { rep.add(name, docRel, 'THIẾU bảng', 'có bảng mục «## 2.»', false); continue; }
    if (!row) {
      if (required || grp) rep.add(name, docRel, 'THIẾU hàng', `có hàng «${name}»`, false);
      else rep.notes.push(`${code}: không khai ports.agent và bảng không có hàng «${name}» — bỏ qua.`);
      continue;
    }
    for (const [cell, key, title] of [['http', 'be_http', 'BE http'], ['https', 'be_https', 'BE https'], ['fe', 'fe', 'FE']]) {
      rep.eq(name, `${docRel} · ${title}`, row[cell], grp ? grp[key] : null);
    }
  }
}

/**
 * Hàm làm gì: kiểm `Properties/launchSettings.json` — hồ sơ `<host_project>` (dev) và `<host_project>.Agent` (nếu khai nhóm agent): applicationUrl + `ApiSettings__UseCors` của agent.
 * @param {ReturnType<typeof makeReporter>} rep Bộ ghi. @param {object} app Phần tử của mô hình ({@link loadModel}). @param {object} dev Nhóm dev. @param {object|null} agent Nhóm agent.
 * @returns {void} Chỉ ghi vào `rep`; thiếu tệp / không phải JSON / thiếu hồ sơ ⇒ dòng LỆCH. Tác dụng phụ: không.
 */
function checkLaunch(rep, app, dev, agent) {
  const src = app.launch.rel;
  if (app.launch.text === null) { rep.add(`${app.code} — máy coder`, src, 'THIẾU tệp', 'launchSettings.json (bắt buộc)', false); return; }
  let json;
  try { json = parseJsonc(app.launch.text); }
  catch (e) { rep.add(`${app.code} — máy coder`, src, `không phải JSON (${e.message})`, 'JSON hợp lệ', false); return; }
  /** Hàm làm gì: chuẩn hoá danh sách applicationUrl (tách `;`, bỏ khoảng trắng và `/` cuối, sắp xếp) để so không phụ thuộc thứ tự. */
  const urls = (s) => String(s ?? '').split(';').map((x) => x.trim().replace(/\/+$/, '')).filter(Boolean).sort();
  /** Hàm làm gì: dựng danh sách applicationUrl mong đợi của một nhóm cổng theo đúng thứ tự khuôn (https nếu có, rồi http). */
  const expectedUrls = (grp) => [...(grp.be_https ? [`https://localhost:${grp.be_https}`] : []), `http://localhost:${grp.be_http}`];
  for (const [grp, profileName, label] of [[dev, app.hostProject, 'máy coder'], [agent, `${app.hostProject}.Agent`, 'stack agent']]) {
    if (!grp) continue;
    const profile = json.profiles?.[profileName];
    const name = `${app.code} — ${label}`;
    const want = expectedUrls(grp);
    if (!profile) { rep.add(name, `${src} · hồ sơ ${profileName}`, 'THIẾU hồ sơ', want.join(';'), false); continue; }
    const have = urls(profile.applicationUrl);
    rep.add(name, `${src} · ${profileName}.applicationUrl`, profile.applicationUrl === undefined ? 'THIẾU applicationUrl' : String(profile.applicationUrl), want.join(';'), have.join(';') === [...want].sort().join(';'));
    if (label === 'stack agent' && grp.fe !== undefined && grp.fe !== null) {
      rep.add(name, `${src} · ${profileName} · ApiSettings__UseCors`, String(profile.environmentVariables?.ApiSettings__UseCors ?? 'THIẾU'), `http://localhost:${grp.fe}`, profile.environmentVariables?.ApiSettings__UseCors === `http://localhost:${grp.fe}`);
    }
  }
}

/**
 * Hàm làm gì: kiểm `angular.json` — mọi project có mục `serve`: cổng `development` (thiếu ⇒ `options.port` ⇒ mặc định Angular 4200) = fe dev; cổng `agent` (nếu khai) = fe agent.
 * @param {ReturnType<typeof makeReporter>} rep Bộ ghi. @param {object} app Phần tử của mô hình. @param {object} dev Nhóm dev. @param {object|null} agent Nhóm agent.
 * @returns {void} Chỉ ghi vào `rep`; tệp / thư mục FE thiếu ⇒ ghi chú (bỏ qua). Tác dụng phụ: không.
 */
function checkAngular(rep, app, dev, agent) {
  if (!app.feDirExists || app.angular.text === null) { rep.notes.push(`${app.code}: không có ${app.angular.rel} — bỏ qua kiểm cổng ng serve.`); return; }
  let json;
  try { json = parseJsonc(app.angular.text); }
  catch (e) { rep.add(`${app.code} — máy coder`, app.angular.rel, `không phải JSON (${e.message})`, 'JSON hợp lệ', false); return; }
  const serving = Object.entries(json.projects ?? {}).map(([name, p]) => [name, (p?.architect ?? p?.targets ?? {}).serve]).filter(([, s]) => s && typeof s === 'object');
  if (serving.length === 0) { rep.notes.push(`${app.code}: ${app.angular.rel} không có project nào có mục serve — bỏ qua.`); return; }
  for (const [name, serve] of serving) {
    const cfg = serve.configurations ?? {};
    if (dev.fe === undefined || dev.fe === null) rep.notes.push(`${app.code}: app.yaml không khai ports.dev.fe — bỏ qua cổng ng serve của project ${name}.`);
    else {
      const declared = cfg.development?.port ?? serve.options?.port;
      const actual = declared ?? 4200;
      rep.add(`${app.code} — máy coder`, `${app.angular.rel} · ${name} · serve.development.port`, declared === undefined ? '4200 (mặc định Angular, chưa khai port)' : String(declared), String(dev.fe), actual === dev.fe);
    }
    if (cfg.agent?.port !== undefined) {
      if (agent && agent.fe !== undefined && agent.fe !== null) rep.eq(`${app.code} — stack agent`, `${app.angular.rel} · ${name} · serve.agent.port`, cfg.agent.port, agent.fe);
      else rep.notes.push(`${app.code}: angular.json khai serve.agent.port nhưng app.yaml không khai ports.agent.fe — bỏ qua.`);
    }
  }
}

/**
 * Hàm làm gì: kiểm `baseApiUrl` của `environment.ts` (nhóm dev) và `environment.agent.ts` (nhóm agent): cổng của địa chỉ = `be_https` (không có https thì `be_http`).
 * @param {ReturnType<typeof makeReporter>} rep Bộ ghi. @param {object} app Phần tử của mô hình. @param {object} dev Nhóm dev. @param {object|null} agent Nhóm agent.
 * @returns {void} Chỉ ghi vào `rep`; tệp thiếu ⇒ ghi chú (bỏ qua); tệp có mà không thấy dòng baseApiUrl ⇒ LỆCH. Tác dụng phụ: không.
 */
function checkEnvironments(rep, app, dev, agent) {
  for (const [file, grp, label] of [[app.envDev, dev, 'máy coder'], [app.envAgent, agent, 'stack agent']]) {
    if (file.text === null) { rep.notes.push(`${app.code}: không có ${file.rel} — bỏ qua kiểm baseApiUrl.`); continue; }
    if (!grp) { rep.notes.push(`${app.code}: có ${file.rel} nhưng app.yaml không khai nhóm cổng tương ứng — bỏ qua.`); continue; }
    const name = `${app.code} — ${label}`;
    const url = baseApiUrlOf(file.text);
    const want = grp.be_https ?? grp.be_http;
    if (url === null) { rep.add(name, `${file.rel} · baseApiUrl`, 'THIẾU dòng baseApiUrl', String(want), false); continue; }
    const have = portOf(url);
    rep.add(name, `${file.rel} · baseApiUrl`, have === undefined ? `«${url}» (không phải địa chỉ tuyệt đối)` : String(have), String(want), have === want);
  }
}

/**
 * Hàm làm gì: tìm cổng TRÙNG giữa mọi cổng của mọi phần mềm, trùng cổng cố định của dịch vụ lõi và cổng nằm trong dải dành riêng.
 * @param {{code:string, ports:object|null}[]} apps Phần mềm của mô hình.
 * @returns {{kind:string, port:number, text:string}[]} Danh sách xung đột (rỗng = sạch). Tác dụng phụ: không.
 */
function findConflicts(apps) {
  const owners = new Map();
  for (const app of apps) {
    for (const [g, grp] of Object.entries(app.ports ?? {})) {
      for (const [k, v] of Object.entries(grp)) owners.set(v, [...(owners.get(v) ?? []), `${app.code}.ports.${g}.${k}`]);
    }
  }
  const out = [];
  for (const [port, who] of [...owners].sort((a, b) => a[0] - b[0])) {
    if (who.length > 1) out.push({ kind: 'TRÙNG', port, text: `cổng ${port} khai ở ${who.join(' và ')}` });
    const fixed = CORE_FIXED_PORTS.find((f) => f.port === port);
    if (fixed) out.push({ kind: 'TRÙNG CỔNG LÕI', port, text: `cổng ${port} (${who.join(', ')}) là cổng CỐ ĐỊNH của ${fixed.owner}` });
    const range = RESERVED_RANGES.find((r) => port >= r.from && port <= r.to);
    if (range) out.push({ kind: 'DẢI DÀNH RIÊNG', port, text: `cổng ${port} (${who.join(', ')}) nằm trong dải ${range.from}–${range.to} ${range.why}` });
  }
  return out;
}

/**
 * Hàm làm gì: chạy toàn bộ phép kiểm (a)–(f) trên một mô hình (xem {@link loadModel}); không đụng đĩa.
 * @param {ReturnType<typeof loadModel>} model Mô hình cần kiểm.
 * @returns {{rows:{component:string, source:string, actual:string, expected:string, ok:boolean}[], conflicts:{kind:string, port:number, text:string}[], notes:string[], bad:number}}
 *   `rows` = từng phép so; `conflicts` = cổng trùng / trùng cổng lõi / trong dải dành riêng; `notes` = ghi chú không tính lỗi; `bad` = số dòng LỆCH. Đạt khi `bad === 0` và `conflicts` rỗng.
 * Tác dụng phụ: không.
 */
export function checkModel(model) {
  const rep = makeReporter();
  let table = null;
  if (model.doc.text === null) rep.add('Tài liệu cổng', model.doc.rel, 'THIẾU tệp', 'tệp có bảng cổng mục «## 2.»', false);
  else {
    table = parseDocTable(model.doc.text);
    if (table.size === 0) { rep.add('Tài liệu cổng', model.doc.rel, 'KHÔNG thấy bảng', 'bảng cổng ở mục «## 2.»', false); table = null; }
  }
  for (const app of model.apps) {
    const groups = app.ports ?? {};
    const dev = groups[GROUP_DEV] ?? null;
    const agent = groups[GROUP_AGENT] ?? null;
    for (const g of Object.keys(groups)) if (g !== GROUP_DEV && g !== GROUP_AGENT) rep.notes.push(`${app.code}: nhóm ports.${g} không thuộc quy tắc khối — chỉ kiểm trùng cổng.`);
    if (!dev) { rep.add(`${app.code} — máy coder`, 'app.yaml → ports.dev', 'THIẾU nhóm', 'khai ports.dev (be_http, be_https, fe)', false); continue; }
    checkRules(rep, app.code, dev, agent);
    if (table !== null || model.doc.text === null) checkDocRows(rep, table, model.doc.rel, app.code, dev, agent);
    checkLaunch(rep, app, dev, agent);
    checkAngular(rep, app, dev, agent);
    checkEnvironments(rep, app, dev, agent);
  }
  const conflicts = findConflicts(model.apps);
  return { rows: rep.rows, conflicts, notes: rep.notes, bad: rep.rows.filter((r) => !r.ok).length };
}

/**
 * Hàm làm gì: kết quả {@link checkModel} có ĐẠT không (không dòng LỆCH, không xung đột cổng).
 * @param {{bad:number, conflicts:unknown[]}} result Kết quả kiểm. @returns {boolean} true nếu đạt. Tác dụng phụ: không.
 */
export function passed(result) {
  return result.bad === 0 && result.conflicts.length === 0;
}

// ════════════════════════════════════════════════════════════════════════════
// 4. BÁO CÁO
// ════════════════════════════════════════════════════════════════════════════

/**
 * Hàm làm gì: độ dài hiển thị của chuỗi (đếm ký tự Unicode sau NFC, để cột tiếng Việt thẳng hàng).
 * @param {string} s Chuỗi. @returns {number} Số ký tự. Tác dụng phụ: không.
 */
function width(s) {
  return [...s.normalize('NFC')].length;
}

/**
 * Hàm làm gì: in bảng kết quả, các cổng trùng, ghi chú và dòng tổng ra console.
 * @param {ReturnType<typeof checkModel>} result Kết quả của checkModel. @param {string} title Dòng tiêu đề.
 * @returns {void} Chỉ in. Tác dụng phụ: ghi stdout.
 */
export function printReport(result, title) {
  const head = ['Thành phần', 'Nguồn', 'Cổng thực', 'Cổng đích', 'Kết quả'];
  const body = result.rows.map((r) => [r.component, r.source, r.actual, r.expected, r.ok ? 'KHỚP' : 'LỆCH']);
  const w = head.map((h, i) => Math.max(width(h), ...body.map((b) => width(b[i]))));
  const line = (cells) => cells.map((c, i) => c + ' '.repeat(w[i] - width(c))).join(' │ ');
  console.log(title);
  console.log(line(head));
  console.log(w.map((n) => '─'.repeat(n)).join('─┼─'));
  for (const b of body) console.log(line(b));
  console.log('');
  if (result.conflicts.length) {
    console.log('Cổng trùng / trùng cổng lõi / dải dành riêng:');
    for (const c of result.conflicts) console.log(`  ${c.kind}: ${c.text}`);
    console.log('');
  }
  for (const n of result.notes) console.log(`Ghi chú: ${n}`);
  console.log(`Tổng: ${result.rows.length} dòng · KHỚP ${result.rows.length - result.bad} · LỆCH ${result.bad} · XUNG ĐỘT CỔNG ${result.conflicts.length}`);
  console.log(passed(result) ? 'KẾT QUẢ: đạt — mọi dòng KHỚP, không trùng cổng.' : 'KẾT QUẢ: KHÔNG ĐẠT — có dòng LỆCH hoặc cổng trùng (xem trên).');
}

// ════════════════════════════════════════════════════════════════════════════
// 5. TỰ KIỂM (--selftest): mô hình giả + kho giả trong thư mục tạm
// ════════════════════════════════════════════════════════════════════════════

/**
 * Hàm làm gì: dựng văn bản `app.yaml` của phần mềm giả (cổng theo công thức khối).
 * @param {{code:string, http:number, agent?:boolean, fe?:boolean}} spec `agent: false` ⇒ không khai nhóm agent; `fe: false` ⇒ không khai cổng FE.
 * @returns {string} Chuỗi YAML. Tác dụng phụ: không.
 */
function appYamlOf(spec) {
  const { code, http, agent = true, fe = true } = spec;
  const grp = (name, d) => [`  ${name}:`, `    be_http: ${http + d}`, `    be_https: ${http + d + 1}`, ...(fe ? [`    fe: ${http + d - 800}`] : [])];
  return [
    `code: ${code}`, `sso_code: ${code.toLowerCase()}`, 'sso_app_id: 6', `display_name: PM ${code}`, 'module_prefix: App.Modules.', `host_project: App.Api.${code}`, 'config_key: Main',
    'paths:', `  be: src/Apps/${code}/BE`, `  fe: src/Apps/${code}/FE`, `  api: src/Apps/${code}/BE/App.Api.${code}`, `  modules: src/Apps/${code}/BE/Modules`,
    `  tests: src/Apps/${code}/BE/Tests/App.Tests.${code}`, `  contracts: src/Apps/${code}/_contracts`, '  session: null',
    'ports:', ...grp('dev', 0), ...(agent ? grp('agent', AGENT_OFFSET) : []), '',
  ].join('\n');
}

/**
 * Hàm làm gì: dựng văn bản tài liệu cổng giả (có mục 1, mục 2 với bảng, mục 3 chứa một bảng KHÔNG thuộc mục 2) cho danh sách phần mềm giả.
 * @param {{code:string, http:number, agent?:boolean, fe?:boolean}[]} specs Danh sách phần mềm giả. @returns {string} Nội dung markdown. Tác dụng phụ: không.
 */
function docTextOf(specs) {
  const cell = (v) => (v === null ? '—' : String(v));
  const rows = specs.flatMap(({ code, http, agent = true, fe = true }) => [
    `| ${code} — máy coder | ${http} | ${http + 1} | ${cell(fe ? http - 800 : null)} | \`${code.toLowerCase()}.dev.localhost\` | giả |`,
    ...(agent ? [`| ${code} — stack agent | ${http + 10} | ${http + 11} | ${cell(fe ? http - 790 : null)} | — | giả |`] : []),
  ]);
  return ['# Bảng cổng dev (tài liệu giả)', '', '## 1. Quy tắc', '', 'Văn bản giả.', '', '## 2. Bảng cổng', '',
    '| Thành phần | BE http | BE https | FE (Angular) | Tên miền dev | Ghi chú |', '|---|---|---|---|---|---|', ...rows, '', '## 3. Khác', '', '| a | 1 | 2 | 3 | 4 |', ''].join('\n');
}

/**
 * Hàm làm gì: dựng văn bản launchSettings.json giả (JSON CÓ chú thích, như tệp thật) cho một phần mềm.
 * @param {{code:string, http:number, agent?:boolean, fe?:boolean}} spec Phần mềm giả. @returns {string} JSON-có-chú-thích. Tác dụng phụ: không.
 */
function launchTextOf({ code, http, agent = true, fe = true }) {
  const agentProfile = agent
    ? `,\n    "App.Api.${code}.Agent": { "commandName": "Project", "environmentVariables": { "ASPNETCORE_ENVIRONMENT": "Development"${fe ? `, "ApiSettings__UseCors": "http://localhost:${http - 790}"` : ''} }, "applicationUrl": "https://localhost:${http + 11};http://localhost:${http + 10}" }`
    : '';
  return `{\n  // tệp giả có chú thích\n  "profiles": {\n    "App.Api.${code}": { "commandName": "Project", "launchUrl": "http://x//y", "applicationUrl": "https://localhost:${http + 1};http://localhost:${http}" }${agentProfile}\n  },\n  "$schema": "http://json.schemastore.org/launchsettings.json"\n}\n`;
}

/**
 * Hàm làm gì: dựng văn bản angular.json giả — một project có `serve` (cổng development + agent) và một project thư viện KHÔNG có `serve`.
 * @param {{http:number, agent?:boolean}} spec Phần mềm giả. @returns {string} JSON. Tác dụng phụ: không.
 */
function angularTextOf({ http, agent = true }) {
  const configurations = { development: { port: http - 800, ssl: true }, ...(agent ? { agent: { port: http - 790 } } : {}) };
  return JSON.stringify({ projects: { app: { architect: { build: {}, serve: { configurations, defaultConfiguration: 'development' } } }, lib: { architect: { build: {} } } } }, null, 2);
}

/**
 * Hàm làm gì: dựng văn bản environment*.ts giả (có một dòng baseApiUrl bị chú thích làm mồi nhử đứng TRƯỚC dòng thật).
 * @param {number} httpsPort Cổng https mong đợi. @returns {string} TypeScript. Tác dụng phụ: không.
 */
function envTextOf(httpsPort) {
  return `export const environment = {\n  production: false,\n  // baseApiUrl: 'https://localhost:1',\n  baseApiUrl: 'https://localhost:${httpsPort}',\n};\n`;
}

/**
 * Hàm làm gì: dựng MÔ HÌNH giả hoàn toàn nhất quán (mọi nguồn khớp app.yaml) cho danh sách phần mềm giả — nền của các ca thuận / ca phá.
 * @param {{code:string, http:number, agent?:boolean, fe?:boolean}[]} specs Danh sách phần mềm giả.
 * @returns {ReturnType<typeof loadModel>} Mô hình (đối tượng mới mỗi lần gọi — ca phá được sửa thẳng trên đó). Tác dụng phụ: không.
 */
export function synthModel(specs) {
  const f = (rel, text) => ({ rel, text });
  return {
    doc: f(DOC_FILE, docTextOf(specs)),
    apps: specs.map((s) => {
      const { code, http, agent = true, fe = true } = s;
      const grp = (d) => ({ be_http: http + d, be_https: http + d + 1, ...(fe ? { fe: http + d - 800 } : {}) });
      return {
        code, hostProject: `App.Api.${code}`, ports: { dev: grp(0), ...(agent ? { agent: grp(AGENT_OFFSET) } : {}) }, feDirExists: fe,
        launch: f(`src/Apps/${code}/BE/App.Api.${code}/Properties/launchSettings.json`, launchTextOf(s)),
        angular: f(`src/Apps/${code}/FE/angular.json`, fe ? angularTextOf(s) : null),
        envDev: f(`src/Apps/${code}/FE/src/environments/environment.ts`, fe ? envTextOf(http + 1) : null),
        envAgent: f(`src/Apps/${code}/FE/src/environments/environment.agent.ts`, fe && agent ? envTextOf(http + 11) : null),
      };
    }),
  };
}

/**
 * Hàm làm gì: ghi một kho giả (bố cục kho gộp `src/Apps/<Mã>/…`) ra thư mục `root` theo danh sách phần mềm giả — để thử đường nạp từ đĩa ({@link loadModel}) và dòng lệnh.
 * @param {string} root Thư mục gốc kho giả (tạo nếu chưa có). @param {{code:string, http:number, agent?:boolean, fe?:boolean}[]} specs Danh sách phần mềm giả.
 * @returns {void} Tác dụng phụ: ghi đĩa trong `root`.
 */
function writeFakeRepo(root, specs) {
  /** Hàm làm gì: ghi tệp `rel` (tạo thư mục cha) dưới `root`. Tác dụng phụ: ghi đĩa. */
  const put = (rel, text) => { const p = path.join(root, rel); fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, text); };
  put(DOC_FILE, docTextOf(specs));
  for (const s of specs) {
    const { code, http, agent = true, fe = true } = s;
    put(`src/Apps/${code}/app.yaml`, appYamlOf(s));
    put(`src/Apps/${code}/BE/App.Api.${code}/Properties/launchSettings.json`, launchTextOf(s));
    if (fe) {
      put(`src/Apps/${code}/FE/angular.json`, angularTextOf(s));
      put(`src/Apps/${code}/FE/src/environments/environment.ts`, envTextOf(http + 1));
      if (agent) put(`src/Apps/${code}/FE/src/environments/environment.agent.ts`, envTextOf(http + 11));
    } else fs.mkdirSync(path.join(root, `src/Apps/${code}/FE`), { recursive: true });
  }
}

/**
 * Hàm làm gì: tự kiểm — ca thuận + ca phá trên mô hình giả (bộ nhớ) và trên kho giả ở thư mục tạm (nạp từ đĩa + dòng lệnh). Mỗi ca phá PHẢI đỏ đúng chỗ.
 * Không đọc phần mềm thật nào của dự án.
 * @returns {number} Số ca sai (0 = đạt). Tác dụng phụ: tạo / xoá thư mục tạm; sinh tiến trình con ngắn; in từng ca ra stdout.
 */
export function selftest() {
  let bad = 0;
  /** Hàm làm gì: ghi kết quả MỘT ca (in OK / BAD). Tác dụng phụ: tăng `bad` khi sai, in ra stdout. */
  const ok = (name, cond, extra = '') => { if (!cond) bad++; console.log(`${cond ? 'OK  ' : 'BAD '}${name}${cond || !extra ? '' : '  ← ' + extra}`); };
  /** Hàm làm gì: gom các vấn đề (dòng LỆCH + xung đột) của một kết quả thành một chuỗi để tìm chữ. */
  const problems = (r) => [...r.rows.filter((x) => !x.ok).map((x) => `${x.component} | ${x.source} | ${x.actual} | ${x.expected}`), ...r.conflicts.map((c) => `${c.kind}: ${c.text}`)].join('\n');
  const base = () => [{ code: 'ZED', http: 5400 }, { code: 'YAK', http: 5500 }];
  /** Hàm làm gì: ca THUẬN — mô hình `model` phải ĐẠT. */
  const green = (name, model, expectNote) => { const r = checkModel(model); ok(name, passed(r) && (!expectNote || r.notes.some((n) => n.includes(expectNote))), problems(r) || `ghi chú: ${r.notes.join(' | ')}`); };
  /** Hàm làm gì: ca PHÁ — sửa mô hình mới dựng bằng `mutate`, kết quả PHẢI không đạt và nội dung vấn đề chứa `text`. */
  const red = (name, mutate, text, specs = base()) => { const m = synthModel(specs); mutate(m); const r = checkModel(m); ok(name, !passed(r) && problems(r).includes(text), problems(r) || 'không có vấn đề nào (đạt)'); };
  const app = (m, code = 'ZED') => m.apps.find((a) => a.code === code);

  // ── ca thuận ──
  green('thuan: hai phần mềm giả nhất quán (cổng · bảng · launchSettings · angular.json · environment) ⇒ đạt', synthModel(base()));
  green('thuan: phần mềm KHÔNG khai nhóm agent ⇒ đạt, ghi chú bỏ qua kiểm agent', synthModel([{ code: 'ZED', http: 5400, agent: false }]), 'không khai ports.agent');
  green('thuan: phần mềm không có FE (không cổng FE, không angular.json / environment) ⇒ đạt, ghi chú bỏ qua', synthModel([{ code: 'ZED', http: 5400, fe: false }]), 'không có');
  green('thuan: thiếu angular.json + environment*.ts (tuỳ chọn) ⇒ đạt, có ghi chú', (() => { const m = synthModel(base()); for (const a of m.apps) { a.angular.text = null; a.envDev.text = null; a.envAgent.text = null; } return m; })(), 'bỏ qua');
  green('thuan: angular.json không khai port ở development nhưng fe dev = 4200 (mặc định Angular) ⇒ đạt', (() => { const m = synthModel([{ code: 'ZED', http: 5000 }]); app(m).angular.text = JSON.stringify({ projects: { app: { architect: { serve: { configurations: { development: { ssl: true } } } } } } }); return m; })());

  // ── (a) công thức khối ──
  red('phá: be_http không chia hết cho 10 (5405) ⇒ LỆCH quy tắc', (m) => { app(m).ports.dev.be_http = 5405; }, 'không chia hết cho 10');
  red('phá: be_https ≠ be_http + 1 ⇒ LỆCH quy tắc', (m) => { app(m).ports.dev.be_https = 5402; }, 'be_https 5402 ≠ be_http + 1');
  red('phá: fe ≠ be_http − 800 ⇒ LỆCH quy tắc', (m) => { app(m).ports.dev.fe = 4601; }, 'fe 4601 ≠ be_http − 800');
  red('phá: nhóm agent ≠ dev + 10 ⇒ LỆCH', (m) => { app(m).ports.agent.be_http = 5420; app(m).ports.agent.be_https = 5421; }, 'agent.be_http');
  red('phá: thiếu be_https ở nhóm dev ⇒ LỆCH', (m) => { delete app(m).ports.dev.be_https; }, 'thiếu be_https');
  red('phá: thiếu nhóm ports.dev ⇒ ĐỎ (bắt buộc)', (m) => { delete app(m).ports.dev; }, 'ports.dev');
  red('phá: phần mềm không khai ports nào ⇒ ĐỎ', (m) => { app(m).ports = null; }, 'ports.dev');

  // ── (b) trùng cổng ──
  red('phá: hai phần mềm TRÙNG cổng (agent.fe của YAK = dev.fe của ZED) ⇒ TRÙNG', (m) => { app(m, 'YAK').ports.agent.fe = 4600; }, 'TRÙNG: cổng 4600');
  red('phá: cổng FE của phần mềm này trùng cổng BE của phần mềm kia ⇒ TRÙNG', (m) => { app(m, 'YAK').ports.dev.fe = 5401; }, 'cổng 5401');
  red('phá: trùng cổng CỐ ĐỊNH của SSO (be_http 5100 ⇒ cả khối trùng) ⇒ TRÙNG CỔNG LÕI', (m) => { const a = app(m); a.ports = { dev: { be_http: 5100, be_https: 5101, fe: 4300 }, agent: { be_http: 5110, be_https: 5111, fe: 4310 } }; }, 'TRÙNG CỔNG LÕI: cổng 5100');
  red('phá: trùng cổng gateway (5201) ⇒ TRÙNG CỔNG LÕI', (m) => { app(m).ports.dev.be_https = 5201; }, 'cổng CỐ ĐỊNH của API gateway');
  red('phá: trùng cổng File API (5601) ⇒ TRÙNG CỔNG LÕI', (m) => { app(m).ports.dev.be_https = 5601; }, 'File API');
  red('phá: trùng cổng mini-rp (5300) ⇒ TRÙNG CỔNG LÕI', (m) => { app(m).ports.dev.fe = 5300; }, 'mini-rp');
  red('phá: cổng trong dải dành riêng 8000–8999 ⇒ DẢI DÀNH RIÊNG', (m) => { app(m).ports.dev.be_https = 8081; }, 'DẢI DÀNH RIÊNG: cổng 8081');
  red('phá: cổng trong dải dành riêng 9900–9999 ⇒ DẢI DÀNH RIÊNG', (m) => { app(m).ports.agent.fe = 9950; }, 'DẢI DÀNH RIÊNG: cổng 9950');
  red('phá: nhóm lạ (linked) khai cổng trùng phần mềm khác ⇒ TRÙNG (nhóm lạ vẫn kiểm trùng)', (m) => { app(m).ports.linked = { be_https: 5501 }; }, 'cổng 5501');

  // ── (c) bảng tài liệu ──
  red('phá: thiếu hàng «YAK — stack agent» của bảng ⇒ LỆCH THIẾU hàng', (m) => { m.doc.text = m.doc.text.split('\n').filter((l) => !l.startsWith('| YAK — stack agent')).join('\n'); }, 'THIẾU hàng');
  red('phá: thiếu hàng «ZED — máy coder» của bảng ⇒ LỆCH', (m) => { m.doc.text = m.doc.text.split('\n').filter((l) => !l.startsWith('| ZED — máy coder')).join('\n'); }, 'có hàng «ZED — máy coder»');
  red('phá: ô BE https của bảng lệch app.yaml ⇒ LỆCH', (m) => { m.doc.text = m.doc.text.replace('| ZED — máy coder | 5400 | 5401 |', '| ZED — máy coder | 5400 | 5402 |'); }, 'BE https');
  red('phá: ô FE của bảng là «—» trong khi app.yaml có FE ⇒ LỆCH', (m) => { m.doc.text = m.doc.text.replace('| 4600 |', '| — |'); }, 'FE');
  red('phá: bảng nằm ngoài mục «## 2.» (đổi tiêu đề mục) ⇒ ĐỎ không thấy bảng', (m) => { m.doc.text = m.doc.text.replace('## 2. Bảng cổng', '## 9. Bảng cổng'); }, 'KHÔNG thấy bảng');
  red('phá: thiếu hẳn tệp tài liệu cổng ⇒ ĐỎ', (m) => { m.doc.text = null; }, 'THIẾU tệp');

  // ── (d) launchSettings.json ──
  red('phá: thiếu launchSettings.json (bắt buộc) ⇒ ĐỎ', (m) => { app(m).launch.text = null; }, 'launchSettings.json (bắt buộc)');
  red('phá: launchSettings.json không phải JSON ⇒ ĐỎ', (m) => { app(m).launch.text = '{ không phải json'; }, 'không phải JSON');
  red('phá: applicationUrl lệch cổng https ⇒ LỆCH', (m) => { app(m).launch.text = app(m).launch.text.replace('https://localhost:5401;', 'https://localhost:5999;'); }, 'applicationUrl');
  red('phá: thiếu hồ sơ App.Api.<Mã> ⇒ LỆCH', (m) => { app(m).launch.text = app(m).launch.text.replace('"App.Api.ZED":', '"Ten.Khac":'); }, 'THIẾU hồ sơ');
  red('phá: thiếu hồ sơ App.Api.<Mã>.Agent ⇒ LỆCH', (m) => { app(m).launch.text = app(m).launch.text.replace('"App.Api.ZED.Agent":', '"Ten.Khac":'); }, 'ZED.Agent');
  red('phá: applicationUrl của hồ sơ Agent lệch ⇒ LỆCH', (m) => { app(m).launch.text = app(m).launch.text.replace('http://localhost:5410', 'http://localhost:5411'); }, 'ZED.Agent.applicationUrl');
  red('phá: ApiSettings__UseCors của hồ sơ Agent lệch fe agent ⇒ LỆCH', (m) => { app(m).launch.text = app(m).launch.text.replace('"http://localhost:4610"', '"http://localhost:4200"'); }, 'ApiSettings__UseCors');

  // ── (e) angular.json ──
  red('phá: serve.development.port lệch fe dev ⇒ LỆCH', (m) => { app(m).angular.text = app(m).angular.text.replace('"port": 4600', '"port": 4601'); }, 'serve.development.port');
  red('phá: angular.json không khai port mà fe dev ≠ 4200 (mặc định Angular) ⇒ LỆCH', (m) => { app(m).angular.text = JSON.stringify({ projects: { app: { architect: { serve: { configurations: { development: { ssl: true } } } } } } }); }, 'mặc định Angular');
  red('phá: serve.agent.port lệch fe agent ⇒ LỆCH', (m) => { app(m).angular.text = app(m).angular.text.replace('"port": 4610', '"port": 4611'); }, 'serve.agent.port');
  red('phá: angular.json không phải JSON ⇒ ĐỎ', (m) => { app(m).angular.text = '[[[ hỏng'; }, 'không phải JSON');

  // ── (f) environment*.ts ──
  red('phá: baseApiUrl của environment.ts lệch be_https ⇒ LỆCH', (m) => { app(m).envDev.text = envTextOf(5999); }, 'environment.ts · baseApiUrl');
  red('phá: baseApiUrl của environment.agent.ts lệch be_https agent ⇒ LỆCH', (m) => { app(m).envAgent.text = envTextOf(5401); }, 'environment.agent.ts · baseApiUrl');
  red('phá: environment.ts có mà KHÔNG có dòng baseApiUrl (chỉ dòng chú thích) ⇒ LỆCH', (m) => { app(m).envDev.text = "export const environment = {\n  // baseApiUrl: 'https://localhost:5401',\n};\n"; }, 'THIẾU dòng baseApiUrl');
  red('phá: baseApiUrl không phải địa chỉ tuyệt đối ⇒ LỆCH', (m) => { app(m).envDev.text = "export const environment = { baseApiUrl: '/api' };\n"; }, 'không phải địa chỉ tuyệt đối');

  // ── nạp từ đĩa + dòng lệnh ──
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'check-ports-'));
  try {
    const good = path.join(tmp, 'good');
    writeFakeRepo(good, base());
    const fromDisk = checkModel(loadModel(good));
    ok('thuan: kho giả ghi ra đĩa (kho gộp) ⇒ loadModel + checkModel đạt, đủ 2 phần mềm', passed(fromDisk) && loadModel(good).apps.length === 2, problems(fromDisk));
    const cli = (...args) => spawnSync(process.execPath, [fileURLToPath(import.meta.url), ...args], { encoding: 'utf8' });
    ok('thuan: CLI --root <kho giả đạt> ⇒ mã thoát 0 và in «KẾT QUẢ: đạt»', (() => { const r = cli('--root', good); return r.status === 0 && /KẾT QUẢ: đạt/.test(r.stdout); })());
    const broken = path.join(tmp, 'broken');
    writeFakeRepo(broken, base());
    const lsFile = path.join(broken, 'src/Apps/ZED/BE/App.Api.ZED/Properties/launchSettings.json');
    fs.writeFileSync(lsFile, fs.readFileSync(lsFile, 'utf8').replace('https://localhost:5401;', 'https://localhost:5999;'));
    ok('phá: sửa launchSettings.json THẬT trên đĩa ⇒ checkModel đỏ và CLI thoát 1', (() => { const r = cli('--root', broken); return !passed(checkModel(loadModel(broken))) && r.status === 1 && /KHÔNG ĐẠT/.test(r.stdout); })());
    fs.rmSync(path.join(broken, DOC_FILE));
    ok('phá: xoá tệp bảng cổng THẬT trên đĩa ⇒ đỏ (thiếu tệp bắt buộc)', !passed(checkModel(loadModel(broken))));
    const empty = path.join(tmp, 'empty');
    fs.mkdirSync(path.join(empty, 'src/Apps'), { recursive: true });
    ok('phá: kho không có phần mềm nào ⇒ CLI thoát 1 (không báo đạt)', cli('--root', empty).status === 1);
    ok('phá: tham số lạ ⇒ mã thoát 2', cli('--khong-co-tham-so-nay').status === 2);
    ok('phá: --root thiếu giá trị ⇒ mã thoát 2', cli('--root').status === 2);
    ok('thuan: CLI --json in JSON có rows / conflicts / notes / bad', (() => { const r = cli('--root', good, '--json'); try { const j = JSON.parse(r.stdout); return r.status === 0 && Array.isArray(j.rows) && Array.isArray(j.conflicts) && Array.isArray(j.notes) && j.bad === 0; } catch { return false; } })());
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
    console.log(`(đã dọn thư mục tạm: ${fs.existsSync(tmp) ? 'CHƯA' : 'rồi'})`);
  }
  console.log(bad ? `${bad} ca SAI` : 'check-ports selftest: mọi ca phá đều đỏ đúng chỗ, ca thuận xanh');
  return bad;
}

// ════════════════════════════════════════════════════════════════════════════
// 6. DÒNG LỆNH
// ════════════════════════════════════════════════════════════════════════════

/**
 * Hàm làm gì: điểm vào dòng lệnh — phân tích tham số, chạy selftest hoặc kiểm thật.
 * @param {string[]} argv Đối số sau tên tệp: `--root <dir>`, `--json`, `--selftest`, `--help`.
 * @returns {number} Mã thoát: 0 đạt · 1 không đạt / không đọc được hồ sơ phần mềm / selftest sai · 2 tham số sai. Tác dụng phụ: in báo cáo ra stdout / stderr.
 */
export function main(argv) {
  if (argv.includes('--help') || argv.includes('-h')) { console.log('Dùng: node scripts/check-ports.mjs [--root <gốc kho>] [--json] | --selftest'); return 0; }
  let root = null;
  let json = false;
  let doSelftest = false;
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--selftest') doSelftest = true;
    else if (argv[i] === '--json') json = true;
    else if (argv[i] === '--root') {
      const v = argv[i + 1];
      if (!v || v.startsWith('--')) { console.error('--root cần một đường dẫn'); return 2; }
      root = path.resolve(v);
      i++;
    } else { console.error(`Tham số lạ: ${argv[i]} (xem --help)`); return 2; }
  }
  if (doSelftest) return selftest() ? 1 : 0;
  const repoRoot = root ?? path.resolve(findRepoRoot(HERE) ?? path.join(HERE, '..'));
  let result;
  try { result = checkModel(loadModel(repoRoot)); }
  catch (e) {
    if (!(e instanceof AppsError)) throw e;
    console.error(`check-ports: không đọc được hồ sơ phần mềm — ${e.message}`);
    for (const p of e.problems.slice(0, 20)) console.error('  - ' + p);
    console.error('Chạy `node scripts/check-apps.mjs` để xem chi tiết.');
    return 1;
  }
  if (json) console.log(JSON.stringify({ root: repoRoot, ...result }, null, 2));
  else printReport(result, `Kiểm cổng dev — gốc kho: ${repoRoot}`);
  return passed(result) ? 0 : 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) process.exit(main(process.argv.slice(2)));
