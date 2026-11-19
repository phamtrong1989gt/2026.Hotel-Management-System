// =============================================================================
// check-ui-rules.mjs — GATE "giao diện cân đối, không phô" (11.90).
//
//   Coder nhắc nhiều lần cùng một loại lỗi (font to/nhỏ lệch nhau, màu chói, nút không đều)
//   → những gì grep bắt được thì máy bắt, người chỉ soi bố cục. Luật đầy đủ + lý do: UI-RULES.md.
//
//   Quét code PRODUCTION theo SCOPE bên dưới (modules/ + các màn features/main đã chuẩn hoá), file .scss, .html và .ts (UI-07).
//   KHÔNG soi platform/ui + platform/theme (nơi ĐỊNH NGHĨA token/DS — được phép px/hex) và doc-v3. UI-09 quét toàn src/app.
//
//   Vi phạm CŨ (trước khi có gate) nằm trong ALLOW với `max` — ratchet: KHÔNG thêm mới, giảm dần khi chạm file.
//   Fail (exit 1) khi có vi phạm ngoài ALLOW hoặc vượt `max`. Thuộc chuỗi `npm run check`.
// =============================================================================

import { readFileSync, existsSync, readdirSync, statSync } from '../../../../0.Core/src/Core/FE/tools/fe-overlay-fs.mjs';
import { join } from 'node:path';

// Phạm vi = MODULE chuẩn hoá: lõi (`modules/`) + MỌI module dự án do bộ sinh tạo (`features/main/*`). Vỏ không có sandbox `features/test/*`.
// Quét cả thư mục cha `features/main` (KHÔNG liệt kê từng module: danh sách viết tay sẽ bỏ sót module mới mà gate vẫn báo xanh). Màn khung ngoài phạm vi (landing-page / error / shared) vẫn là nợ riêng —
//   bật thêm 'src/app/features' khi coder quyết.
const SCOPE = [
  'src/app/modules',
  'src/app/features/main',
];

// ── Luật (mỗi luật: regex trên TỪNG DÒNG đã bỏ comment; `skip` = ngoại lệ cấu trúc, không phải miễn trừ) ─────
const RULES = [
  {
    id: 'UI-01', ext: 'scss',
    re: /(^|[^-\w])font\s*:\s*[^;]+;/,
    // `font: inherit` / `font: 14px/1.5 …` xoá sạch size/weight/line-height mà DS (.g-badge, g-button…) đã đặt → chữ to/nhỏ lệch nhau.
    fix: 'đặt từng thuộc tính bằng token: font-size: var(--g-text-*) · font-weight: var(--g-weight-*); reset nút native chỉ `font-family: inherit`',
  },
  {
    id: 'UI-02', ext: 'scss',
    re: /font-size\s*:\s*\d+(\.\d+)?px/,
    // Icon (mat-icon / .*icon*) được phép px — kích thước icon là hình học, không phải thang chữ.
    skip: (line, ctx) => /icon/i.test(line) || /icon/i.test(ctx.selector)
      // hình học icon: font-size == width == height trên cùng dòng (vd .x { font-size: 18px; width: 18px; height: 18px; })
      || (() => {
        const m = line.match(/font-size\s*:\s*(\d+)px/);
        return !!m && new RegExp('width\\s*:\\s*' + m[1] + 'px').test(line) && new RegExp('height\\s*:\\s*' + m[1] + 'px').test(line);
      })(),
    fix: 'thang chữ token: var(--g-text-xs) 12 · --g-text-sm 13 · --g-text-base 14 · --g-text-lg 16 (icon mới được px)',
  },
  {
    id: 'UI-03', ext: 'scss',
    re: /#[0-9a-fA-F]{3}(?:[0-9a-fA-F]{3}(?:[0-9a-fA-F]{2})?)?\b/,
    // Fallback trong var(--x, #hex) là hợp lệ: token vẫn là nguồn, hex chỉ dự phòng khi token chưa nạp.
    skip: (line) => /var\(--[\w-]+\s*,\s*#[0-9a-fA-F]{3,8}\)/.test(line) && !/#[0-9a-fA-F]{3,8}\b(?![^()]*\))/.test(line.replace(/var\([^)]*\)/g, '')),
    fix: 'màu qua token --g-color-* / --app-brand; tint = color-mix(in srgb, var(--app-brand) 7–12%, var(--g-color-surface))',
  },
  {
    id: 'UI-04', ext: 'scss',
    re: /!important/,
    fix: 'tăng độ ưu tiên bằng selector (hoặc ::ng-deep đúng phần tử), không ép !important',
  },
  {
    id: 'UI-05', ext: 'html',
    re: /\sstyle\s*=\s*"[^"]*(font|color|padding|margin)\s*:/,
    fix: 'inline style về class tiện ích (g-text--*, g-m-*, g-p-*) hoặc SCSS component dùng token',
  },
  // ── Ngày giờ PHẢI qua formatter (11.124, coder: "input chưa format" — ct-info in ISO thô) ──
  {
    id: 'UI-06', ext: 'html',
    // {{ x.createdDate }} / {{ k.activatedDate }} / {{ startAt }} … không có "| date" trong cùng cặp {{ }} → chuỗi ISO thô ra màn
    // UNRELEASED 2026-11-03 (_bmad/_pending fe-ui-06-bao-nham-khoa-i18n-ket-thuc-bang-at-date-trong-translate): mustache CHỈ in khoá i18n -- {{ 'ns.x.lastSeenAt' | translate }} -- là chữ nhãn, không phải ngày giờ thô ⇒ loại bằng lookahead ngay sau '{{'.
    // Vẫn bắt {{ x.createdAt }} / {{ row.postedDate }} trần, và {{ x.lastSeenAt | translate }} (biến ngày đi qua translate = vẫn sai).
    re: /\{\{(?!\s*(['"])[^'"{}]*\1\s*\|\s*translate\b)[^}]*\b[\w.?]*\w(Date|Time|At)\b(?![^}]*\|\s*date)[^}]*\}\}/,
    // pipe ngày tự viết / cell chuẩn (g-cell nhận [value]) không đi qua mustache nên không dính; chuỗi đã format (…Text/…Label) không phải ngày
    skip: (line) => /\|\s*(date|dateFormat|timeAgo|fromNow)\b/.test(line) || /(Date|Time|At)(Text|Label|Str|Display)\b/.test(line),
    fix: 'ngày giờ qua pipe: {{ x.createdDate | date:\'dd/MM/yyyy HH:mm\' }} (hoặc g-cell/ct-info type date|datetime)',
  },
  {
    id: 'UI-07', ext: 'ts',
    // (a) ct-info field def { key: 'xxxDate' … } thiếu type → ct-info in ISO thô; (b) col('xxxDate', {…}) thiếu cell → lưới in ISO thô
    re: /(\{\s*key:\s*['"][\w.]*(Date|Time|At)['"][^}]*\})|(\bcol\(\s*['"][\w.]*(Date|Time|At)['"]\s*(,\s*\{[^}]*\})?\s*\))/,
    skip: (line) => /type\s*:\s*['"](date|datetime|datetime2|time|createdDate|updatedDate)['"]/.test(line)
      || /cell\s*:\s*cell(Date|DateTime2?|CreatedDate|UpdatedDate)\(/.test(line) || /hidden\s*:\s*true/.test(line)
      || /(Date|Time|At)(Text|Label|Str|Display)['"]/.test(line),
    fix: 'ct-info: { key: \'xxxDate\', type: \'date\'|\'datetime\' } · lưới: col(\'xxxDate\', { cell: cellDate()|cellDateTime() }); cellCreatedDate/UpdatedDate chỉ khi DTO có createdUserObject/updatedUserObject',
  },
  // ── Ẩn theo quyền PHẢI gắn được directive (11.128, review 11.127e: 8 chỗ [attr.roles-is] chết im — nút hiện bất kể quyền) ──
  {
    id: 'UI-08', ext: 'html',
    // Angular không so selector directive trên attr binding → [roles-is] không bao giờ gắn
    re: /\[attr\.roles-is\]/,
    fix: 'ẩn theo quyền bằng [roles-is]="roleKey.X" hoặc roles-is="{{ roleKey.X }}" (directive gắn thật) hoặc @if (hasRole(roleKey.X)); KHÔNG [attr.roles-is]',
  },
];

// ── Ngoại lệ CÓ CHỦ ĐÍCH / nợ cũ (ratchet). `max` = số vi phạm được tha trong file; vượt là nổ. ────────────────
const ALLOW = [
  {
    file: 'modules/operations/backup/backup-settings-dialog.component.html',
    rules: ['UI-10'], max: 1,
    why: 'Ô ĐẾM "Đã chọn N CSDL · X GB" nằm CÙNG HÀNG với ô tìm (flex bar, canh phải), không phải dòng ghi chú dưới ô — UI-10 chỉ đọc được quan hệ hai dòng liền nhau nên không phân biệt được.',
  },
  {
    file: 'modules/notification/message-template/edit/message-template-edit.component.scss',
    rules: ['UI-01'], max: 1,
    why: 'Khung XEM TRƯỚC SMS: giả lập font của điện thoại (system-ui 14/1.5), không theo thang chữ ứng dụng.',
  },
  {
    file: 'modules/notification/message-template/edit/message-template-edit.component.scss',
    rules: ['UI-03'], max: 2,
    why: 'Nền khung xem trước email/SMS = tờ giấy trắng cố định như trình đọc thư, không đổi theo skin/dark.',
  },
  {
    file: 'modules/identity/account/login/login.component.scss',
    rules: ['UI-03'], max: 1,
    why: '--login-brand: màu nhận diện riêng của trang đăng nhập (khác --app-brand theo vai trò, chưa đăng nhập nên chưa có skin).',
  },
  {
    file: 'modules/identity/account/login/login.component.scss',
    rules: ['UI-02'], max: 1,
    why: 'Tiêu đề hero 28px của trang đăng nhập (giữa 3xl 24 và 4xl 30) — trang nhận diện, không theo thang nội bộ.',
  },
  {
    file: 'modules/identity/account/home/account-home.component.html',
    rules: ['UI-12'], max: 1,
    why: 'Ô tìm của thẻ "Chức năng của bạn" (Bàn làm việc) bỏ nhãn nổi — coder chọn 2026-09-28: dòng "Tìm thấy n/45 chức năng" ngay dưới tiêu đề thẻ đổi theo từng chữ gõ (aria-live), nên gõ xong vẫn biết ô đang tìm gì — đúng mối lo của UI-12. Chữ gợi ý trong ô thay nhãn.',
  },
];

// ── Quét ─────────────────────────────────────────────────────────────────────
const norm = (p) => p.replace(/\\/g, '/');
/** Duyệt đệ quy gom tệp `.scss`, `.html`, `.ts` (bỏ `.spec.ts`). Tham số: `dir` thư mục (không có ⇒ rỗng); `out` mảng tích luỹ. Trả về: `out`. Tác dụng phụ: đọc cây thư mục (qua overlay). */
function walk(dir, out = []) {
  if (!existsSync(dir)) return out;
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (name.endsWith('.scss') || name.endsWith('.html') || (name.endsWith('.ts') && !name.endsWith('.spec.ts'))) out.push(p);
  }
  return out;
}
/** Bỏ comment (// … và /* … *​/ và <!-- -->) nhưng GIỮ newline → số dòng không lệch. */
const stripComments = (s, ext) => {
  let r = s.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '));
  if (ext === 'scss' || ext === 'ts') r = r.replace(/(^|[^:])\/\/[^\n]*/g, (m, p) => p + ' '.repeat(m.length - p.length));
  if (ext === 'html') r = r.replace(/<!--[\s\S]*?-->/g, (m) => m.replace(/[^\n]/g, ' '));
  return r;
};
/** Tìm ngoại lệ ALLOW áp cho cặp (tệp, luật). Tham số: `file` đường dẫn tệp; `ruleId` mã luật. Trả về: mục ALLOW hoặc `undefined`. Tác dụng phụ: không. */
const allowedFor = (file, ruleId) =>
  ALLOW.find((a) => a.rules.includes(ruleId) && (file === a.file || file.endsWith('/' + a.file)));

/**
 * rv5 D-10 (2026-10-12): CSS NỘI TUYẾN trong @Component của .ts — `styles: [`…`, '…']` hoặc `styles: `…`` (template literal hoặc chuỗi
 * nháy đơn / kép). Trước đây UI-01…04 chỉ đọc .scss nên `font: inherit` trong styles nội tuyến của verify-otp lọt gate. Trả văn bản CÙNG ĐỘ
 * DÀI với tệp: mọi ký tự NGOÀI các chuỗi CSS của `styles` thay bằng khoảng trắng (giữ newline) → số dòng báo lỗi khớp tệp .ts, áp nguyên
 * các luật SCSS từng dòng. Nhận văn bản ĐÃ bỏ comment (stripComments 'ts' xoá luôn chú thích /* *​/ nằm trong CSS).
 */
function inlineStyleText(src) {
  const out = src.replace(/[^\n]/g, ' ').split('');
  const QUOTES = '`\'"';
  const re = /\bstyles\s*:\s*/g;
  let m;
  while ((m = re.exec(src)) !== null) {
    let i = m.index + m[0].length;
    const isArray = src[i] === '[';
    if (!isArray && !QUOTES.includes(src[i])) continue;   // styles: someVar … — không phải CSS nội tuyến
    if (isArray) i++;
    while (i < src.length) {
      const q = src[i];
      if (QUOTES.includes(q)) {
        let j = i + 1;
        while (j < src.length && src[j] !== q) j += src[j] === '\\' ? 2 : 1;
        for (let k = i + 1; k < j && k < src.length; k++) out[k] = src[k];
        i = j + 1;
        if (!isArray) break;
        continue;
      }
      if (!isArray || src[i] === ']') break;
      i++;
    }
    re.lastIndex = Math.max(re.lastIndex, i);
  }
  return out.join('');
}

let violations = 0;
const perAllow = new Map();
/**
 * Ngoại lệ (tệp, luật) còn hạn mức `max` không — đếm từng lần tha. Dùng cho các luật quét TOÀN TỆP (UI-10…13): trước đây chúng chỉ
 * `if (allowedFor(...)) continue` nên `max` chỉ để trang trí — khai ngoại lệ cho MỘT ô là tha luôn mọi vi phạm mới cùng tệp về sau.
 */
const withinAllow = (file, ruleId) => {
  const allow = allowedFor(file, ruleId);
  if (!allow) return false;
  const k = allow.file + '|' + ruleId;
  perAllow.set(k, (perAllow.get(k) || 0) + 1);
  return perAllow.get(k) <= allow.max;
};
/** Áp các luật theo DÒNG của `ext` lên `lines` (`where` = ghi chú vị trí, vd styles nội tuyến). */
const checkLines = (file, lines, ext, where = '') => {
  let selector = '';
  lines.forEach((line, i) => {
    // ngữ cảnh selector gần nhất (dòng kết thúc bằng '{') — cho UI-02 nhận biết khối icon
    if (/\{\s*$/.test(line)) selector = line;
    for (const rule of RULES) {
      if (rule.ext !== ext || !rule.re.test(line)) continue;
      if (rule.skip && rule.skip(line, { selector })) continue;
      const allow = allowedFor(file, rule.id);
      if (allow) {
        const k = allow.file + '|' + rule.id;
        perAllow.set(k, (perAllow.get(k) || 0) + 1);
        if (perAllow.get(k) <= allow.max) continue;
      }
      violations++;
      console.log(`✗ ${rule.id} ${file}:${i + 1}${where}\n    ${line.trim()}\n    → ${rule.fix}`);
    }
  });
};
let inlineStyleFiles = 0;
for (const dir of SCOPE) {
  for (const path of walk(dir)) {
    const file = norm(path);
    const ext = file.endsWith('.scss') ? 'scss' : file.endsWith('.ts') ? 'ts' : 'html';
    const text = stripComments(readFileSync(path, 'utf8'), ext);
    checkLines(file, text.split('\n'), ext);
    // rv5 D-10: .ts còn khối CSS nội tuyến của @Component → cùng bộ luật SCSS (UI-01…04) như tệp .scss.
    if (ext === 'ts') {
      const css = inlineStyleText(text);
      if (css.trim()) { inlineStyleFiles++; checkLines(file, css.split('\n'), 'scss', ' (styles nội tuyến)'); }
    }
  }
}

// ── UI-10: GHI CHÚ CỦA MỘT Ô phải dùng mẫu lõi .g-field/.g-field__note (11.181j — coder: "lần sau review lại thấy ko dùng
//    note này thì báo phải ốp theo nó"). Dòng chữ nhỏ đứng NGAY SAU một <ct-field> chính là ghi chú của ô đó; viết tay bằng
//    g-text--xs + class riêng thì mỗi màn một kiểu khoảng cách/màu, và hay bị đẩy lên mô tả của nhóm — đọc xong mới biết nó
//    nói về ô nào. Quét theo VĂN BẢN (không theo từng dòng) vì luật này là quan hệ GIỮA HAI DÒNG liền nhau.
const UI10 = /<ct-field\b[^>]*>[\s\r\n]*<(?:p|span|div)\b((?:(?!>)[\s\S])*)>/g;
for (const dir of SCOPE) {
  for (const path of walk(dir)) {
    const file = norm(path);
    if (!file.endsWith('.html')) continue;
    const text = stripComments(readFileSync(path, 'utf8'), 'html');
    for (const m of text.matchAll(UI10)) {
      const attrs = m[1] || '';
      if (!/\bg-text--(xs|sm)\b/.test(attrs)) continue;   // không phải dòng chữ nhỏ → không phải ghi chú
      if (/\bg-field__note\b/.test(attrs)) continue;      // đã đúng mẫu
      if (withinAllow(file, 'UI-10')) continue;
      const line = text.slice(0, m.index).split('\n').length;
      violations++;
      console.log(`✗ UI-10 ${file}:${line}\n    ${m[0].replace(/\s+/g, ' ').slice(0, 120)}\n    → ghi chú của ô: bọc <div class="g-field"> quanh ct-field rồi <p class="g-field__note"> (thêm --warn nếu sai thì hỏng việc) — xem /doc-v3/form-groups §6`);
    }
  }
}

// ── UI-11: mỗi <ct-field [options]="controlOptions['x']"> phải có KHÓA NHÃN trong i18n của module (11.181y).
//    Quy ước KHÁC NHAU theo loại ô, đây là chỗ dễ sai:
//      • type="toggle" → `{modulePrefix}.x-label`  (ct-slide-toggle tự nối hậu tố '-label')
//      • loại khác     → `{modulePrefix}.x`        (AppCommonService.getAllControlOptions đặt label = prefix.key)
//    Thiếu khóa thì màn hiện KHÓA THÔ giữa cửa sổ, mà build xanh, tsc xanh, check-i18n cũng xanh (nó chỉ so bundle với
//    nguồn, không biết ô nào cần nhãn nào). Coder đã phải bắt lỗi này bằng MẮT (11.181p) nên đưa cho máy bắt.
const CT_FIELD = /<ct-field\b([^>]*)>/g;
// Từ điển GỘP TOÀN APP, dựng y như i18n-build (global + mọi modules/**/i18n/vi.json). Không tra theo từng module: màn Hồ sơ
// tài khoản dùng prefix 'user' mà khóa nằm ở i18n của chính màn Hồ sơ (modules/identity/account/profiles/i18n) — tra theo module là bắt oan.
// Dựng từ NGUỒN chứ không đọc assets/i18n-platform/vi.json (tệp sinh ra, có thể cũ hoặc chưa có).
// walk() ở trên CHỈ nhặt .scss/.html/.ts nên không dùng lại được — cần bộ quét riêng cho vi.json.
const I18N = (() => {
  const merged = existsSync('src/app/platform/i18n/vi.json') ? JSON.parse(readFileSync('src/app/platform/i18n/vi.json', 'utf8')) : {};
  // UNRELEASED 2026-10-20: màn dự án có thể mang features/**/i18n/vi.json (i18n-build quét) — quét cả hai gốc.
  for (const root of ['src/app/modules', 'src/app/features']) (function collect(dir) {
    if (!existsSync(dir)) return;
    for (const name of readdirSync(dir)) {
      const p = join(dir, name);
      if (statSync(p).isDirectory()) collect(p);
      else if (norm(p).endsWith('/i18n/vi.json')) {
        // Gộp NÔNG một tầng, y như i18n-build: khóa gốc trùng nhau đã bị check-i18n chặn cứng nên không mất gì ở đây.
        try { Object.assign(merged, JSON.parse(readFileSync(p, 'utf8'))); } catch { /* tệp hỏng đã có check-i18n lo */ }
      }
    }
  })(root);
  // + bản dịch CẤP APP (src/assets/i18n/vi.json) — PlatformTranslateLoader gộp cả nguồn này lúc chạy; màn features/main
  // (màn nghiệp vụ, danh mục…) để khóa ở đây. Thiếu nguồn này = báo oan hàng loạt. Gộp SÂU để không mất nhánh con.
  const deepMerge = (a, b) => { for (const [k, v] of Object.entries(b)) a[k] = v && typeof v === 'object' && !Array.isArray(v) && a[k] && typeof a[k] === 'object' ? deepMerge(a[k], v) : v; return a; };
  try { if (existsSync('src/assets/i18n/vi.json')) deepMerge(merged, JSON.parse(readFileSync('src/assets/i18n/vi.json', 'utf8'))); } catch { /* check-i18n lo tệp hỏng */ }
  return merged;
})();
for (const dir of SCOPE) {
  for (const path of walk(dir)) {
    const file = norm(path);
    if (!file.endsWith('.component.html')) continue;
    const html = stripComments(readFileSync(path, 'utf8'), 'html');
    if (!html.includes('controlOptions')) continue;

    // Prefix nhãn LÀ THAM SỐ THỨ HAI của getAllControlOptions, KHÔNG phải lúc nào cũng là modulePrefix — màn Bảo trì truyền
    // 'maintenance.form' trong khi modulePrefix chỉ là 'maintenance'. Đọc nhầm chỗ là bắt oan cả màn.
    // Không đọc được prefix thì BỎ QUA, không đoán.
    const ts = path.replace(/\.html$/, '.ts');
    if (!existsSync(ts)) continue;
    const tsText = readFileSync(ts, 'utf8');
    const arg = tsText.match(/getAllControlOptions\([^,]+,\s*(?:'([^']+)'|this\.(modulePrefix))\s*\)/);
    // Dialog kế thừa BaseDialogModuleComponent KHÔNG gọi getAllControlOptions trực tiếp — initFormWithDto tự sinh
    // controlOptions với prefix = this.modulePrefix (base-dialog-module.component.ts). Trước đây nhánh này bị bỏ qua → mù cả dialog.
    const viaBaseDialog = !arg && /\binitFormWithDto\s*\(/.test(tsText);
    const literalPrefix = () => tsText.match(/modulePrefix\s*(?::\s*string\s*)?=\s*'([^']+)'/)?.[1];
    const prefix = arg?.[1] ?? (arg?.[2] || viaBaseDialog ? literalPrefix() : undefined);
    if (!prefix) continue;

    const at = (dotted) => dotted.split('.').reduce((o, k) => (o && typeof o === 'object' ? o[k] : undefined), I18N);
    const seen = new Set();
    for (const m of html.matchAll(CT_FIELD)) {
      const attrs = m[1] || '';
      // Hai cách viết: controlOptions['x'] và controlOptions.x (dạng chấm trước đây lọt).
      const nm = attrs.match(/controlOptions(?:\[\s*'([A-Za-z0-9_]+)'\s*\]|\.([A-Za-z0-9_]+))/);
      const name = nm?.[1] ?? nm?.[2];
      if (!name) continue;
      // Nhãn truyền tay thì i18n không phải nguồn — bỏ qua. ct-field chuyển [label] cho MỌI type (Platform 2.14, 2026-09-29; trước
      // đó 6 type chữ/ngày bỏ qua label → skip này từng che lỗi). 2026-10-01: chỉ bỏ qua khi nhãn THẬT có giá trị — `label=""` /
      // `[label]="null"` / `[label]="''"` thì ct-field rơi về options.label (khóa i18n) → vẫn phải kiểm khóa.
      // Nhận cả nháy kép lẫn nháy đơn (review 2026-10-01: label='…' từng bị báo đỏ oan).
      const manual = attrs.match(/(\[label\]|(?<![\w.\[-])label)\s*=\s*(?:"([^"]*)"|'([^']*)')/);
      const manualVal = manual ? (manual[2] ?? manual[3] ?? '') : '';
      if (manual && (manual[1] === '[label]' ? !/^\s*(''|null|undefined)?\s*$/.test(manualVal) : manualVal.trim() !== '')) continue;
      const isToggle = /type\s*=\s*"toggle"/.test(attrs);
      const key = prefix + '.' + name + (isToggle ? '-label' : '');
      if (seen.has(key)) continue;
      seen.add(key);
      if (at(key) !== undefined) continue;
      if (withinAllow(file, 'UI-11')) continue;
      violations++;
      console.log(`✗ UI-11 ${file}\n    controlOptions['${name}']${isToggle ? ' (type="toggle")' : ''} — thiếu khóa nhãn "${key}"\n    → thiếu khóa thì màn hiện khóa thô. Toggle dùng {prefix}.{control}-label, loại khác dùng {prefix}.{control}.`);
    }
  }
}

// ── UI-09: token `var(--g-*)` PHẢI có định nghĩa `--g-*:` trong platform/theme/styles (11.142). Quét TOÀN BỘ src/app (cả platform/ui,
//    doc-v3) vì token là hợp đồng toàn app: 11.141 phát hiện `--g-color-on-surface-variant` dùng 28 chỗ (kể cả ct-info core) mà chưa từng khai,
//    13 tên khác (surface-container-lowest, on-primary-container, radius-full…) cùng cảnh — trình duyệt lặng lẽ rơi về kế thừa/initial. ─────────
const THEME_STYLES = 'src/app/platform/theme/styles';
const definedTokens = new Set();
for (const path of walk(THEME_STYLES)) {
  if (!path.endsWith('.scss')) continue;
  // định nghĩa = `--g-x:` không đứng sau `(` / chữ (loại `var(--g-x)`), nhiều token trên một dòng vẫn bắt đủ
  for (const m of readFileSync(path, 'utf8').matchAll(/(?<![\w(-])(--g-[\w-]+)\s*:/g)) definedTokens.add(m[1]);
}
let tokenViolations = 0;
for (const path of walk('src/app')) {
  const isTs = path.endsWith('.ts');
  if (!path.endsWith('.scss') && !isTs) continue;
  const file = norm(path);
  // rv5 D-10: .ts → chỉ phần CSS nội tuyến của @Component (styles: [`…`]) — token sai trong đó cũng lặng lẽ rơi về kế thừa/initial.
  const css = isTs ? inlineStyleText(stripComments(readFileSync(path, 'utf8'), 'ts')) : stripComments(readFileSync(path, 'utf8'), 'scss');
  css.split('\n').forEach((line, i) => {
    for (const m of line.matchAll(/var\(\s*(--g-[\w-]+)/g)) {
      if (definedTokens.has(m[1])) continue;
      tokenViolations++;
      console.log(`✗ UI-09 ${file}:${i + 1}${isTs ? ' (styles nội tuyến)' : ''}\n    ${line.trim()}\n    → token ${m[1]} chưa khai trong ${THEME_STYLES} — dùng token có sẵn hoặc khai alias ở _custom.scss (cả :root lẫn .app nếu bridge M3)`);
    }
  });
}
violations += tokenViolations;

// ── UI-12: ô LỌC/TÌM tự dựng phải CÓ NHÃN (11.182m) ─────────────────────────────────────────────────────────
// Coder: "search trong cột mới ko cần label" → CHỈ hàng lọc nằm TRONG CỘT của lưới mới bỏ nhãn, vì tiêu đề cột ngay
// phía trên đã nói ô đang lọc gì (và hàng đó do g-cell-find dựng, màn không tự viết).
// Thanh lọc TỰ DỰNG (hộp thoại, panel, thanh công cụ) không có tiêu đề cột nào: chỉ còn chữ mờ trong ô, mà chữ đó BIẾN
// MẤT ngay khi người dùng gõ — nhìn lại không biết ô đang lọc theo cái gì.
//
// Quét TOÀN TỆP (như UI-10), KHÔNG theo dòng: thẻ ct-* thật gần như luôn trải nhiều dòng, luật đọc từng dòng sẽ không
// bao giờ thấy dấu `>` nên im lặng không bắt gì — đã tự dính đúng bẫy này khi viết bản đầu.
const UI12 = /<ct-(?:textbox|numberbox|textarea|password|date|datetime|time|date-range|datetime-range|select-for-storage|select-for-api|select-for-bool|autocomplete|autocomplete-api|jstree-select)\b([^>]*)>/g;
for (const dir of SCOPE) {
  for (const path of walk(dir)) {
    const file = norm(path);
    if (!file.endsWith('.html')) continue;
    const text = stripComments(readFileSync(path, 'utf8'), 'html');
    for (const m of text.matchAll(UI12)) {
      const attrs = m[1] || '';
      if (/\[options\]/.test(attrs)) continue;                       // trường reactive form → nhãn nằm ở ct-field
      // Dấu hiệu "đây là ô lọc/tìm tự dựng": ô ngoài form, icon kính lúp, class filter/search, hoặc có chữ gợi ý.
      const isFilter = /\bplain\b/.test(attrs) || /prefixIcon\s*=\s*"search"/.test(attrs)
        || /class\s*=\s*"[^"]*(filter|search)/.test(attrs) || /\bplaceholder\s*=/.test(attrs);
      if (!isFilter) continue;
      if (/(\[label\]|\blabel)\s*=/.test(attrs)) continue;           // đã có nhãn
      if (withinAllow(file, 'UI-12')) continue;
      const line = text.slice(0, m.index).split('\n').length;
      violations++;
      console.log(`✗ UI-12 ${file}:${line}\n    ${m[0].replace(/\s+/g, ' ').slice(0, 120)}\n    → ô lọc/tìm tự dựng phải có nhãn: thêm label="Từ giờ" (hoặc [label]="… | translate"). Chỉ hàng lọc TRONG CỘT của lưới (g-cell-find) mới bỏ nhãn.`);
    }
  }
}

// ── UI-13: MỌI <mat-select> trong platform/ui phải mở bằng bảng chuẩn panelClass="g-select-panel" (11.182o) ──
// Coder: "phải quy định core áp dụng được hết các form khác nhé" — style bảng xổ chỉ có nghĩa nếu MỌI ô chọn của
// dự án cùng dùng nó. Màn nghiệp vụ không được viết <mat-select> thô (gate check:controls đã chặn), nên chỗ duy nhất
// sinh ra ô chọn là các control trong platform/ui — khoá ở đây là khoá được toàn bộ.
// Quét RIÊNG platform/ui: đây là vùng mà các luật khác CỐ Ý không soi (nơi định nghĩa control), nên phải tự đi lấy.
const UI13_DIR = 'src/app/platform/ui';
const UI13 = /<mat-select\b([^>]*)>/g;
if (existsSync(UI13_DIR)) {
  for (const path of walk(UI13_DIR)) {
    const file = norm(path);
    if (!file.endsWith('.html')) continue;
    const text = stripComments(readFileSync(path, 'utf8'), 'html');
    for (const m of text.matchAll(UI13)) {
      if (/panelClass\s*=\s*"[^"]*g-select-panel/.test(m[1] || '')) continue;
      if (withinAllow(file, 'UI-13')) continue;
      const line = text.slice(0, m.index).split('\n').length;
      violations++;
      console.log(`✗ UI-13 ${file}:${line}\n    ${m[0].replace(/\s+/g, ' ').slice(0, 100)}\n    → thêm panelClass="g-select-panel" để ô chọn này dùng CHUNG bảng xổ chuẩn (ô tìm ghim đầu, thanh chọn-tất-cả, dòng 34px) — xem /doc-v3/ui-standards §12`);
    }
  }
}

if (violations) {
  console.log(`\n[check:ui-rules] ✗ ${violations} vi phạm luật giao diện (UI-RULES.md). Nợ cũ khai ALLOW kèm lý do + max; KHÔNG thêm mới.`);
  process.exit(1);
}
console.log(`[check:ui-rules] ✓ ${SCOPE.length} vùng production: 0 vi phạm ngoài ${ALLOW.length} ngoại lệ đã khai (font shorthand / font-size px / hex / !important / inline style / ngày giờ chưa format / [attr.roles-is]; gồm ${inlineStyleFiles} tệp .ts có styles nội tuyến); ${definedTokens.size} token --g-* khai đủ cho mọi var(--g-*) trong src/app (.scss + styles nội tuyến .ts).`);
