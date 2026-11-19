// =============================================================================
// check-controls.mjs — GATE nguyên tắc "CONTROL phải dùng custom".
//
//   Trong code PRODUCTION (features/ + platform/layout/ + modules/):
//     • CONTROL (input, select, checkbox, radio, toggle, datepicker, nút) → BẮT BUỘC
//       dùng custom ct-* / g-*.
//     • LAYOUT Material (mat-icon, mat-card, mat-toolbar, mat-sidenav, mat-list,
//       mat-grid-list, mat-progress-*, matTooltip, mat-chip, mat-table, mat-tree,
//       mat-paginator, mat-selection-list, mat-divider…) → GIỮ NGUYÊN, KHÔNG soi.
//
//   KHÔNG soi: platform/ui/ (nơi ĐỊNH NGHĨA custom — wrap Material là đúng vai) và
//   platform/doc-v3/ (tài liệu — example minh hoạ cả component Material chưa có wrapper).
//
//   CTRL-11 (BẢNG, không phải control Material): bảng chỉ-đọc nhỏ KHÔNG được viết tay
//   `<table class="g-table-lite">` — dùng control `g-simple-table` của lõi (`@ui/simple-table`).
//   Ngoại lệ CỦA LUẬT (không cần khai ALLOW): tệp có `<mat-paginator` (bảng tương tác có phân
//   trang — g-simple-table không có phân trang; xem `skipIfFileMatches` ở luật).
//
//   Nội dung trong <!-- --> được bỏ qua (giữ nguyên số dòng).
//   Ngoại lệ có chủ đích khai trong ALLOW — mỗi dòng PHẢI kèm lý do.
//
// Fail (exit 1) nếu có vi phạm mới. Thuộc chuỗi `npm run check`.
// =============================================================================

import { readFileSync, existsSync, readdirSync, statSync } from '../../../../0.Core/src/Core/FE/tools/fe-overlay-fs.mjs';
import { join } from 'node:path';

const SCOPE = [
  'src/app/features',
  'src/app/modules',
  'src/app/platform/layout',
];

// ── Luật: control thô → custom thay thế ──────────────────────────────────────
// NB regex phải có ranh giới để KHÔNG bắt nhầm layout:
//   `<mat-select[\s>]` không được khớp `<mat-selection-list`.
//   nút: chỉ bắt attribute nút, KHÔNG bắt `mat-icon` (layout) hay `mat-button-toggle`.
const RULES = [
  { id: 'CTRL-01', re: /<mat-form-field[\s>]/g,                    fix: 'ct-textbox / ct-field' },
  { id: 'CTRL-02', re: /\bmatInput\b/g,                            fix: 'ct-textbox / ct-field' },
  { id: 'CTRL-03', re: /<mat-select[\s>]/g,                        fix: 'ct-select-for-storage / ct-field type="select"' },
  { id: 'CTRL-04', re: /<mat-checkbox[\s>]/g,                      fix: 'ct-checkbox' },
  { id: 'CTRL-05', re: /<mat-radio-(group|button)[\s>]/g,          fix: 'ct-radio-group' },
  { id: 'CTRL-06', re: /<mat-slide-toggle[\s>]/g,                  fix: 'ct-slide-toggle' },
  { id: 'CTRL-07', re: /\[?matDatepicker\]?|<mat-datepicker[\s>]/g, fix: 'ct-date / ct-datetime / ct-date-range' },
  {
    id: 'CTRL-08',
    // API cũ: mat-button | mat-raised-button | mat-stroked-button | mat-flat-button |
    //         mat-icon-button | mat-fab | mat-mini-fab
    // API Material 21: matButton | matIconButton | matFab | matMiniFab
    //   (bỏ sót nhóm này thì mọi nút viết theo API mới lọt sạch — repo đã có
    //    `<button matButton>` trong platform/ui, chỉ là ngoài SCOPE nên chưa nổ.)
    // KHÔNG bắt mat-button-toggle (component khác, chưa có custom tương ứng).
    re: /\b(mat-(raised-|stroked-|flat-|icon-)?button(?!-toggle)|mat-(mini-)?fab|mat(Icon)?Button|mat(Mini)?Fab)\b/g,
    fix: 'g-button',
  },
  {
    id: 'CTRL-10',
    // Tiêu đề dialog: `g-dialog-header` nhận [data] + [close] nên dùng được cho MỌI dialog
    // (CRUD lẫn bespoke) — không có lý do chính đáng để tự dựng h1 mat-dialog-title + nút đóng.
    // Thêm sau khi fe-review bắt một màn cây chức năng tự dựng header mà gate vẫn xanh.
    // KHÔNG bắt `mat-dialog-actions`: `g-dialog-footer` chỉ nhận hợp đồng CRUD
    // (form/saveApi/deleteApi), không có ng-content cho nút tuỳ ý, nên dialog bespoke
    // (gửi thử, đổi trạng thái…) buộc phải tự dựng hàng nút — ép vào là hại hơn lợi.
    re: /\bmat-dialog-title\b/g,
    fix: 'g-dialog-header',
  },
  {
    id: 'CTRL-11',
    // Bảng chỉ-đọc nhỏ viết tay `<table class="g-table-lite">` → control `g-simple-table` của lõi
    // (D-CORE-153: mọi phần mềm hiện có đã chuyển hết). Máy canh để khỏi tái phạm.
    // Bắt THẺ `<table` có thuộc tính class (nháy kép HOẶC đơn, kèm lớp khác, thuộc tính xuống dòng
    // được vì quét cả tệp) mà MỘT TRONG CÁC LỚP đúng là `g-table-lite` (khớp nguyên từ: không bắt
    // `g-table-lite--dense` đứng một mình hay `my-g-table-lite`). Thân thẻ đọc theo từng cặp nháy
    // nên `>` nằm trong giá trị thuộc tính (vd `[hidden]="a > b"`) không cắt thẻ sớm.
    // KHÔNG bắt `[class.g-table-lite]` / `[ngClass]` / `class=g-table-lite` không nháy (ngoài phạm vi đã chốt).
    re: /<table(?![\w-])(?=(?:[^>"']|"[^"]*"|'[^']*')*?\sclass\s*=\s*(?:"(?:[^"]*\s)?g-table-lite(?:\s[^"]*)?"|'(?:[^']*\s)?g-table-lite(?:\s[^']*)?'))/g,
    // NGOẠI LỆ CỦA LUẬT (không phải ALLOW): tệp có `<mat-paginator` = bảng tương tác CÓ PHÂN TRANG của
    // màn analytics-dashboard (fe-patterns §B2b) — g-simple-table không có phân trang nên không thay được.
    // Thử trên nội dung đã bỏ chú thích (một `<mat-paginator` trong <!-- --> không miễn trừ gì).
    // Phải là regex KHÔNG cờ g (dùng `.test`, không giữ lastIndex).
    skipIfFileMatches: /<mat-paginator\b/,
    what: 'bảng viết tay',
    fix: 'g-simple-table (@ui/simple-table) — bảng chỉ-đọc nhỏ; bảng có phân trang / chọn dòng = g-table-template hoặc child-grid',
  },
];

// ── Ngoại lệ CÓ CHỦ ĐÍCH (mỗi dòng PHẢI có lý do) ────────────────────────────
// Khớp theo: đuôi đường dẫn + rule id. Dùng cho những chỗ ép custom sẽ HẠI hơn LỢI.
//
// `max` = SỐ vi phạm được tha trong file đó. Bắt buộc, vì miễn trừ ở cấp FILE nghĩa
// là luật TẮT HẲN cho cả file: thêm mới bao nhiêu control Material thô nữa cũng lọt
// im lặng. Chốt con số thì mọi cái vượt trên đó lại nổ. Sửa `max` phải kèm lý do.
const ALLOW = [
  {
    file: 'platform/layout/menu/vertical-menu/vertical-menu.component.html',
    rules: ['CTRL-08'],
    max: 4,
    why: 'Nav-anchor cây menu: cần routerLinkActive/routerLinkActiveOptions + 2 mat-icon (g-button chỉ 1 [icon]). '
      + '2026-09-28: +1 = mục cố định "Bàn làm việc" đầu menu — cùng loại nav-anchor, phải giống hệt mục menu để cùng kiểu active/mini.',
  },
  {
    file: 'platform/layout/applications/applications.component.html',
    rules: ['CTRL-08'],
    max: 1,
    why: 'Ô LƯỚI điều hướng vai trò (mat-grid-tile, lấp đầy cell, icon trên nhãn dưới) — KHÔNG phải nút hành động. SCSS .applications bám .mat-mdc-button/.mdc-button__label ép width/height 100% + icon 1.8rem; đo thực tế khi ép sang g-button: nút co còn 60px trong ô 280px và tràn cao (40>28). Cùng loại với tile category knowledge-warehouse.',
  },
  {
    file: 'features/pages.component.html',
    rules: ['CTRL-08'],
    max: 1,
    why: 'Logo <a> bọc <img> trong toolbar — dùng component NUT cho LOGO vốn sai ngữ nghĩa; đổi sang g-button chỉ thay cái sai này bằng cái sai khác.',
  },
];

// ── Quét ─────────────────────────────────────────────────────────────────────
const norm = (p) => p.replace(/\\/g, '/');
/** Xoá nội dung comment nhưng GIỮ newline → số dòng không lệch. */
const stripComments = (s) => s.replace(/<!--[\s\S]*?-->/g, (m) => m.replace(/[^\n]/g, ' '));

/** Duyệt đệ quy gom tệp `.html` và `.ts` (template nội tuyến nằm trong `.ts`). Tham số: `dir` thư mục (không có ⇒ trả mảng rỗng); `out` mảng tích luỹ. Trả về: `out`. Tác dụng phụ: đọc cây thư mục. */
function walk(dir, out = []) {
  if (!existsSync(dir)) return out;
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    // .ts cũng phải quét: component dùng `template:` nội tuyến thì markup nằm trong
    // .ts, không có .html nào cả. Bỏ sót nhóm này đã để lọt vi phạm SỐNG
    // (platform/layout/fullscreen dùng <button mat-icon-button> suốt thời gian dài).
    else if (name.endsWith('.html') || name.endsWith('.ts')) out.push(p);
  }
  return out;
}

/**
 * Với .ts: chỉ giữ phần trong `template: \`…\``, xoá trắng phần còn lại nhưng GIỮ
 * newline để số dòng báo ra vẫn trỏ đúng chỗ trong file gốc. Không làm vậy thì
 * chuỗi TS bình thường (vd `'mat-icon-button'` trong test/const) sẽ báo nhầm.
 */
function extractInlineTemplate(src) {
  const blank = (s) => s.replace(/[^\n]/g, ' ');
  let out = '';
  let last = 0;
  for (const m of src.matchAll(/\btemplate\s*:\s*`([\s\S]*?)`/g)) {
    const start = m.index + m[0].indexOf('`') + 1;
    out += blank(src.slice(last, start)) + m[1];
    last = start + m[1].length;
  }
  if (!out) return blank(src);
  return out + blank(src.slice(last));
}

/**
 * ALLOW khớp theo ĐUÔI đường dẫn — phải chặn ở ranh giới thư mục, nếu không
 * `endsWith('features/pages.component.html')` sẽ ăn luôn
 * `src/app/other-features/pages.component.html` (vì "other-features" kết thúc
 * bằng "features") ⇒ miễn trừ tràn sang thư mục anh em cùng đuôi tên.
 */
const allowedFor = (file, ruleId) =>
  ALLOW.find((a) => {
    const f = norm(file);
    return (f === a.file || f.endsWith('/' + a.file)) && a.rules.includes(ruleId);
  });

/**
 * CTRL-09 — <ct-field> KHÔNG có <ng-content>: mọi thứ đặt bên trong nó sẽ BỊ NUỐT
 * IM LẶNG (build vẫn xanh). Hay gặp nhất: <mat-error> custom → user mất hẳn thông
 * báo lỗi validate. Field cần project nội dung PHẢI dùng ct-* gốc (ct-textbox,
 * ct-password…). Bug này đã xảy ra thật ngày 2026-07-21 ở 5 chỗ.
 */
function checkCtFieldContent(file, src) {
  let bad = 0;
  // `(?<!\/)>` — KHÔNG lấy thẻ tự đóng `<ct-field … />` làm thẻ MỞ. Thiếu chốt này
  // thì thẻ tự đóng ghép nhầm với `</ct-field>` của một ct-field khác ở dưới và
  // nuốt trọn mọi thứ ở giữa ⇒ báo sai + sai số dòng (đã dựng fixture chứng minh).
  for (const m of src.matchAll(/<ct-field\b[^>]*(?<!\/)>([\s\S]*?)<\/ct-field>/g)) {
    if (!m[1].trim()) continue;                       // thẻ rỗng → hợp lệ
    const line = src.slice(0, m.index).split('\n').length;
    const peek = m[1].trim().replace(/\s+/g, ' ').slice(0, 70);
    console.error(
      `[check:controls] ✗ CTRL-09 ${norm(file)}:${line} — <ct-field> có nội dung bên trong ` +
      `nhưng ct-field KHÔNG có <ng-content> ⇒ sẽ bị NUỐT IM LẶNG. Dùng ct-* gốc.\n` +
      `    ${peek}`
    );
    bad++;
  }
  return bad;
}

let fail = false;
let violations = 0;
let allowedHits = 0;
let scanned = 0;

for (const dir of SCOPE) {
  for (const file of walk(dir)) {
    const raw = readFileSync(file, 'utf8');
    // .ts → chỉ lấy markup trong `template:` (xoá trắng phần TS, giữ newline).
    const markup = file.endsWith('.ts') ? extractInlineTemplate(raw) : raw;
    if (!markup.trim()) continue;              // .ts không có template nội tuyến
    scanned++;
    const src = stripComments(markup);

    const ctFieldBad = checkCtFieldContent(file, src);
    if (ctFieldBad) { violations += ctFieldBad; fail = true; }

    // QUÉT TOÀN FILE, KHÔNG quét từng dòng.
    // Lý do: các regex đòi ranh giới [\s>] NGAY SAU tên thẻ. Nếu quét theo dòng thì thẻ
    // viết nhiều dòng (`<mat-form-field\n  appearance="outline">`) có tên thẻ nằm CUỐI
    // dòng ⇒ không có gì để khớp ⇒ LỌT. Đã kiểm bằng fixture: 5/9 luật (CTRL-01/03/04/
    // 05/06) im lặng hoàn toàn. Nguy hiểm vì prettier (printWidth 120) tự xuống dòng
    // thẻ dài — chạy `npm run format` là gate mất tác dụng mà không ai biết.
    // Quét cả chuỗi thì `\s` khớp cả newline; số dòng tính từ offset (như CTRL-09).
    for (const rule of RULES) {
      // Ngoại lệ CỦA LUẬT (khác ALLOW): luật tự khai mẫu tệp mà nó không áp dụng (vd CTRL-11 ↔ tệp có
      // <mat-paginator). Thử trên `src` (đã bỏ chú thích) — không tính vào `allowedHits`.
      if (rule.skipIfFileMatches && rule.skipIfFileMatches.test(src)) continue;
      rule.re.lastIndex = 0;
      const hits = [...src.matchAll(rule.re)];
      const allow = allowedFor(file, rule.id);
      if (allow) {
        allowedHits += hits.length;
        if (hits.length <= allow.max) continue;
        // Vượt hạn mức đã khai ⇒ có control Material thô (hoặc bảng g-table-lite viết tay) MỚI thêm vào file được tha.
        console.error(
          `[check:controls] ✗ ${rule.id} ${norm(file)} — khai ngoại lệ ${allow.max} chỗ ` +
          `nhưng đang có ${hits.length}. Chỗ thêm mới KHÔNG được hưởng miễn trừ:\n` +
          `    lý do đã khai: ${allow.why}`
        );
        violations += hits.length - allow.max;
        fail = true;
        continue;
      }
      for (const m of hits) {
        const line = src.slice(0, m.index).split('\n').length;
        const snippet = (src.split('\n')[line - 1] || '').trim().slice(0, 120);
        console.error(
          `[check:controls] ✗ ${rule.id} ${norm(file)}:${line} — ${rule.what ?? 'control Material thô'}, dùng ${rule.fix}\n` +
          `    ${snippet}`
        );
        violations++;
        fail = true;
      }
    }
  }
}

if (fail) {
  console.error(
    `\n[check:controls] ${violations} vi phạm. Nguyên tắc: CONTROL dùng custom (ct-*/g-*), ` +
    `LAYOUT Material giữ nguyên; bảng chỉ-đọc nhỏ dùng g-simple-table (không viết tay g-table-lite).\n` +
    `    Nếu là ngoại lệ CÓ CHỦ ĐÍCH → khai vào ALLOW trong scripts/check-controls.mjs KÈM LÝ DO.`
  );
} else {
  console.log(
    `[check:controls] ✓ ${scanned} file production: 0 control Material thô, 0 bảng g-table-lite viết tay ` +
    `(${allowedHits} chỗ thuộc ngoại lệ đã khai).`
  );
}

process.exit(fail ? 1 : 0);
