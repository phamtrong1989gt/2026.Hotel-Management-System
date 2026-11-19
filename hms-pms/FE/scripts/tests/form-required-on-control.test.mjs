// Test tĩnh LUẬT «MỌI Ô BẮT BUỘC KHAI Ở FORMCONTROL» (FORM-REQ-01…04; dev 2026-11-18: «rất nhiều module đặt bắt buộc không ở formcontrol nên ô không có dấu *, cho vào luật phải có validate ở formcontrol»).
// Vì sao: dấu * của ô nhập KHÔNG tự sinh — lõi dò `Validators.required` trên chính FormControl rồi bật `[required]` của ô (`getAllControlOptions` → `readValidatorLimits`). Bắt buộc ép ở NƠI KHÁC (kiểm cấp nhóm form, `setErrors` tay, cờ options tay)
//   thì Lưu vẫn bị khóa nhưng ô KHÔNG có * và người dùng không biết ô nào phải nhập.
// Luật (đọc mã nguồn, không chạy Angular — quét `src/app/features/main/**/*.ts`, bỏ `.spec.ts`):
//   FORM-REQ-01  Bắt buộc của MỘT ô = `Validators.required` trên FormControl của ô đó. Mọi validator CẤP NHÓM (`fb.group(…, { validators })` · `form.addValidators/setValidators`) phải ghi rõ loại ngay tại chỗ:
//                  `FORM-REQ-NA: <lý do>`     — KHÔNG phải luật bắt buộc (so ngày, không đổi gì, đang chặn…);
//                  `FORM-REQ-ANYOF: <lý do>`  — luật «một trong hai» (họ tên HOẶC số giấy tờ; số điện thoại HOẶC email): không thể có * ở một ô riêng; NGOẠI LỆ DUY NHẤT, nằm trong bảng `ANYOF_ALLOWED` bên dưới (thêm chỗ mới ⇒ xin dev duyệt).
//   FORM-REQ-02  Cấm `setErrors({ required … })` tay để ép bắt buộc (cùng lý do; trừ chỗ gắn FORM-REQ-ANYOF).
//   FORM-REQ-03  Đổi `Validators.required` của ô SAU khi dựng (addValidators / setValidators / removeValidators) ⇒ phải dựng LẠI `controlOptions` ngay sau (trong 25 dòng) để dấu * theo kịp; hoặc ghi `FORM-REQ-DYN: <lý do>`.
//   FORM-REQ-04  Cấm bật `required` bằng tay ở `ControlOptions` (`new ControlOptions({ required: … })`, `.required = …`): nguồn sự thật là validator của FormControl.
// Có ca PASS trên mã thật, ca PHÁ (mã vi phạm phải bị bắt) và bảng ngoại lệ «một trong hai» có lý do.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/** Thư mục gốc các module nghiệp vụ của giao diện (có dấu `/` cuối). */
const MAIN_DIR = fileURLToPath(new URL('../../src/app/features/main/', import.meta.url));

/**
 * Bảng NGOẠI LỆ «một trong hai» (FORM-REQ-ANYOF): khoá = đường dẫn tương đối của tệp (dấu `/`, tính từ `features/main/`), giá trị = `{ count, why }` — số dấu `FORM-REQ-ANYOF` đúng bằng `count` và LÝ DO (không rỗng).
 * Thêm tệp / tăng `count` = thêm một luật «một trong hai» mới ⇒ KHÔNG tự thêm: ghi lý do + xin dev duyệt. Bớt chỗ mà quên sửa bảng cũng đỏ (bảng phải khớp mã).
 */
const ANYOF_ALLOWED = {};

/** Marker đã ghi tại chỗ: `FORM-REQ-<LOẠI>: <lý do ≥ 5 ký tự>` (LOẠI ∈ ANYOF · NA · DYN). */
const MARKER = /FORM-REQ-(ANYOF|NA|DYN)\s*:\s*(\S[^\r\n]{4,})/;

/** Dựng lại `controlOptions` (dấu * theo validator mới): các cách mã hiện có gọi. */
const REBUILD = /getAllControlOptions|getControlOptionsByName|updateControlOptionsValueByName|buildControlOptions|rebuildControlOptions|\bcontrolOptions\s*=|\bcontrolOptions\s*\[/;

/** Số dòng sau chỗ đổi `Validators.required` mà việc dựng lại `controlOptions` còn được tính. */
const REBUILD_WINDOW = 25;

/**
 * Hàm làm gì: liệt kê đệ quy mọi tệp `.ts` (không phải `.spec.ts`) dưới `dir`.
 * Tham số: `dir` thư mục gốc (đường dẫn tuyệt đối). Trả về: mảng đường dẫn tuyệt đối đã sắp xếp. Tác dụng phụ: đọc cây thư mục.
 */
function listTs(dir) {
  const out = [];
  if (!fs.existsSync(dir)) return out;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...listTs(full));
    else if (entry.name.endsWith('.ts') && !entry.name.endsWith('.spec.ts')) out.push(full);
  }
  return out.sort();
}

/**
 * Hàm làm gì: thay chú thích TypeScript (`// …` và `/* … *\/`) bằng khoảng trắng (GIỮ xuống dòng để số dòng không lệch), bỏ qua `//` nằm trong chuỗi '…' / "…" / `…`.
 * Chuỗi một dòng (' hoặc ") tự đóng ở cuối dòng để một dấu nháy lạc (vd trong biểu thức chính quy) không nuốt phần còn lại của tệp. Tham số: `src` mã TypeScript. Trả về: mã đã bỏ chú thích. Tác dụng phụ: không.
 */
function stripTsComments(src) {
  let out = '';
  let quote = null;
  for (let i = 0; i < src.length; i++) {
    const c = src[i], n = src[i + 1];
    if (quote) {
      out += c;
      if (c === '\\') { out += src[i + 1] ?? ''; i++; }
      else if (c === quote || ((quote === "'" || quote === '"') && c === '\n')) quote = null;
      continue;
    }
    if (c === '/' && n === '/') {
      while (i < src.length && src[i] !== '\n' && src[i] !== '\r') { out += ' '; i++; }
      i--;
      continue;
    }
    if (c === '/' && n === '*') {
      const end = src.indexOf('*/', i + 2);
      const stop = end < 0 ? src.length : end + 2;
      for (let j = i; j < stop; j++) out += src[j] === '\n' || src[j] === '\r' ? src[j] : ' ';
      i = stop - 1;
      continue;
    }
    if (c === "'" || c === '"' || c === '`') quote = c;
    out += c;
  }
  return out;
}

/** Hàm làm gì: số dòng (tính từ 1) của vị trí `index` trong `text`. Tham số: `text` chuỗi; `index` vị trí. Trả về: số dòng. Tác dụng phụ: không. */
const lineOf = (text, index) => text.slice(0, index).split('\n').length;

/**
 * Hàm làm gì: tìm marker FORM-REQ-* gắn với chỗ ở dòng `line` — cùng dòng hoặc trong 3 dòng liền trước (đọc mã GỐC còn chú thích).
 * Tham số: `rawLines` các dòng của tệp gốc; `line` số dòng (từ 1) của chỗ cần phân loại. Trả về: `{ kind, why }` hoặc null khi chưa ghi. Tác dụng phụ: không.
 */
function markerAt(rawLines, line) {
  for (let l = line; l >= Math.max(1, line - 3); l--) {
    const m = MARKER.exec(rawLines[l - 1] ?? '');
    if (m) return { kind: m[1], why: m[2].trim() };
  }
  return null;
}

/**
 * Hàm làm gì: quét MỘT tệp TypeScript theo FORM-REQ-01…04.
 * Tham số: `rel` đường dẫn tương đối của tệp (để báo lỗi + tra bảng ngoại lệ); `raw` nội dung gốc. Trả về: `{ violations: string[], anyof: number, na: number, sites: number }` —
 * `anyof` = số dấu FORM-REQ-ANYOF đã gặp ở chỗ hợp lệ; `sites` = số chỗ cấp nhóm / setErrors đã phân loại. Tác dụng phụ: không.
 */
function scanFile(rel, raw) {
  const code = stripTsComments(raw);
  const rawLines = raw.split('\n');
  const codeLines = code.split('\n');
  const violations = [];
  let anyof = 0, na = 0, sites = 0;

  /** Ghi nhận một chỗ cần phân loại (cấp nhóm / setErrors): thiếu marker ⇒ vi phạm. */
  const classify = (line, what, allowed) => {
    const mk = markerAt(rawLines, line);
    if (!mk) { violations.push(`${rel}:${line} ${what} — thiếu ${allowed.map((a) => `FORM-REQ-${a}: <lý do>`).join(' hoặc ')} (FORM-REQ-01)`); return; }
    if (!allowed.includes(mk.kind)) { violations.push(`${rel}:${line} ${what} — marker FORM-REQ-${mk.kind} không hợp ở đây (cần ${allowed.join(' | ')})`); return; }
    sites++;
    if (mk.kind === 'ANYOF') anyof++; else if (mk.kind === 'NA') na++;
  };

  // FORM-REQ-01a: `fb.group({…}, { validators: … })` / `{ validator: … }` — validator cấp NHÓM ở tham số thứ hai.
  const groupOpts = /\}\s*,\s*\{\s*(?:[A-Za-z]+\s*:\s*[^,{}]+,\s*)*validators?\s*:/g;
  for (let m; (m = groupOpts.exec(code));) classify(lineOf(code, m.index + m[0].length - 1), 'validator cấp nhóm form (`{ validators }`)', ['NA', 'ANYOF']);

  // FORM-REQ-01a': `fb.group(controls, { validators: … })` — tham số thứ nhất là BIẾN (không có `}` đứng trước). Chỉ trong lời gọi `.group(` / `new FormGroup(` (không nhầm với `new FormControl(x, { validators })` của MỘT ô).
  const groupOptsVar = /(?:\.group|new\s+FormGroup(?:<[^>]*>)?)\s*\(\s*[\w.]+\s*,\s*\{\s*(?:[A-Za-z]+\s*:\s*[^,{}]+,\s*)*validators?\s*:/g;
  for (let m; (m = groupOptsVar.exec(code));) classify(lineOf(code, m.index + m[0].length - 1), 'validator cấp nhóm form (`group(controls, { validators })`)', ['NA', 'ANYOF']);

  // FORM-REQ-01b: `<form|group>.addValidators(…)` / `.setValidators(…)` — không khớp `form.get('x')!.addValidators` (validator của MỘT ô).
  const groupAdd = /\b\w*(?:[Ff]orm|[Gg]roup)\s*\.\s*(?:addValidators|setValidators|addAsyncValidators|setAsyncValidators)\s*\(/g;
  for (let m; (m = groupAdd.exec(code));) classify(lineOf(code, m.index), 'validator cấp nhóm form (`form.addValidators`)', ['NA', 'ANYOF']);

  // FORM-REQ-02: `setErrors({ … required … })` tay.
  const setErr = /\.setErrors\(\s*\{[^}]*\brequired\b/g;
  for (let m; (m = setErr.exec(code));) classify(lineOf(code, m.index), '`setErrors({ required })` tay', ['ANYOF']);

  // FORM-REQ-03: đổi Validators.required sau khi dựng ⇒ dựng lại controlOptions trong cửa sổ 25 dòng (hoặc FORM-REQ-DYN).
  codeLines.forEach((ln, i) => {
    if (!/\.(?:addValidators|setValidators|removeValidators)\s*\([^;]*Validators\.required/.test(ln)) return;
    const line = i + 1;
    const mk = markerAt(rawLines, line);
    if (mk?.kind === 'DYN') return;
    const window = codeLines.slice(i, i + 1 + REBUILD_WINDOW).join('\n');
    if (!REBUILD.test(window)) violations.push(`${rel}:${line} đổi Validators.required sau khi dựng mà KHÔNG dựng lại controlOptions trong ${REBUILD_WINDOW} dòng kế (dấu * lệch) — gọi getAllControlOptions / getControlOptionsByName hoặc ghi FORM-REQ-DYN: <lý do> (FORM-REQ-03)`);
  });

  // FORM-REQ-04: bật required bằng tay ở ControlOptions.
  const manualOpt = /new\s+ControlOptions\s*\(\s*\{[^}]*\brequired\s*:/g;
  for (let m; (m = manualOpt.exec(code));) violations.push(`${rel}:${lineOf(code, m.index)} \`new ControlOptions({ required … })\` — bắt buộc phải khai bằng Validators.required trên FormControl (FORM-REQ-04)`);
  const manualFlag = /\b\w*[Oo]ptions\w*(?:\[[^\]]+\]|\.\w+)*\.required\s*=(?!=)/g;
  for (let m; (m = manualFlag.exec(code));) violations.push(`${rel}:${lineOf(code, m.index)} gán tay cờ \`.required =\` của ControlOptions — dùng Validators.required trên FormControl (FORM-REQ-04)`);

  return { violations, anyof, na, sites };
}

/**
 * Hàm làm gì: quét mọi tệp trong `files` và đối chiếu số dấu FORM-REQ-ANYOF với bảng `ANYOF_ALLOWED`.
 * Tham số: `files` mảng `{ rel, raw }`; `allowed` bảng ngoại lệ. Trả về: `{ violations, anyofTotal, naTotal, siteTotal }`. Tác dụng phụ: không.
 */
function scanAll(files, allowed) {
  const violations = [];
  let anyofTotal = 0, naTotal = 0, siteTotal = 0;
  const anyofByFile = {};
  for (const f of files) {
    const r = scanFile(f.rel, f.raw);
    violations.push(...r.violations);
    anyofTotal += r.anyof; naTotal += r.na; siteTotal += r.sites;
    if (r.anyof) anyofByFile[f.rel] = r.anyof;
  }
  for (const [rel, n] of Object.entries(anyofByFile)) {
    const ex = allowed[rel];
    if (!ex) violations.push(`${rel}: ${n} luật «một trong hai» (FORM-REQ-ANYOF) NGOÀI bảng ngoại lệ — luật mới phải ghi vào ANYOF_ALLOWED kèm lý do và xin dev duyệt`);
    else if (ex.count !== n) violations.push(`${rel}: bảng ngoại lệ khai ${ex.count} chỗ FORM-REQ-ANYOF nhưng mã có ${n} — sửa bảng hoặc mã cho khớp`);
  }
  for (const [rel, ex] of Object.entries(allowed)) {
    if (!(ex.why ?? '').trim()) violations.push(`${rel}: bảng ngoại lệ thiếu LÝ DO`);
    if (!anyofByFile[rel]) violations.push(`${rel}: có trong bảng ngoại lệ nhưng mã KHÔNG còn FORM-REQ-ANYOF — xóa khỏi bảng`);
  }
  return { violations, anyofTotal, naTotal, siteTotal };
}

/** Đọc mọi tệp `.ts` thật dưới `features/main` thành `{ rel, raw }`. Trả về: mảng. Tác dụng phụ: đọc đĩa. */
function realFiles() {
  return listTs(MAIN_DIR).map((full) => ({ rel: path.relative(MAIN_DIR, full).split(path.sep).join('/'), raw: fs.readFileSync(full, 'utf8') }));
}

test('FORM-REQ: mã thật không có chỗ ép bắt buộc ngoài FormControl', () => {
  const files = realFiles();
  // Vỏ mới chưa có màn nghiệp vụ nào ⇒ chưa có gì để quét (các ca PHÁ bên dưới vẫn chứng minh luật chạy). Đã có màn thì phải quét thấy tệp.
  if (files.length === 0) return;
  assert.ok(files.length >= 1, `quét quá ít tệp (${files.length}) — đường dẫn MAIN_DIR sai?`);
  const r = scanAll(files, ANYOF_ALLOWED);
  assert.deepEqual(r.violations, [], '\n' + r.violations.join('\n'));
  // Sàn chống «kiểm mù»: phải thấy đủ các chỗ đã phân loại (nếu regex hỏng thì số này về 0).
  const expectedAnyof = Object.values(ANYOF_ALLOWED).reduce((s, e) => s + e.count, 0);
  assert.equal(r.anyofTotal, expectedAnyof);
  assert.ok(r.siteTotal >= expectedAnyof, `chỉ thấy ${r.siteTotal} chỗ cấp nhóm`);
});

test('FORM-REQ: bảng ngoại lệ «một trong hai» đều có lý do', () => {
  for (const [rel, ex] of Object.entries(ANYOF_ALLOWED)) {
    assert.ok(ex.why.trim().length >= 10, `${rel}: lý do quá ngắn`);
    assert.ok(Number.isInteger(ex.count) && ex.count >= 1, `${rel}: count phải ≥ 1`);
    assert.ok(fs.existsSync(path.join(MAIN_DIR, rel)), `${rel}: tệp không còn tồn tại`);
  }
});

// ── Ca PHÁ: mã vi phạm PHẢI bị bắt (đối chứng — nếu không thì cổng chỉ là hình thức) ──────────────────────────────────────────────────────────
const scanOne = (code, rel = 'x/x.component.ts', allowed = {}) => scanAll([{ rel, raw: code }], allowed);

test('PHÁ FORM-REQ-01: validator cấp nhóm không ghi loại ⇒ đỏ', () => {
  const r = scanOne(`this.form = this.fb.group({ a: [null] }, { validators: [identityRequired] });`);
  assert.equal(r.violations.length, 1);
  assert.match(r.violations[0], /thiếu FORM-REQ-NA/);
});

test('PHÁ FORM-REQ-01: group(biến, { validators }) cũng bị bắt; FormControl của MỘT ô có { validators } thì không', () => {
  assert.equal(scanOne(`this.form = this.fb.group(controls, { validators: [(g) => this.groupRules(g)] });`).violations.length, 1);
  assert.equal(scanOne(`this.form = new FormGroup(controls, { validators: [fn] });`).violations.length, 1);
  assert.equal(scanOne(`direction: new FormControl<number>(1, { nonNullable: true, validators: [Validators.required] }),`).violations.length, 0);
  assert.deepEqual(scanOne(`this.form = this.fb.group(controls, { validators: [fn] });   // FORM-REQ-NA: không đổi gì thì khóa Lưu`).violations, []);
});

test('PHÁ FORM-REQ-01: form.addValidators không ghi loại ⇒ đỏ; ô riêng (form.get().addValidators) thì không bị tính', () => {
  assert.equal(scanOne(`this.form.addValidators((g) => null);`).violations.length, 1);
  assert.equal(scanOne(`this.arrivalGroup.setValidators(fn);`).violations.length, 1);
  assert.equal(scanOne(`this.form.get('x')!.addValidators(Validators.maxLength(5));`).violations.length, 0);
});

test('PASS FORM-REQ-01: ghi FORM-REQ-NA tại chỗ (cùng dòng hoặc dòng trước) ⇒ xanh', () => {
  assert.deepEqual(scanOne(`this.form.addValidators((g) => null);   // FORM-REQ-NA: so ngày đi sau ngày đến`).violations, []);
  assert.deepEqual(scanOne(`// FORM-REQ-NA: nút Lưu khóa khi không đổi gì\nthis.form.addValidators((g) => null);`).violations, []);
});

test('PHÁ FORM-REQ-01: «một trong hai» ngoài bảng ngoại lệ ⇒ đỏ; trong bảng đúng số chỗ ⇒ xanh; bảng thừa ⇒ đỏ', () => {
  const code = `this.form.addValidators((g) => (a || b ? null : { person: true }));   // FORM-REQ-ANYOF: họ tên HOẶC số giấy tờ`;
  const bad = scanOne(code);
  assert.equal(bad.violations.length, 1);
  assert.match(bad.violations[0], /NGOÀI bảng ngoại lệ/);
  const ok = scanOne(code, 'x/x.component.ts', { 'x/x.component.ts': { count: 1, why: 'họ tên HOẶC số giấy tờ' } });
  assert.deepEqual(ok.violations, []);
  const stale = scanOne(`this.form.addValidators(fn);   // FORM-REQ-NA: chặn`, 'x/x.component.ts', { 'x/x.component.ts': { count: 1, why: 'lý do dài đủ' } });
  assert.ok(stale.violations.some((v) => /KHÔNG còn FORM-REQ-ANYOF/.test(v)));
});

test('PHÁ FORM-REQ-01: marker sai loại / thiếu lý do không được tính', () => {
  assert.equal(scanOne(`this.form.addValidators(fn);   // FORM-REQ-DYN: lý do dài đủ`).violations.length, 1);
  assert.equal(scanOne(`this.form.addValidators(fn);   // FORM-REQ-NA:`).violations.length, 1);
});

test('PHÁ FORM-REQ-02: setErrors({ required }) tay không gắn FORM-REQ-ANYOF ⇒ đỏ', () => {
  assert.equal(scanOne(`this.form.controls.docNo.setErrors({ required: true });`).violations.length, 1);
  assert.equal(scanOne(`this.form.controls.docNo.setErrors(null);`).violations.length, 0);
  assert.equal(scanOne(`this.form.controls.docNo.setErrors({ required: true });   // FORM-REQ-NA: x xxx`).violations.length, 1);
});

test('PHÁ FORM-REQ-03: đổi Validators.required mà không dựng lại controlOptions ⇒ đỏ; có dựng lại hoặc FORM-REQ-DYN ⇒ xanh', () => {
  const bad = `private apply(): void {\n  c.setValidators(range ? [Validators.required] : []);\n  c.updateValueAndValidity();\n}`;
  assert.equal(scanOne(bad).violations.length, 1);
  assert.deepEqual(scanOne(bad + `\nthis.controlOptions = this.appCommon.getAllControlOptions(this.f, 'm');`).violations, []);
  assert.deepEqual(scanOne(`c.removeValidators(Validators.required);   // FORM-REQ-DYN: dựng lại ở hàm gọi`).violations, []);
  assert.equal(scanOne(`this.form.get('v')!.addValidators(Validators.required);`).violations.length, 1);
});

test('PHÁ FORM-REQ-03: dựng lại controlOptions QUÁ XA (ngoài 25 dòng) không được tính', () => {
  const far = `c.addValidators(Validators.required);\n${'x();\n'.repeat(30)}this.controlOptions = this.appCommon.getAllControlOptions(f);`;
  assert.equal(scanOne(far).violations.length, 1);
});

test('PHÁ FORM-REQ-04: bật required tay ở ControlOptions ⇒ đỏ', () => {
  assert.equal(scanOne(`const o = new ControlOptions({ label: 'a', required: true });`).violations.length, 1);
  assert.equal(scanOne(`this.controlOptions.regNo.required = true;`).violations.length, 1);
  assert.equal(scanOne(`const o = new ControlOptions({ label: 'a', maxLength: 5 });`).violations.length, 0);
  assert.equal(scanOne(`@Input({ required: true }) set parentId(v: number) {}`).violations.length, 0);
});

test('PASS: Validators.required đặt đúng chỗ (trên FormControl) và chú thích có chữ khóa KHÔNG bị tính', () => {
  const ok = `this.form = this.fb.group({ a: [null, Validators.required], b: [null, [Validators.required, Validators.maxLength(5)]] });\n// this.form.addValidators(x) — chú thích\n/* { validators: [x] } */`;
  assert.deepEqual(scanOne(ok).violations, []);
});
