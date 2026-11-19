#!/usr/bin/env node
/**
 * config-sync.mjs — MỘT NGUỒN cho các tệp appsettings.*.json dùng chung giữa SSO và các phần mềm nghiệp vụ của dự án.
 *
 * VÌ SAO CÓ: mỗi phần mềm giữ một bản CHÉP của cùng các tệp cấu hình (Clock, Notification, Alerts, Authorize…) nên sửa một bên rất dễ quên bên kia
 * (đã gặp thật: một phần mềm thiếu khối ForwardedHeaders mà các phần mềm khác có). Công cụ này đặt bản MẪU ở src/Core/Host/PTCore.Host/ConfigTemplates/ (cùng
 * manifest.json phân loại từng tệp) rồi: kiểm lệch (mặc định) · chép bản mẫu vào các phần mềm (--sync).
 *
 * KHÔNG đổi cách nạp cấu hình lúc chạy: mỗi phần mềm vẫn giữ tệp thật trong thư mục API của mình (màn Cấu hình hệ thống sửa
 * được, ContentRoot lúc dev không đổi). Chỉ có cách GIỮ ĐỒNG BỘ là thay đổi.
 *
 * Dùng:
 *   node scripts/config-sync.mjs            kiểm (mã thoát 1 khi lệch / thiếu / tệp chưa xếp loại / tệp đã gỡ còn sót)
 *   node scripts/config-sync.mjs --sync     chép bản mẫu (mode "bytes") vào từng phần mềm; bỏ qua mục knownDrift; SINH các tệp khung host còn THIẾU của phần mềm (scaffold.generate: libman.json · web.config · appsettings.Branding.json từ ConfigTemplates/host/*.template — chỉ tạo tệp chưa có, không ghi đè)
 *   node scripts/config-sync.mjs --sync --dry   chỉ liệt kê việc sẽ làm
 *   node scripts/config-sync.mjs --json     in kết quả dạng JSON
 * Test: node --test scripts/config-sync.test.mjs
 *
 * LUẬT «PHẦN MỀM MỚI KHÔNG ĐƯỢC THIẾU CẤU HÌNH» (coder 2026-11-14: tạo phần mềm mới còn thiếu cấu hình; lõi thêm cấu hình mới thì luật phải sửa). Ngoài kiểm lệch ở trên, evaluate() còn gác năm điểm (khai ở manifest.json, C# ConfigParityTests làm CÙNG luật):
 *   R1 discover    thư mục src/Apps/<Mã>/ có host API (Program.cs) mà chưa khai ở manifest.apps ⇒ ĐỎ (phần mềm mới không đứng ngoài bộ kiểm)
 *   R2 template    tệp appsettings.*.json ở ConfigTemplates mà manifest.shared không khai ⇒ ĐỎ (mẫu mồ côi)
 *   R3 coreLoader  CoreProgram.cs nạp tệp cấu hình mà manifest chưa xếp loại ⇒ ĐỎ; tệp đã xếp loại mà lõi không nạp nữa ⇒ ĐỎ  (LÕI ĐỔI ⇒ LUẬT PHẢI ĐỔI)
 *   R4 scaffold    mỗi phần mềm nghiệp vụ phải có tệp host bắt buộc (libman.json · web.config), Program.cs khai HostDeployment, và có mặt ở dev-stack · smoke-stack · gateway (thiếu đã biết = knownGap, vàng)
 *   R5 envKeys     khoá env mà SecretsValidator.cs nhắc phải có ở .env.example gốc kho (LÕI THÊM KHOÁ ⇒ MẪU + LUẬT PHẢI ĐỔI)
 *   R6 envExample  .env.example của MỖI phần mềm nghiệp vụ phải có ĐỦ bộ khoá của mẫu chuẩn ConfigTemplates/env/app.env.example (thiếu = ĐỎ; khoá riêng của một phần mềm khai ở appOnly; khoá phần mềm tự thêm mà mẫu chưa có = ĐỎ).
 *                  Thêm / bỏ khoá: sửa MẪU rồi `--sync` (bổ sung khoá còn thiếu vào từng phần mềm; phần mềm MỚI thì sinh cả tệp từ mẫu) — không phải nhớ sửa từng nơi (coder 2026-11-17: «cứ thiếu này rồi thiếu kia rất mất thời gian»).
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { parseJsonc } from './lib/jsonc.mjs';
import { L, P, apps as projectApps, isKnownRoot } from './lib/workspace.mjs';

/** Gốc kho mã (thư mục chứa scripts/) = thư mục DỰ ÁN ở bố cục tách. */
const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
/** Thư mục bản mẫu + manifest của LÕI, đường dẫn logic tính từ gốc kho. */
export const TEMPLATE_DIR = 'src/Core/Host/PTCore.Host/ConfigTemplates';
/** Manifest BỔ SUNG của dự án (phần mềm nghiệp vụ của dự án), đường dẫn logic tính từ gốc kho — xem {@link mergeManifest}. */
export const OVERLAY_FILE = 'services-config/config-manifest.json';

/**
 * Chuẩn hoá nội dung tệp để so sánh: bỏ BOM, đổi CRLF/CR thành LF, bỏ khoảng trắng cuối tệp.
 * Dùng để CRLF/LF hoặc BOM khác nhau giữa các máy không bị tính là lệch.
 * @param {string} text nội dung tệp
 * @returns {string} nội dung đã chuẩn hoá
 */
export function normalize(text) {
  return text.replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n').replace(/\s+$/, '') + '\n';
}

/** Khoá cấp trên được phép trong manifest bổ sung của dự án (khoá lạ là lỗi — gõ nhầm tên thì không được lặng lẽ bỏ qua). */
const OVERLAY_KEYS = new Set(['_doc', 'apps', 'shared', 'perApp', 'scaffold', 'envExample']);

/**
 * Ghép hai danh sách thành một, KHÔNG trùng; phần tử của `first` đứng trước (thứ tự giữ nguyên như manifest gộp cũ: phần mềm của dự án trước, dịch vụ của lõi sau).
 * @param {string[]} first danh sách đứng trước
 * @param {string[]} second danh sách đứng sau
 * @returns {string[]} danh sách đã ghép
 */
function unionFirst(first, second) {
  return [...first, ...second.filter((x) => !first.includes(x))];
}

/**
 * Hợp manifest của LÕI (mẫu appsettings + luật; chỉ biết SSO) với manifest BỔ SUNG của dự án (phần mềm nghiệp vụ) thành MỘT manifest có đúng hình dạng cũ — nên mọi luật R1–R6 giữ nguyên.
 *   • apps: hợp hai bảng (trùng khoá ⇒ lỗi) · shared: bổ sung chỉ ghi { "<tệp>": { apps?, knownDrift? } }, `apps` ghép TRƯỚC danh sách của lõi, tệp phải CÓ ở shared của lõi ·
 *     perApp: hợp (trùng khoá ⇒ lỗi) · scaffold: appliesTo ghép, exempt hợp, registrations nối (của dự án trước) · envExample: appOnly + knownGap hợp.
 *   • Khoá lạ ở cấp trên của bản bổ sung ⇒ lỗi.
 * @param {object} base manifest của lõi (không bị sửa)
 * @param {object|null} overlay manifest bổ sung của dự án; null/undefined ⇒ trả bản sao của `base`
 * @returns {object} manifest đã gộp
 * @throws {Error} khoá lạ, trùng khoá, hoặc `shared` của bản bổ sung khai tệp mà lõi không có
 */
export function mergeManifest(base, overlay) {
  const m = structuredClone(base);
  if (!overlay) return m;
  const unknown = Object.keys(overlay).filter((k) => !OVERLAY_KEYS.has(k));
  if (unknown.length) throw new Error(`manifest bổ sung của dự án có khoá lạ: ${unknown.join(', ')} (chỉ nhận ${[...OVERLAY_KEYS].join(', ')})`);
  /** Hợp hai bảng khoá → giá trị, trùng khoá là lỗi (một phần mềm không được khai ở cả lõi lẫn dự án). */
  const mergeUnique = (what, a, b) => {
    for (const k of Object.keys(b ?? {})) if (k in (a ?? {})) throw new Error(`manifest bổ sung khai ${what} «${k}» mà manifest lõi đã có`);
    return { ...(b ?? {}), ...(a ?? {}) };
  };
  m.apps = mergeUnique('apps', m.apps, overlay.apps);
  m.perApp = mergeUnique('perApp', m.perApp, overlay.perApp);
  for (const [name, o] of Object.entries(overlay.shared ?? {})) {
    const entry = (m.shared ?? []).find((s) => s.name === name);
    if (!entry) throw new Error(`manifest bổ sung khai shared «${name}» nhưng manifest lõi không có mục shared / bản mẫu cho tệp này`);
    entry.apps = unionFirst(o.apps ?? [], entry.apps ?? []);
    if (o.knownDrift) entry.knownDrift = { ...(entry.knownDrift ?? {}), ...o.knownDrift };
  }
  if (overlay.scaffold) {
    const sc = (m.scaffold ??= {});
    sc.appliesTo = unionFirst(overlay.scaffold.appliesTo ?? [], sc.appliesTo ?? []);
    sc.exempt = { ...(sc.exempt ?? {}), ...(overlay.scaffold.exempt ?? {}) };
    sc.registrations = [...(overlay.scaffold.registrations ?? []), ...(sc.registrations ?? [])];
  }
  if (overlay.envExample) {
    const ee = (m.envExample ??= {});
    ee.appOnly = { ...(ee.appOnly ?? {}), ...(overlay.envExample.appOnly ?? {}) };
    ee.knownGap = { ...(ee.knownGap ?? {}), ...(overlay.envExample.knownGap ?? {}) };
  }
  return m;
}

/**
 * Đọc manifest của lõi (ConfigTemplates/manifest.json) và, nếu có, manifest BỔ SUNG của dự án (`services-config/config-manifest.json`) rồi gộp ({@link mergeManifest}).
 * Kho giả của ca phá (gốc lạ) thường chỉ có MỘT manifest đầy đủ ở thư mục mẫu và không có bản bổ sung ⇒ trả đúng manifest đó như trước.
 * @param {string} root gốc kho mã (gốc dự án ⇒ dịch đường dẫn logic theo workspace.json; gốc lạ ⇒ nối thẳng)
 * @returns {object} manifest đã gộp
 * @throws {Error} lõi không có manifest, JSON hỏng, hoặc bản bổ sung sai (xem {@link mergeManifest})
 */
export function loadManifest(root) {
  const read = (file) => JSON.parse(fs.readFileSync(file, 'utf8').replace(/^﻿/, ''));
  const base = read(P(root, TEMPLATE_DIR, 'manifest.json'));
  const overlayFile = P(root, OVERLAY_FILE);
  return mergeManifest(base, fs.existsSync(overlayFile) ? read(overlayFile) : null);
}

/**
 * Làm phẳng một tệp JSON (có chú thích) thành bản đồ "đường:dẫn" → giá trị (dạng chuỗi JSON) để so GIÁ TRỊ, bỏ qua chú thích.
 * @param {string} text nội dung tệp appsettings
 * @returns {Map<string,string>} khoá lá → giá trị
 */
export function leafMap(text) {
  const out = new Map();
  const walk = (o, p) => {
    if (o !== null && typeof o === 'object' && !Array.isArray(o)) { for (const [k, v] of Object.entries(o)) walk(v, p ? `${p}:${k}` : k); return; }
    out.set(p, JSON.stringify(o));
  };
  // .NET (và JsoncFieldEditor của lõi) cho phép chú thích và dấu phẩy thừa trước } ] — parseJsonc (lib/jsonc.mjs) chịu cả hai.
  walk(parseJsonc(text), '');
  return out;
}

/**
 * Liệt kê tên appsettings*.json NẰM NGAY trong thư mục API (không đệ quy; ModuleConfig/ là cấu hình riêng của module nên bỏ qua),
 * trừ các tệp riêng của máy (ignoreLocal).
 * @param {string} dir thư mục API tuyệt đối
 * @param {string[]} ignoreLocal tên tệp bỏ qua
 * @returns {string[]} tên tệp
 */
function listConfigFiles(dir, ignoreLocal) {
  if (!fs.existsSync(dir)) return [];
  const skip = new Set(ignoreLocal.map((n) => n.toLowerCase()));
  return fs.readdirSync(dir).filter((n) => /^appsettings(\..+)?\.json$/i.test(n) && !skip.has(n.toLowerCase())).sort();
}

/**
 * Kiểm toàn bộ: mỗi tệp cấu hình của mỗi phần mềm phải được xếp loại, tệp "bytes" phải giống bản mẫu, tệp "values" phải cùng giá trị,
 * tệp đã gỡ (removed) không được còn, lệch đã biết (knownDrift) báo vàng và phải được dọn khi hết lệch.
 * @param {string} root gốc kho mã
 * @param {object} [manifest] manifest (mặc định đọc từ thư mục mẫu)
 * @returns {{rows: Array<{level:'OK'|'WARN'|'FAIL', app:string, file:string, msg:string}>, fail:number, warn:number}} kết quả
 */
export function evaluate(root, manifest = loadManifest(root)) {
  const rows = [];
  const add = (level, app, file, msg) => rows.push({ level, app, file, msg });
  const dirOf = (app) => P(root, manifest.apps[app]);

  for (const app of Object.keys(manifest.apps)) {
    const present = listConfigFiles(dirOf(app), manifest.ignoreLocal);
    const sharedHere = manifest.shared.filter((s) => s.apps.includes(app)).map((s) => s.name);
    const own = (manifest.perApp[app] ?? []);
    const removed = manifest.removed.map((r) => r.name);
    for (const name of present) {
      if (removed.includes(name)) add('FAIL', app, name, 'tệp ĐÃ GỠ (nội dung nằm ở .env) mà còn trong thư mục — xoá tệp, đừng thêm lại');
      else if (!sharedHere.includes(name) && !own.includes(name))
        add('FAIL', app, name, 'chưa xếp loại: thêm vào manifest.json ở shared (có bản mẫu), perApp (khác theo phần mềm) hoặc removed');
    }
    for (const name of [...sharedHere, ...own]) if (!present.includes(name)) add('FAIL', app, name, 'manifest khai có tệp này nhưng thư mục không có');
  }

  for (const entry of manifest.shared) {
    const drifted = new Set();
    if (entry.mode === 'bytes') {
      const tplPath = P(root, TEMPLATE_DIR, entry.name);
      if (!fs.existsSync(tplPath)) { add('FAIL', '-', entry.name, 'thiếu bản mẫu trong ConfigTemplates'); continue; }
      const tpl = normalize(fs.readFileSync(tplPath, 'utf8'));
      for (const app of entry.apps) {
        const p = path.join(dirOf(app), entry.name);
        if (!fs.existsSync(p)) continue;   // thiếu tệp đã báo ở vòng trên
        if (normalize(fs.readFileSync(p, 'utf8')) !== tpl) drifted.add(app);
      }
    } else {
      const maps = entry.apps.map((app) => [app, fs.existsSync(path.join(dirOf(app), entry.name)) ? leafMap(fs.readFileSync(path.join(dirOf(app), entry.name), 'utf8')) : null]);
      const [, base] = maps[0];
      for (const [app, m] of maps.slice(1)) {
        if (!base || !m) continue;
        const keys = new Set([...base.keys(), ...m.keys()]);
        if ([...keys].some((k) => base.get(k) !== m.get(k))) drifted.add(app);
      }
    }
    for (const app of entry.apps) {
      const known = entry.knownDrift?.[app];
      if (drifted.has(app)) add(known ? 'WARN' : 'FAIL', app, entry.name, known ? `lệch đã biết: ${known}` : `lệch ${entry.mode === 'bytes' ? 'khỏi bản mẫu' : 'giá trị so với ' + entry.apps[0]} — sửa bản mẫu rồi chạy node scripts/config-sync.mjs --sync`);
      else if (known) add('FAIL', app, entry.name, 'đã HẾT lệch nhưng manifest vẫn khai knownDrift — xoá dòng đó');
      else add('OK', app, entry.name, entry.mode);
    }
  }
  evaluateNewSoftwareRules(root, manifest, add);
  return { rows, fail: rows.filter((r) => r.level === 'FAIL').length, warn: rows.filter((r) => r.level === 'WARN').length };
}

/**
 * Đọc tệp văn bản (bỏ BOM) hoặc null khi không có — để các luật R3–R5 không ném lỗi trên kho thiếu tệp.
 * @param {string} p đường dẫn tuyệt đối
 * @returns {string|null} nội dung hoặc null
 */
function readTextOrNull(p) {
  try { return fs.readFileSync(p, 'utf8').replace(/^\uFEFF/, ''); } catch { return null; }
}

/** Biểu thức nhận một dòng khoá env trong .env.example (kể cả dạng chú thích `# KHOÁ=`): `A__B` (nhiều cấp) hoặc `ASPNETCORE_X`. Nhóm 1 = tên khoá. */
const ENV_KEY_LINE = /^#?[ \t]*([A-Z][A-Za-z0-9]*(?:__[A-Za-z0-9_]+)+|ASPNETCORE_[A-Z_]+)=/gm;

/**
 * Tập tên khoá env có trong một .env.example (kể cả khoá nằm trong dòng chú thích `# KHOÁ=`).
 * @param {string} text nội dung tệp
 * @returns {Set<string>} tên khoá
 */
export function envKeysOf(text) {
  return new Set([...text.matchAll(ENV_KEY_LINE)].map((m) => m[1]));
}

/**
 * Các luật R1–R5 «phần mềm mới không được thiếu cấu hình» (xem tiêu đề tệp). Mỗi luật chỉ chạy khi manifest khai mục tương ứng
 * (kho giả trong test không bắt buộc có đủ). KHÔNG ghi gì; chỉ gọi add(mức, phần mềm, tệp, thông điệp).
 * @param {string} root gốc kho mã
 * @param {object} manifest manifest đã parse
 * @param {(level:'OK'|'WARN'|'FAIL', app:string, file:string, msg:string)=>void} add ghi một dòng kết quả
 * @returns {void}
 */
function evaluateNewSoftwareRules(root, manifest, add) {
  // R1 — phát hiện phần mềm mới: mọi src/Apps/<Mã>/<hostDir>/Program.cs phải có <Mã> ở manifest.apps.
  const d = manifest.discover;
  if (d) {
    const appsRoot = P(root, d.appsDir);
    const codes = isKnownRoot(root) ? projectApps().map((a) => a.code).sort()
      : (fs.existsSync(appsRoot) ? fs.readdirSync(appsRoot, { withFileTypes: true }).filter((e) => e.isDirectory()).map((e) => e.name).sort() : []);
    for (const code of codes) {
      const host = P(root, d.appsDir, code, d.hostDir.replaceAll('{code}', code));
      if (fs.existsSync(path.join(host, 'Program.cs')) && !(code in manifest.apps))
        add('FAIL', code, 'manifest.apps', `phần mềm MỚI (có host API ở ${L(root, host) ?? host}) chưa khai trong manifest bổ sung của dự án (services-config/config-manifest.json) / manifest.json: thêm vào "apps", xếp từng tệp appsettings vào shared / perApp, rồi chạy node scripts/config-sync.mjs --sync`);
    }
  }

  // R2 — bản mẫu mồ côi: tệp appsettings.*.json ở ConfigTemplates mà manifest.shared không khai.
  const tplDir = P(root, TEMPLATE_DIR);
  if (fs.existsSync(tplDir)) {
    const declared = new Set(manifest.shared.map((s) => s.name));
    for (const n of fs.readdirSync(tplDir).filter((x) => /^appsettings(\..+)?\.json$/i.test(x)).sort())
      if (!declared.has(n)) add('FAIL', '-', n, 'bản mẫu ở ConfigTemplates mà manifest.shared không khai — khai vào shared hoặc xoá bản mẫu');
  }

  // R3 — lõi nạp tệp cấu hình nào thì manifest phải xếp loại tệp đó (và ngược lại).
  const cl = manifest.coreLoader;
  const coreSrc = cl ? readTextOrNull(P(root, cl.file)) : null;
  if (cl && coreSrc === null) add('FAIL', 'core', cl.file, 'manifest.coreLoader.file không đọc được — sửa đường dẫn');
  if (cl && coreSrc !== null) {
    const loaded = [...new Set([...coreSrc.matchAll(/AddJsonFile\("(appsettings(?:\.[^"]+)?\.json)"/g)].map((m) => m[1]))].sort();
    const own = new Set(Object.values(manifest.perApp).flat());
    const classified = new Set([...manifest.shared.map((s) => s.name), ...own, ...manifest.removed.map((r) => r.name), ...(cl.coreOnly ?? [])]);
    for (const n of loaded)
      if (!classified.has(n)) add('FAIL', 'core', n, `lõi (${path.basename(cl.file)}) nạp tệp này nhưng manifest chưa xếp loại — lõi thêm cấu hình mới thì PHẢI sửa luật: xếp vào shared / perApp / removed / coreOnly và cập nhật các phần mềm`);
    const ignore = new Set(manifest.ignoreLocal.map((x) => x.toLowerCase()));
    for (const n of [...classified].sort())
      if (!loaded.includes(n) && !ignore.has(n.toLowerCase())) add('FAIL', 'core', n, `manifest xếp loại tệp này nhưng lõi (${path.basename(cl.file)}) KHÔNG nạp nữa — cấu hình chết, gỡ khỏi manifest (và khỏi các phần mềm)`);
  }

  // R4 — khung phần mềm nghiệp vụ: tệp host bắt buộc, khai HostDeployment, có mặt ở công cụ dùng chung.
  const sc = manifest.scaffold;
  if (sc) {
    const exempt = sc.exempt ?? {};
    for (const app of Object.keys(manifest.apps))
      if (!sc.appliesTo.includes(app) && !(app in exempt)) add('FAIL', app, 'manifest.scaffold', 'phần mềm ở manifest.apps mà không có trong scaffold.appliesTo (cần đủ khung) hay scaffold.exempt (kèm lý do) — khai một trong hai');
    for (const app of sc.appliesTo) {
      if (!(app in manifest.apps)) { add('FAIL', app, 'manifest.scaffold', 'scaffold.appliesTo có phần mềm không khai ở manifest.apps'); continue; }
      const dir = P(root, manifest.apps[app]);
      for (const f of sc.hostFiles ?? [])
        if (!fs.existsSync(path.join(dir, f))) add('FAIL', app, f, 'khung phần mềm thiếu tệp host này (chép từ khung host của một phần mềm có sẵn rồi đổi tên phần mềm)');
        else add('OK', app, f, 'tệp host');
      const prog = readTextOrNull(path.join(dir, 'Program.cs'));
      for (const needle of sc.programMustContain ?? [])
        if (prog === null || !prog.includes(needle)) add('FAIL', app, 'Program.cs', `thiếu «${needle}» — phần mềm phải KHAI chế độ triển khai trong mã (Program.Deployment)`);
        else add('OK', app, 'Program.cs', needle);
      for (const reg of sc.registrations ?? []) {
        const text = readTextOrNull(P(root, reg.file));
        const needle = reg.needle.replaceAll('{code}', app).toLowerCase();
        const has = text !== null && text.toLowerCase().includes(needle);
        const gap = reg.knownGap?.[app];
        if (has && gap) add('FAIL', app, reg.file, 'đã CÓ mặt nhưng manifest vẫn khai knownGap — xoá dòng đó');
        else if (has) add('OK', app, reg.file, reg.what);
        else if (gap) add('WARN', app, reg.file, `lệch đã biết: ${gap}`);
        else add('FAIL', app, reg.file, `phần mềm chưa được ĐĂNG KÝ ở ${reg.what} (không thấy «${needle}») — thêm mục cho phần mềm, hoặc khai knownGap kèm lý do`);
      }
    }
  }

  // R5 — khoá env mà lõi (SecretsValidator) nhắc phải có ở mẫu .env.example.
  const ek = manifest.envKeys;
  if (ek) {
    const src = readTextOrNull(P(root, ek.source));
    const example = readTextOrNull(P(root, ek.example));
    if (src === null || example === null) add('FAIL', 'core', src === null ? ek.source : ek.example, 'manifest.envKeys trỏ tới tệp không đọc được — sửa đường dẫn');
    else {
      const keys = [...new Set([...src.matchAll(/"([A-Z][A-Za-z0-9]*(?:__[A-Za-z0-9]+)+)"/g)].map((m) => m[1]))].sort();
      const ignore = ek.ignore ?? {};
      for (const k of keys) {
        const inExample = new RegExp(`^#?\\s*${k}=`, 'm').test(example);
        if (inExample && k in ignore) add('FAIL', 'core', k, 'đã CÓ ở mẫu .env.example mà manifest.envKeys.ignore vẫn khai — xoá dòng đó');
        else if (!inExample && !(k in ignore)) add('FAIL', 'core', k, `${path.basename(ek.source)} nhắc khoá này nhưng ${ek.example} chưa có — lõi thêm khoá mới thì PHẢI thêm vào mẫu (kể cả dạng chú thích) hoặc khai ở envKeys.ignore kèm lý do`);
      }
      for (const k of Object.keys(ignore)) if (!keys.includes(k)) add('FAIL', 'core', k, 'envKeys.ignore khai khoá mà SecretsValidator không còn nhắc — xoá dòng đó');
    }
  }

  // R6 — .env.example của mỗi phần mềm nghiệp vụ phải có ĐỦ bộ khoá của mẫu chuẩn; khoá phần mềm tự thêm mà mẫu chưa có cũng ĐỎ (một nguồn).
  const ee = manifest.envExample;
  if (ee) {
    const tpl = readTextOrNull(P(root, TEMPLATE_DIR, ee.template));
    if (tpl === null) add('FAIL', 'core', ee.template, 'manifest.envExample.template không đọc được — sửa đường dẫn');
    else {
      const tplKeys = envKeysOf(tpl);
      const only = Object.entries(ee.appOnly ?? {});
      const onlyApps = (k) => only.find(([prefix]) => k.startsWith(prefix))?.[1];
      for (const app of manifest.scaffold?.appliesTo ?? []) {
        if (!manifest.apps[app]) continue;
        const rel = path.join(manifest.apps[app], ee.file).replace(/\\/g, '/');
        const text = readTextOrNull(P(root, rel));
        if (text === null) { add('FAIL', app, rel, 'phần mềm chưa có .env.example — chạy node scripts/config-sync.mjs --sync (sinh từ mẫu chuẩn)'); continue; }
        const have = envKeysOf(text);
        const gaps = ee.knownGap?.[app] ?? {};
        for (const k of [...tplKeys].sort()) {
          if (have.has(k) && k in gaps) add('FAIL', app, rel, `đã CÓ khoá ${k} mà manifest.envExample.knownGap vẫn khai — xoá dòng đó`);
          else if (!have.has(k) && k in gaps) add('WARN', app, rel, `lệch đã biết: ${k} — ${gaps[k]}`);
          else if (!have.has(k)) add('FAIL', app, rel, `thiếu khoá ${k} so với mẫu chuẩn ${ee.template} — chạy node scripts/config-sync.mjs --sync (bổ sung), hoặc khai envExample.knownGap kèm lý do`);
        }
        for (const k of [...have].sort()) {
          if (tplKeys.has(k)) continue;
          if (onlyApps(k)?.includes(app)) continue;
          add('FAIL', app, rel, `khoá ${k} có ở phần mềm mà mẫu chuẩn chưa có — khoá DÙNG CHUNG thì thêm vào ${ee.template} rồi --sync cho các phần mềm còn lại; khoá RIÊNG thì khai envExample.appOnly (tiền tố → danh sách phần mềm)`);
        }
        for (const [prefix, apps] of only) if (apps.includes(app) && ![...have].some((k) => k.startsWith(prefix))) add('FAIL', app, rel, `appOnly khai ${prefix}* thuộc phần mềm này nhưng .env.example không có khoá nào — bổ sung hoặc bỏ khỏi appOnly`);
      }
    }
  }

}

/**
 * Đọc `display_name` của một phần mềm từ src/Apps/<Mã>/app.yaml (đọc tối giản bằng biểu thức chính quy — đủ cho khoá một dòng).
 * @param {string} root gốc kho mã
 * @param {string} app mã phần mềm
 * @returns {string|null} tên hiển thị, hoặc null khi không có app.yaml / không khai
 */
function readDisplayName(root, app) {
  const text = readTextOrNull(P(root, 'src/Apps', app, 'app.yaml'));
  const m = text?.match(/^display_name:[ \t]*(.+?)[ \t]*(?:#.*)?$/m);
  return m ? m[1].replace(/^(["'])(.*)\1$/, '$2') : null;   // chỉ bỏ cặp nháy BAO CẢ giá trị
}

/**
 * SINH tệp khung host còn thiếu cho các phần mềm ở scaffold.appliesTo (khai ở scaffold.generate: {file, template}).
 * Thay {{App}} = mã phần mềm, {{AppName}} = display_name trong app.yaml (không có thì dùng mã), {{ShortName}} = mã. CHỈ tạo tệp chưa có — không bao giờ ghi đè.
 * @param {string} root gốc kho mã
 * @param {object} manifest manifest đã parse
 * @param {{dry?:boolean}} opt dry = chỉ liệt kê
 * @returns {string[]} các tệp đã (hoặc sẽ) được tạo
 */
function generateScaffold(root, manifest, opt) {
  const sc = manifest.scaffold;
  const written = [];
  if (!sc?.generate) return written;
  for (const app of sc.appliesTo) {
    if (!manifest.apps[app]) continue;
    const dir = P(root, manifest.apps[app]);
    if (!fs.existsSync(dir)) continue;
    for (const g of sc.generate) {
      const dest = path.join(dir, g.file);
      if (fs.existsSync(dest)) continue;
      const tpl = readTextOrNull(P(root, TEMPLATE_DIR, g.template));
      if (tpl === null) continue;   // thiếu mẫu: evaluate() không đòi mẫu, chỉ đòi tệp đích — để người dùng thấy đỏ ở tệp đích
      const text = tpl.replaceAll('{{App}}', app).replaceAll('{{AppName}}', (readDisplayName(root, app) ?? app).replace(/(["\\])/g, '\\$1')).replaceAll('{{ShortName}}', app);
      if (!opt.dry) fs.writeFileSync(dest, text);
      written.push(L(root, dest) ?? dest);
    }
  }
  return written;
}

/**
 * Tách mẫu .env.example thành các «mục»: mỗi khoá kèm khối chú thích liền ngay trên nó (không kèm dòng tiêu đề nhóm `# ── … ──`).
 * @param {string} tpl nội dung mẫu
 * @returns {Map<string,string>} tên khoá → văn bản mục (chú thích + dòng khoá, không xuống dòng cuối)
 */
export function envEntriesOf(tpl) {
  const lines = tpl.replace(/\r\n/g, '\n').split('\n');
  const out = new Map();
  let block = [];
  for (const line of lines) {
    if (line.trim() === '' || /^# ── /.test(line)) { block = []; continue; }
    const m = /^(#?)[ \t]*([A-Z][A-Za-z0-9]*(?:__[A-Za-z0-9_]+)+|ASPNETCORE_[A-Z_]+)=/.exec(line);
    if (m) { out.set(m[2], [...block, line].join('\n')); block = []; } else if (line.startsWith('#')) block.push(line);
  }
  return out;
}

/**
 * Thay chỗ giữ {{App}} · {{app}} · {{AppName}} · {{ShortName}} của mẫu cho MỘT phần mềm.
 * @param {string} root gốc kho mã
 * @param {string} text văn bản mẫu
 * @param {string} app mã phần mềm (khoá ở manifest.apps, vd ZED)
 * @returns {string} văn bản đã thay
 */
function fillEnvTemplate(root, text, app) {
  return text.replaceAll('{{App}}', app).replaceAll('{{app}}', app.toLowerCase()).replaceAll('{{AppName}}', readDisplayName(root, app) ?? app).replaceAll('{{ShortName}}', app);
}

/**
 * R6 — ĐỒNG BỘ bộ khoá .env.example: phần mềm chưa có tệp ⇒ SINH từ mẫu chuẩn; có rồi mà thiếu khoá ⇒ BỔ SUNG khoá thiếu (kèm chú thích) vào CUỐI tệp. KHÔNG sửa / xoá dòng đã có, bỏ qua khoá ở knownGap.
 * @param {string} root gốc kho mã
 * @param {object} manifest manifest đã parse
 * @param {{dry?:boolean}} opt dry = chỉ liệt kê
 * @returns {string[]} các tệp đã (hoặc sẽ) được ghi
 */
function syncEnvExamples(root, manifest, opt) {
  const ee = manifest.envExample;
  const written = [];
  if (!ee) return written;
  const tpl = readTextOrNull(P(root, TEMPLATE_DIR, ee.template));
  if (tpl === null) return written;
  const entries = envEntriesOf(tpl);
  for (const app of manifest.scaffold?.appliesTo ?? []) {
    if (!manifest.apps[app]) continue;
    const dir = P(root, manifest.apps[app]);
    if (!fs.existsSync(dir)) continue;
    const dest = path.join(dir, ee.file);
    const gaps = ee.knownGap?.[app] ?? {};
    let next;
    const existing = readTextOrNull(dest);
    if (existing === null) next = fillEnvTemplate(root, tpl, app);
    else {
      const have = envKeysOf(existing);
      const missing = [...entries.keys()].filter((k) => !have.has(k) && !(k in gaps));
      if (missing.length === 0) continue;
      const eol = existing.includes('\r\n') ? '\r\n' : '\n';
      const block = ['', '# ── Bổ sung từ mẫu chuẩn (node scripts/config-sync.mjs --sync; mẫu: ConfigTemplates/' + ee.template + ') ──', '', ...missing.flatMap((k) => [fillEnvTemplate(root, entries.get(k), app), ''])].join('\n');
      next = existing.replace(/\s+$/, '') + eol + block.replace(/\n/g, eol);
    }
    if (!opt.dry) fs.writeFileSync(dest, next);
    written.push(L(root, dest) ?? dest);
  }
  return written;
}

/**
 * Chép bản mẫu (chỉ mục mode "bytes") vào từng phần mềm; bỏ qua mục knownDrift (chờ coder quyết) và mục "values". Sau đó SINH tệp khung host còn thiếu (generateScaffold), rồi ĐỒNG BỘ bộ khoá .env.example theo mẫu chuẩn (syncEnvExamples, R6).
 * @param {string} root gốc kho mã
 * @param {{dry?:boolean}} [opt] dry = chỉ liệt kê, không ghi
 * @returns {string[]} các tệp đã (hoặc sẽ) được ghi
 */
export function syncAll(root, opt = {}) {
  const manifest = loadManifest(root);
  const written = [];
  for (const entry of manifest.shared) {
    if (entry.mode !== 'bytes') continue;
    const tplText = fs.readFileSync(P(root, TEMPLATE_DIR, entry.name), 'utf8');
    for (const app of entry.apps) {
      if (entry.knownDrift?.[app]) continue;
      const p = path.join(P(root, manifest.apps[app]), entry.name);
      if (fs.existsSync(p) && normalize(fs.readFileSync(p, 'utf8')) === normalize(tplText)) continue;
      if (!opt.dry) fs.writeFileSync(p, tplText);
      written.push(L(root, p) ?? p);
    }
  }
  written.push(...generateScaffold(root, manifest, opt));
  written.push(...syncEnvExamples(root, manifest, opt));
  return written;
}

/** Điểm vào dòng lệnh: phân tích tham số, chạy kiểm hoặc đồng bộ, in bảng kết quả, trả mã thoát (1 khi còn mục đỏ). */
function main() {
  const args = process.argv.slice(2);
  if (args.includes('--sync')) {
    const done = syncAll(REPO_ROOT, { dry: args.includes('--dry') });
    console.log(done.length ? `${args.includes('--dry') ? 'SẼ GHI' : 'ĐÃ GHI'} ${done.length} tệp:\n  ${done.join('\n  ')}` : 'Không có gì để đồng bộ.');
    if (args.includes('--dry')) return 0;
  }
  const r = evaluate(REPO_ROOT);
  if (args.includes('--json')) { console.log(JSON.stringify(r, null, 2)); return r.fail ? 1 : 0; }
  for (const x of r.rows.filter((y) => y.level !== 'OK')) console.log(`${x.level === 'FAIL' ? '✗ ĐỎ  ' : '! VÀNG'} ${x.app.padEnd(5)} ${x.file}: ${x.msg}`);
  const ok = r.rows.filter((y) => y.level === 'OK').length;
  console.log(`config-sync: ${ok} khớp · ${r.warn} lệch đã biết · ${r.fail} lỗi`);
  return r.fail ? 1 : 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) process.exit(main());
