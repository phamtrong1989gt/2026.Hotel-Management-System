#!/usr/bin/env node
// web-config-build — sinh web.config (IIS) kèm CSP dựng TỪ environment.prod.ts.
//   nguồn : web.config (gốc project)          — khung: rewrite rule, staticContent, header khác
//           src/environments/environment.prod.ts — domain thật: API, báo cáo, chatbot (tuỳ chọn — vắng thì không có frame-src chatbot)
//   đích  : src/web.config                     — được angular.json assets đóng vào dist (gitignored)
//
// VNMap: origin ở `vnmap.server` của environment.*.ts tự vào connect-src (tile / font / dữ liệu — SDK + MapLibre tự cài ở assets/vnmap/sdk nên KHÔNG vào script-src / style-src; https; rỗng = không mở gì).
//
// Chạy `npm run webconfig:build` (TỰ chạy qua pre-hook prebuild).
//
// VÌ SAO PHẢI SINH, KHÔNG CHỈ COPY: CSP whitelist domain API, mà environment.prod.ts cũng khai
// đúng domain đó. Hai bản sao của một sự thật thì sớm muộn cũng lệch — và lệch ở đây KHÔNG gây lỗi
// biên dịch, không gây lỗi test: chỉ tới lúc bật enforce trên prod mới thấy app gọi API bị chặn.
// Dựng CSP từ environment ⇒ đổi domain một chỗ, CSP theo sau, không ai phải nhớ.
//
// Cảnh báo lệch: nếu CSP tính ra khác CSP đang nằm trong web.config gốc, script BÁO ĐỘNG chứ không
// im lặng ghi đè — để người sửa biết bản gốc (có thể đang deploy tay lên IIS) đã cũ.

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const TEMPLATE = join(ROOT, 'web.config');
// FE_ENV_FILE (tuỳ chọn): đường dẫn tệp environment dùng THAY environment.prod.ts để dựng CSP — bản build UAT (--configuration uat) đặt biến này tới environment.uat.ts do công cụ triển khai sinh. Không đặt = hành vi cũ.
const ENV_PROD_OVERRIDE = process.env.FE_ENV_FILE ? resolve(process.env.FE_ENV_FILE) : null;
const ENV_PROD = ENV_PROD_OVERRIDE ?? join(ROOT, 'src', 'environments', 'environment.prod.ts');
const ENV_DEV = join(ROOT, 'src', 'environments', 'environment.ts');
const ENV_AGENT = join(ROOT, 'src', 'environments', 'environment.agent.ts');
const ENV_LINKED = join(ROOT, 'src', 'environments', 'environment.linked.ts');   // cấu hình Linked (cổng FE dev của cấu hình serve `linked`)
const ANGULAR_JSON = join(ROOT, 'angular.json');
const OUT = join(ROOT, 'src', 'web.config');

/** Dừng quá trình build vì lỗi cấu hình. Tham số: `msg` nội dung lỗi. Trả về: không bao giờ trở về. Tác dụng phụ: in lỗi và `process.exit(1)`. */
const die = (msg) => { console.error(`[webconfig] ✖ ${msg}`); process.exit(1); };
/** Lỗi khi dựng CSP từ MỘT tệp environment — bản prod: dừng build; vòng canh lệch dev / agent: chỉ cảnh báo (rv10 R13). */
class CspError extends Error {}
/** Báo lỗi dựng CSP từ một tệp environment (nơi gọi quyết định dừng hay chỉ cảnh báo). Tham số: `msg` nội dung. Trả về: không bao giờ trở về. Tác dụng phụ: ném `CspError`. */
const fail = (msg) => { throw new CspError(msg); };

if (!existsSync(TEMPLATE)) die(`không thấy khung ${TEMPLATE}`);
if (!existsSync(ENV_PROD)) die(`không thấy ${ENV_PROD}`);

/**
 * rv10 R10 (2026-10-13): bỏ chú thích `//` và `/* … *\/` NHƯNG biết chuỗi — bản regex trước cắt nhầm URL có `//` không đứng sau `:`, và `/*` nằm
 * trong chuỗi / chú thích dòng nuốt tới khối chú thích cuối tệp ⇒ khoá cspExtraConnectSrc biến mất im lặng (SSO gãy ở máy thật mới lộ).
 */
function stripComments(src) {
  let out = '';
  let q = null;
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    const n = src[i + 1];
    if (q) {
      out += c;
      if (c === '\\') { out += n ?? ''; i++; }
      else if (c === q) q = null;
      continue;
    }
    if (c === '"' || c === "'" || c === '`') { q = c; out += c; continue; }
    if (c === '/' && n === '/') { while (i < src.length && src[i] !== '\n') i++; out += '\n'; continue; }
    if (c === '/' && n === '*') { const end = src.indexOf('*/', i + 2); i = end < 0 ? src.length : end + 1; out += ' '; continue; }
    out += c;
  }
  return out;
}

/** Origin hợp lệ cho CSP: `https://tên-máy[:cổng]` (http chỉ cho localhost / 127.0.0.1 — máy dev). Chặn `;` `,` khoảng trắng… chèn chỉ thị lạ (rv10 R11). */
const ORIGIN_RE = /^https:\/\/[a-z0-9.-]+(:\d{1,5})?$/;
const LOCAL_HTTP_RE = /^http:\/\/(localhost|127\.0\.0\.1)(:\d{1,5})?$/;

/** Dựng chuỗi CSP từ một file environment.*.ts. Lỗi → ném CspError (nơi gọi quyết định dừng hay cảnh báo). */
function buildCsp(envPath, label) {
  const envSrc = stripComments(readFileSync(envPath, 'utf8'));   // mọi lần đọc khoá đều trên mã ĐÃ bỏ chú thích (một cách đọc duy nhất)

  const safeOrigin = (raw, what) => {
    let o;
    try { o = new URL(raw).origin; } catch { fail(`${label}: ${what} = "${raw}" không phải URL`); }
    if (!ORIGIN_RE.test(o) && !LOCAL_HTTP_RE.test(o)) fail(`${label}: ${what} → "${o}" — chỉ nhận https://tên-máy[:cổng] (http chỉ cho localhost)`);
    return o;
  };

  /** Lấy origin (scheme://host[:port]) của một khóa trong environment. */
  const originOf = (key, { optional = false } = {}) => {
    const m = envSrc.match(new RegExp(`\\b${key}\\s*:\\s*['"\`]([^'"\`]+)['"\`]`));
    if (!m) {
      if (optional) return null;
      fail(`${label} thiếu khóa ${key}`);
    }
    const raw = m[1].trim();
    if (!/^https?:\/\//i.test(raw)) {
      // vd baseSteamServerUrl = 'localhost:9999' — không có scheme thì không phải origin dùng được.
      if (optional) return null;
      fail(`${label}: ${key} = "${raw}" không phải URL tuyệt đối, không dựng được nguồn CSP`);
    }
    return safeOrigin(raw, key);
  };

  /** Đọc mảng CHUỖI của một khoá (biết chuỗi, khớp `]` ngoài chuỗi) — phần tử không phải chuỗi / thiếu `]` → lỗi, không lặng lẽ bỏ. */
  const stringArrayOf = (key) => {
    const m = new RegExp(`\\b${key}\\s*:\\s*\\[`).exec(envSrc);
    if (!m) return [];
    const items = [];
    let q = null;
    let cur = '';
    for (let i = m.index + m[0].length; i < envSrc.length; i++) {
      const c = envSrc[i];
      if (q) {
        if (c === '\\') { cur += envSrc[++i] ?? ''; continue; }
        if (c === q) { items.push(cur.trim()); cur = ''; q = null; } else cur += c;
        continue;
      }
      if (c === '"' || c === "'" || c === '`') { q = c; continue; }
      if (c === ']') return items;
      if (!/[\s,]/.test(c)) fail(`${label}: ${key} chỉ được chứa chuỗi URL (gặp "${c}")`);
    }
    fail(`${label}: ${key} thiếu dấu "]"`);
  };

  // VNMap (2026-10-19): máy chủ bản đồ khai ở `vnmap: { server: 'https://…' }` — SDK + MapLibre GL + CSS TỰ CÀI cùng origin (assets/vnmap/sdk) còn tile / font / sprite / tìm kiếm
  // gọi bằng fetch tới máy chủ đó ⇒ origin chỉ vào connect-src (img-src đã có `https:`; KHÔNG vào script-src / style-src). Rỗng / vắng = không mở gì. Chỉ nhận https (http chỉ localhost) như mọi origin khác.
  const vnm = envSrc.match(/\bvnmap\s*:\s*\{[^}]*?\bserver\s*:\s*(['"`])([^'"`]*)\1/);
  const mapOrigin = vnm && vnm[2].trim() ? safeOrigin(vnm[2].trim(), 'vnmap.server') : null;
  const mapSrc = mapOrigin ? [mapOrigin] : [];

  const apiOrigin = originOf('baseApiUrl');
  const reportOrigin = originOf('baseReportUrl');
  // rv5 D-06 (2026-10-12): chatbot là tính năng RIÊNG của từng dự án, không phải của lõi → TUỲ CHỌN. Dự án không có chatbot bỏ khoá
  // chatbotUrl khỏi environment.*.ts thì frame-src chỉ còn 'self' + reCAPTCHA (uniq lọc null), build không dừng ở prebuild nữa.
  const chatbotOrigin = originOf('chatbotUrl', { optional: true });
  const wsOrigin = apiOrigin.replace(/^http/i, 'ws');   // https→wss, http→ws (SignalR)

  // 6.0.0 (CSP CHẶN THẬT — coder chốt 2026-10-12): nguồn connect-src THÊM do người triển khai khai, vd hệ thống danh tính SSO — giao diện tự
  // fetch `.well-known/openid-configuration` + `token_endpoint` (PKCE, sso.util.ts) mà địa chỉ đó nằm ở appsettings.Sso.json của MÁY CHỦ (lúc chạy),
  // bộ sinh không suy ra được. Khoá TUỲ CHỌN: `cspExtraConnectSrc: ['https://id.donvi.gov.vn']` — URL đầy đủ, chỉ lấy ORIGIN (đường dẫn bỏ đi);
  // origin phải là https://tên-máy[:cổng] (http chỉ localhost); `*`, `;`, `${…}`… → dừng build (mở rộng vô tình = mất tác dụng chặn).
  const extraConnect = stringArrayOf('cspExtraConnectSrc').map((v) => safeOrigin(v, 'cspExtraConnectSrc'));
  // CỐ Ý KHÔNG mở (đừng thêm lại — "đừng mở cổng cho mã chết", coder chốt): luồng camera dashboard `baseSteamServerUrl` (ws:// + http://…/hls,
  // cấu hình sót lại, tính năng không chạy) và iframe màn Báo cáo `{baseReportUrl}/Home/Viewer` (máy chủ báo cáo không có trong kho, API không
  // phục vụ đường này, màn không có trong menu seed) — xem chú thích trong khung web.config.

  /** Gộp và bỏ trùng — API và báo cáo thường trỏ cùng một domain. */
  const uniq = (...xs) => [...new Set(xs.filter(Boolean))];

  // Phần TĨNH = nguồn bên thứ ba, không suy ra được từ environment.
  // Phần ĐỘNG = uniq(...) — bám theo environment.
  // Bản đồ = VNMap tự cài trên máy chủ (origin vào qua mapSrc), KHÔNG dùng Google Maps — index.html không nạp SDK
  // Google, không màn nào gọi google.maps ⇒ bỏ maps.googleapis.com / maps.gstatic.com khỏi script-src + connect-src ("đừng mở cổng cho mã chết").
  const RECAPTCHA = ['https://www.google.com/recaptcha/', 'https://www.gstatic.com/recaptcha/'];

  const POLICY = {
    'default-src': ["'self'"],
    // 'unsafe-inline'/'unsafe-eval': Monaco cần. Còn đây thì enforce KHÔNG chặn
    // được script chèn vào DOM — xem ghi chú trong web.config. Siết bằng nonce/hash là việc riêng.
    'script-src': ["'self'", "'unsafe-inline'", "'unsafe-eval'", ...RECAPTCHA],   // SDK VNMap + MapLibre tự cài ở assets/vnmap/sdk ⇒ KHÔNG mở script-src cho máy chủ bản đồ
    // Font icon Material TỰ CÀI (gói npm, nạp ở src/styles.scss) ⇒ bỏ fonts.googleapis.com / fonts.gstatic.com.
    'style-src': ["'self'", "'unsafe-inline'"],
    'font-src': ["'self'", 'data:'],
    'img-src': ["'self'", 'data:', 'blob:', 'https:'],
    // media-src: video sự cố phục vụ từ API, preview từ URL.createObjectURL → blob:.
    // Thiếu directive này là rơi về default-src 'self' ⇒ chặn sạch cả hai.
    'media-src': uniq("'self'", 'blob:', apiOrigin, reportOrigin),
    'connect-src': uniq("'self'", apiOrigin, reportOrigin, wsOrigin, 'https://www.google.com/recaptcha/', ...mapSrc, ...extraConnect),
    'worker-src': ["'self'", 'blob:'],
    'frame-src': uniq("'self'", chatbotOrigin, 'https://www.google.com/recaptcha/'),
    'object-src': ["'none'"],
    'base-uri': ["'self'"],
    // rv10 R9 (2026-10-13): form-action KHÔNG rơi về default-src — thiếu là form POST ra máy lạ đi lọt. Ứng dụng không gửi form tự nhiên ra ngoài
    // (SSO chuyển trang bằng window.location, không form).
    'form-action': ["'self'"],
    'frame-ancestors': ["'none'"],
  };

  return {
    csp: Object.entries(POLICY).map(([k, v]) => `${k} ${v.join(' ')}`).join('; '),
    apiOrigin, chatbotOrigin, extraConnect, mapOrigin, count: Object.keys(POLICY).length,
  };
}

// `node scripts/web-config-build.mjs --print <tệp environment>`: chỉ IN chuỗi CSP tính từ tệp đó (vd dán vào headers của cấu hình serve), không ghi gì.
const printIdx = process.argv.indexOf('--print');
if (printIdx >= 0) {
  const f = process.argv[printIdx + 1];
  if (!f || !existsSync(f)) die('--print cần đường dẫn tệp environment.*.ts có thật');
  try { console.log(buildCsp(f, f).csp); } catch (e) { if (e instanceof CspError) die(e.message); throw e; }
  process.exit(0);
}

let prod;
try { prod = buildCsp(ENV_PROD, ENV_PROD_OVERRIDE ? 'environment.uat.ts (FE_ENV_FILE)' : 'environment.prod.ts'); } catch (e) { if (e instanceof CspError) die(e.message); throw e; }
const csp = prod.csp;

// ── Ghép vào khung ────────────────────────────────────────────────────────────
const template = readFileSync(TEMPLATE, 'utf8');

const HEADER_RE = /(<add\s+name="Content-Security-Policy(?:-Report-Only)?"\s+value=")([^"]*)(")/;
const found = template.match(HEADER_RE);
if (!found) die('không tìm thấy header Content-Security-Policy trong khung web.config');
// 6.0.0 (coder chốt 2026-10-12): bản IIS CHẶN THẬT (header "Content-Security-Policy"). Khung mà lùi về -Report-Only thì cảnh báo to.
const enforce = !/Report-Only/.test(found[0]);
if (!enforce) console.warn('[webconfig] ⚠ khung web.config đang "Content-Security-Policy-Report-Only" — KHÔNG chặn gì; từ 6.0.0 phải là "Content-Security-Policy".');

if (found[2] !== csp) {
  console.warn('[webconfig] ⚠ CSP trong web.config gốc KHÁC bản tính từ environment.prod.ts.');
  console.warn('[webconfig]   Bản sinh (dist) dùng bản tính. Nếu đang deploy TAY file gốc lên IIS,');
  console.warn('[webconfig]   hãy đồng bộ lại nó — nếu không hai nơi sẽ chạy hai chính sách khác nhau.');
}

const banner = `<!-- SINH TỰ ĐỘNG bởi scripts/web-config-build.mjs — ĐỪNG SỬA TAY.
     CSP dựng từ src/environments/environment.prod.ts. Sửa domain ở đó, không sửa ở đây. -->
`;
// Banner đặt SAU dòng <?xml ... ?> (review 2026-10-06 R6-B1): khai báo XML PHẢI đứng đầu tệp — chú thích đặt trước nó làm tệp không còn là
// XML hợp lệ, IIS từ chối cả site (500.19). Bản dist trước đây đã dính.
const body = template.replace(HEADER_RE, `$1${csp}$3`);
const xmlDecl = body.match(/^﻿?<\?xml[^>]*\?>\r?\n/);
const out = xmlDecl ? xmlDecl[0] + banner + body.slice(xmlDecl[0].length) : banner + body;
if (!out.replace(/^\uFEFF/, '').startsWith('<?xml')) die('web.config phải bắt đầu bằng <?xml ... ?> — khung web.config mất dòng khai báo XML?');

writeFileSync(OUT, out, 'utf8');

console.log(`[webconfig] ✓ src/web.config — CSP ${prod.count} directive (${enforce ? 'CHẶN THẬT' : 'chỉ báo — Report-Only'}), nguồn: ${prod.apiOrigin}` +
  (prod.extraConnect.length ? ` + connect-src thêm: ${prod.extraConnect.join(' ')}` : '') +
  (prod.mapOrigin ? ` + VNMap (script/style/connect-src): ${prod.mapOrigin}` : ''));

// ── Canh chừng bản `ng serve` trong angular.json ──────────────────────────────
// `ng serve` KHÔNG đọc web.config (đó là file của IIS), nên muốn gom vi phạm CSP ở máy local thì
// header phải đặt qua option `headers` của dev-server, tức nằm trong angular.json. Đó lại là một
// bản sao thứ hai của cùng một chính sách ⇒ tự canh: tính từ environment tương ứng rồi so.
// Chỉ CẢNH BÁO chứ không tự sửa angular.json — sửa file cấu hình build sau lưng người ta là bẫy.
// 6.0.0: `development` (cổng FE dev của coder) giữ Report-Only — vi phạm chỉ hiện ở Console, không vỡ màn đang làm; `agent` (cổng FE của stack agent, kiểm màn tự
// động) CHẶN THẬT như bản IIS để lượt kiểm thấy đúng cái người dùng thật thấy.
const SERVE_CSP = [
  { cfg: 'development', env: ENV_DEV, header: 'Content-Security-Policy-Report-Only' },
  { cfg: 'agent', env: ENV_AGENT, header: 'Content-Security-Policy' },
  { cfg: 'linked', env: ENV_LINKED, header: 'Content-Security-Policy' },   // cũng CHẶN THẬT để lượt kiểm Chrome thấy đúng cái người dùng thật thấy
];
if (existsSync(ANGULAR_JSON)) {
  const ng = JSON.parse(readFileSync(ANGULAR_JSON, 'utf8'));
  const serveCfgs = ng.projects?.[Object.keys(ng.projects)[0]]?.architect?.serve?.configurations ?? {};
  for (const { cfg, env, header } of SERVE_CSP) {
    if (!existsSync(env) || !serveCfgs[cfg]) continue;
    let want;
    try { want = buildCsp(env, env.split(/[\\/]/).pop()).csp; }
    catch (e) {
      // rv10 R13: tệp dev / agent không vào bản build prod — lỗi ở đó chỉ cảnh báo, không làm đỏ prebuild.
      if (!(e instanceof CspError)) throw e;
      console.warn(`[webconfig] ⚠ không dựng được CSP cho serve.${cfg}: ${e.message}`);
      continue;
    }
    const headers = serveCfgs[cfg].headers ?? {};
    const current = headers[header];
    const wrongName = Object.keys(headers).find((k) => /^Content-Security-Policy/i.test(k) && k !== header);
    if (wrongName) {
      console.warn(`[webconfig] ⚠ angular.json serve.${cfg} đặt "${wrongName}" — phải là "${header}".`);
    } else if (!current) {
      console.warn(`[webconfig] ⚠ angular.json serve.${cfg} chưa đặt CSP ⇒ chạy local KHÔNG gom được vi phạm. Thêm vào headers:`);
      console.warn(`[webconfig]   "${header}": "${want}"`);
    } else if (current !== want) {
      console.warn(`[webconfig] ⚠ CSP serve.${cfg} trong angular.json LỆCH bản tính từ ${env.split(/[\\/]/).pop()}. Bản đúng:`);
      console.warn(`[webconfig]   "${want}"`);
    } else {
      console.log(`[webconfig] ✓ CSP serve.${cfg} trong angular.json khớp ${env.split(/[\\/]/).pop()} (${header})`);
    }
  }
}
