// mini-yaml — bộ đọc TẬP CON YAML nhỏ, CHẶT, dành cho hồ sơ ứng dụng `src/Apps/<Mã>/app.yaml` (D-CORE-77, P1). KHÔNG thêm gói npm.
//
// Vì sao tự viết: kho không có bộ đọc YAML dùng chung (mỗi công cụ khung đọc dòng riêng) và KHÔNG được thêm gói npm. Hồ sơ ứng dụng chỉ cần một khuôn rất hẹp,
// nên bộ đọc CỐ Ý hẹp và TỪ CHỐI mọi thứ nó không hiểu (báo lỗi kèm số dòng) thay vì đọc sai im lặng.
//
// Hỗ trợ:
//   • bảng khoá–giá trị lồng nhau theo thụt lề (chỉ dấu cách; mỗi cấp tối thiểu 1 dấu cách, các anh em cùng cấp phải thụt bằng nhau);
//   • danh sách `- giá trị` (mỗi mục là MỘT giá trị đơn) và danh sách một dòng `[a, b, "c, d"]` (rỗng: `[]`); bảng rỗng `{}`;
//   • giá trị đơn: số nguyên (`-?\d+`), `true` / `false` (chỉ hai từ này; `yes`/`no`/`on`/`off` là CHUỖI), `null` / `~` / để trống (= null), chuỗi trơn,
//     chuỗi trong nháy đơn (`''` = một nháy) hoặc nháy kép (escape `\\` `\"` `\n` `\t`);
//   • chú thích `# …` (đầu dòng hoặc sau khoảng trắng, ngoài nháy); BOM đầu tệp; CRLF; một dòng `---` ở đầu tệp.
// Từ chối (YamlError có số dòng): ký tự Tab trong thụt lề · khoá trùng · khoá `__proto__` / `constructor` / `prototype` · neo & bí danh (`&` `*`) · thẻ (`!`) ·
//   khối chữ nhiều dòng (`|` `>`) · bảng một dòng `{a: 1}` có nội dung · danh sách chứa bảng (`- khoá: giá trị`) · danh sách lồng danh sách · nhiều tài liệu (`---` thứ hai, `...`) ·
//   chuỗi trơn chứa `: ` · số ngoài khoảng số nguyên an toàn · nháy không đóng · thụt lề thừa / lệch · dòng không phải `khoá: giá trị`.
//
// Dùng:  import { parseYaml, YamlError } from './mini-yaml.mjs';   const data = parseYaml(text, 'app.yaml');
// Tự kiểm: node scripts/lib/mini-yaml.mjs --selftest        (ca thuận + ca âm; mã thoát 0 = đủ ca đúng, 1 = có ca sai)

import { pathToFileURL } from 'node:url';
import process from 'node:process';

/**
 * Lỗi cú pháp của bộ đọc YAML tập con.
 * Mang theo `line` (số dòng 1-based trong tệp gốc, hoặc 0 nếu lỗi không gắn với dòng nào) và `source` (tên tệp / nhãn nguồn) để thông báo chỉ đúng chỗ.
 */
export class YamlError extends Error {
  /**
   * Hàm làm gì: dựng lỗi cú pháp có vị trí.
   * @param {string} message Nội dung lỗi (tiếng Việt, không kèm vị trí).
   * @param {number} line Số dòng 1-based gây lỗi; 0 = lỗi toàn tệp.
   * @param {string} source Nhãn nguồn (thường là tên tệp) để ghép vào thông báo.
   */
  constructor(message, line, source) {
    super(`${source}${line ? `:${line}` : ''}: ${message}`);
    this.name = 'YamlError';
    this.line = line;
    this.source = source;
  }
}

const FORBIDDEN_KEYS = new Set(['__proto__', 'constructor', 'prototype']);
const KEY_RE = /^("(?:[^"\\]|\\.)*"|'(?:[^']|'')*'|[A-Za-z0-9_][A-Za-z0-9_.\-]*)\s*:(?:\s+(.*))?$/;

/**
 * Hàm làm gì: cắt chú thích `# …` khỏi một dòng, tôn trọng nháy (dấu `#` trong nháy hoặc dính liền chữ — như `a#b` — KHÔNG phải chú thích).
 * Nháy chỉ được coi là MỞ khi đứng ở đầu dòng hoặc ngay sau khoảng trắng / `[` / `,` / `:` / `-` (để `it's` không mở nháy).
 * @param {string} line Một dòng nguyên văn (đã bỏ ký tự xuống dòng).
 * @param {number} no Số dòng 1-based (cho thông báo lỗi).
 * @param {string} source Nhãn nguồn.
 * @returns {string} Phần dòng trước chú thích, đã cắt khoảng trắng cuối.
 * @throws {YamlError} Nháy mở mà không đóng trong cùng dòng.
 */
function stripComment(line, no, source) {
  let q = null;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (q) {
      if (q === '"' && c === '\\') { i++; continue; }
      if (c === q) {
        if (q === "'" && line[i + 1] === "'") { i++; continue; }
        q = null;
      }
      continue;
    }
    const prev = i === 0 ? ' ' : line[i - 1];
    if ((c === '"' || c === "'") && /[\s\[,:\-]/.test(prev)) { q = c; continue; }
    if (c === '#' && /\s/.test(prev)) return line.slice(0, i).replace(/\s+$/, '');
  }
  if (q) throw new YamlError('nháy không đóng trong cùng dòng', no, source);
  return line.replace(/\s+$/, '');
}

/**
 * Hàm làm gì: đọc MỘT chuỗi nháy (đơn hoặc kép) chiếm trọn `raw`.
 * @param {string} raw Chuỗi bắt đầu bằng nháy, phải kết thúc đúng bằng nháy đóng (không còn ký tự thừa).
 * @param {number} no Số dòng 1-based.
 * @param {string} source Nhãn nguồn.
 * @returns {string} Nội dung đã bỏ nháy và đã xử lý escape (kép: `\\` `\"` `\n` `\t`; đơn: `''` thành `'`).
 * @throws {YamlError} Escape lạ, nháy không đóng, hoặc còn ký tự sau nháy đóng.
 */
function parseQuoted(raw, no, source) {
  const q = raw[0];
  let out = '';
  for (let i = 1; i < raw.length; i++) {
    const c = raw[i];
    if (q === '"' && c === '\\') {
      const n = raw[++i];
      if (n === '\\' || n === '"') out += n;
      else if (n === 'n') out += '\n';
      else if (n === 't') out += '\t';
      else throw new YamlError(`escape "\\${n ?? ''}" chưa hỗ trợ trong chuỗi nháy kép`, no, source);
      continue;
    }
    if (c === q) {
      if (q === "'" && raw[i + 1] === "'") { out += "'"; i++; continue; }
      if (i !== raw.length - 1) throw new YamlError('còn ký tự thừa sau nháy đóng', no, source);
      return out;
    }
    out += c;
  }
  throw new YamlError('nháy không đóng', no, source);
}

/**
 * Hàm làm gì: đổi một giá trị đơn (đã cắt chú thích và khoảng trắng hai đầu) thành giá trị JS.
 * @param {string} raw Văn bản giá trị; rỗng nghĩa là null.
 * @param {number} no Số dòng 1-based.
 * @param {string} source Nhãn nguồn.
 * @returns {null|boolean|number|string} null (rỗng / `null` / `~`), boolean (`true` `false`), số nguyên an toàn, hoặc chuỗi.
 * @throws {YamlError} Gặp neo / bí danh / thẻ / khối chữ nhiều dòng / bảng một dòng có nội dung, số vượt khoảng an toàn, hoặc chuỗi trơn chứa `: `.
 */
function parseScalar(raw, no, source) {
  if (raw === '' || raw === 'null' || raw === '~') return null;
  if (raw === 'true') return true;
  if (raw === 'false') return false;
  const c = raw[0];
  if (c === '"' || c === "'") return parseQuoted(raw, no, source);
  if (c === '&' || c === '*') throw new YamlError('neo / bí danh (& *) chưa hỗ trợ', no, source);
  if (c === '!') throw new YamlError('thẻ (!) chưa hỗ trợ', no, source);
  if (c === '|' || c === '>') throw new YamlError('khối chữ nhiều dòng (| >) chưa hỗ trợ', no, source);
  if (c === '{') {
    if (raw === '{}') return {};
    throw new YamlError('bảng một dòng {…} có nội dung chưa hỗ trợ — viết thành khối thụt lề', no, source);
  }
  if (c === '[') throw new YamlError('danh sách một dòng chỉ hợp lệ khi chiếm trọn giá trị', no, source);
  if (/^-?\d+$/.test(raw)) {
    const n = Number(raw);
    if (!Number.isSafeInteger(n)) throw new YamlError(`số ${raw} vượt khoảng số nguyên an toàn — đặt trong nháy nếu là chuỗi`, no, source);
    return n;
  }
  if (/:(\s|$)/.test(raw)) throw new YamlError('chuỗi trơn chứa ": " — đặt trong nháy để tránh nhập nhằng', no, source);
  return raw;
}

/**
 * Hàm làm gì: đọc danh sách một dòng `[a, b, "c, d"]` thành mảng giá trị đơn.
 * @param {string} raw Chuỗi bắt đầu bằng `[` và kết thúc bằng `]`.
 * @param {number} no Số dòng 1-based.
 * @param {string} source Nhãn nguồn.
 * @returns {Array} Mảng giá trị đơn (rỗng nếu `[]`).
 * @throws {YamlError} Không đóng `]`, chứa danh sách / bảng lồng, hoặc mục lỗi theo {@link parseScalar}.
 */
function parseFlowSeq(raw, no, source) {
  if (raw[raw.length - 1] !== ']') throw new YamlError('danh sách một dòng thiếu "]" ở cuối', no, source);
  const inner = raw.slice(1, -1).trim();
  if (inner === '') return [];
  const items = []; let cur = ''; let q = null;
  for (let i = 0; i < inner.length; i++) {
    const c = inner[i];
    if (q) {
      cur += c;
      if (q === '"' && c === '\\') { cur += inner[++i] ?? ''; continue; }
      if (c === q) { if (q === "'" && inner[i + 1] === "'") { cur += inner[++i]; continue; } q = null; }
      continue;
    }
    if ((c === '"' || c === "'") && cur.trim() === '') { q = c; cur += c; continue; }
    if (c === '[' || c === '{') throw new YamlError('danh sách / bảng lồng trong danh sách một dòng chưa hỗ trợ', no, source);
    if (c === ',') { items.push(cur.trim()); cur = ''; continue; }
    cur += c;
  }
  if (q) throw new YamlError('nháy không đóng trong danh sách một dòng', no, source);
  items.push(cur.trim());
  return items.map((s) => {
    if (s === '') throw new YamlError('mục rỗng trong danh sách một dòng', no, source);
    return parseScalar(s, no, source);
  });
}

/**
 * Hàm làm gì: đọc phần giá trị đứng sau `khoá:` trên cùng dòng (không rỗng) — danh sách một dòng hoặc giá trị đơn.
 * @param {string} rest Văn bản sau dấu hai chấm, đã cắt khoảng trắng.
 * @param {number} no Số dòng 1-based.
 * @param {string} source Nhãn nguồn.
 * @returns {*} Giá trị JS.
 */
function parseInline(rest, no, source) {
  if (rest[0] === '[') return parseFlowSeq(rest, no, source);
  return parseScalar(rest, no, source);
}

/**
 * Hàm làm gì: đọc văn bản YAML tập con thành đối tượng JS (xem mô tả đầu tệp về phần được hỗ trợ và bị từ chối).
 * @param {string} text Toàn văn tệp (UTF-8; BOM và CRLF được chấp nhận).
 * @param {string} [source] Nhãn nguồn ghép vào thông báo lỗi (mặc định "(yaml)").
 * @returns {object|Array|null} Nút gốc: đối tượng thường (bảng), mảng (danh sách) hoặc null (tệp chỉ có chú thích / rỗng).
 * @throws {YamlError} Mọi lỗi cú pháp / ngoài tập con, kèm số dòng.
 */
export function parseYaml(text, source = '(yaml)') {
  const raw = String(text).replace(/^\uFEFF/, '').replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n');
  /** @type {{indent:number,text:string,no:number}[]} */
  const toks = [];
  let seenDoc = false;
  for (let i = 0; i < raw.length; i++) {
    const no = i + 1;
    const line = raw[i];
    const lead = /^[ \t]*/.exec(line)[0];
    if (lead.includes('\t')) { if (stripComment(line, no, source).trim() !== '') throw new YamlError('ký tự Tab trong thụt lề — dùng dấu cách', no, source); continue; }
    const body = stripComment(line, no, source).trim();
    if (body === '') continue;
    if (body === '---' || body.startsWith('--- ')) {
      if (toks.length || seenDoc) throw new YamlError('nhiều tài liệu YAML (---) chưa hỗ trợ', no, source);
      if (body !== '---') throw new YamlError('"--- giá trị" chưa hỗ trợ', no, source);
      seenDoc = true; continue;
    }
    if (body === '...') throw new YamlError('dấu kết thúc tài liệu (...) chưa hỗ trợ', no, source);
    toks.push({ indent: lead.length, text: body, no });
  }
  if (toks.length === 0) return null;

  let pos = 0;

  /**
   * Hàm làm gì: đọc một khối (bảng hoặc danh sách) bắt đầu ở `toks[pos]`, mọi dòng của khối thụt đúng `indent`.
   * Tác dụng phụ: dịch con trỏ `pos` (biến của hàm bao ngoài) qua các dòng đã đọc.
   * @param {number} indent Mức thụt lề của khối.
   * @returns {object|Array} Bảng hoặc danh sách của khối.
   */
  function block(indent) {
    const first = toks[pos];
    return first.text === '-' || first.text.startsWith('- ') ? seq(indent) : map(indent);
  }

  /**
   * Hàm làm gì: đọc một danh sách `- giá trị` thụt đúng `indent`.
   * @param {number} indent Mức thụt lề của các dấu `-`.
   * @returns {Array} Mảng giá trị đơn.
   * @throws {YamlError} Mục là bảng (`- khoá: giá trị`), danh sách lồng, mục rỗng, hoặc dòng thụt lệch / không phải mục danh sách.
   */
  function seq(indent) {
    const out = [];
    while (pos < toks.length && toks[pos].indent === indent) {
      const t = toks[pos];
      if (!(t.text === '-' || t.text.startsWith('- '))) throw new YamlError('dòng không phải mục danh sách "- …" trong khối danh sách', t.no, source);
      const rest = t.text.slice(1).trim();
      if (rest === '') throw new YamlError('mục danh sách rỗng / mục lồng nhiều dòng chưa hỗ trợ', t.no, source);
      if (rest[0] === '-' && (rest === '-' || rest.startsWith('- '))) throw new YamlError('danh sách lồng danh sách chưa hỗ trợ', t.no, source);
      if (rest[0] !== '"' && rest[0] !== "'" && rest[0] !== '[' && KEY_RE.test(rest)) throw new YamlError('mục danh sách là bảng ("- khoá: giá trị") chưa hỗ trợ', t.no, source);
      out.push(parseInline(rest, t.no, source));
      pos++;
    }
    if (pos < toks.length && toks[pos].indent > indent) throw new YamlError('thụt lề thừa sau mục danh sách', toks[pos].no, source);
    return out;
  }

  /**
   * Hàm làm gì: đọc một bảng `khoá: giá trị` thụt đúng `indent`; giá trị rỗng + dòng sau thụt sâu hơn ⇒ khối con (bảng hoặc danh sách).
   * @param {number} indent Mức thụt lề của các khoá.
   * @returns {object} Bảng (đối tượng thường).
   * @throws {YamlError} Dòng không phải `khoá: giá trị`, khoá trùng / bị cấm, thụt lề thừa, hoặc lỗi giá trị.
   */
  function map(indent) {
    const out = {};
    while (pos < toks.length && toks[pos].indent === indent) {
      const t = toks[pos];
      const m = KEY_RE.exec(t.text);
      if (!m) throw new YamlError(`dòng không phải "khoá: giá trị": ${t.text.slice(0, 60)}`, t.no, source);
      let key = m[1];
      if (key[0] === '"' || key[0] === "'") key = parseQuoted(key, t.no, source);
      if (FORBIDDEN_KEYS.has(key)) throw new YamlError(`khoá "${key}" bị cấm`, t.no, source);
      if (Object.prototype.hasOwnProperty.call(out, key)) throw new YamlError(`khoá trùng "${key}"`, t.no, source);
      const rest = (m[2] ?? '').trim();
      pos++;
      if (rest !== '') {
        out[key] = parseInline(rest, t.no, source);
        if (pos < toks.length && toks[pos].indent > indent) throw new YamlError('thụt lề thừa sau giá trị một dòng', toks[pos].no, source);
      } else if (pos < toks.length && toks[pos].indent > indent) {
        out[key] = block(toks[pos].indent);
      } else {
        out[key] = null;
      }
    }
    if (pos < toks.length && toks[pos].indent > indent) throw new YamlError('thụt lề thừa / lệch so với các khoá cùng cấp', toks[pos].no, source);
    return out;
  }

  const rootIndent = toks[0].indent;
  const root = block(rootIndent);
  if (pos < toks.length) throw new YamlError('thụt lề nông hơn dòng đầu tiên của tệp', toks[pos].no, source);
  return root;
}

/**
 * Hàm làm gì: tự kiểm bộ đọc bằng ca thuận (đọc đúng giá trị) và ca âm (PHẢI ném YamlError đúng dòng / đúng lý do).
 * Tác dụng phụ: in từng ca ra stdout.
 * @returns {number} Số ca sai (0 = đạt).
 */
export function selftest() {
  let bad = 0;
  /** Hàm làm gì: ghi kết quả MỘT ca (in OK / BAD kèm ghi chú khi sai). Tham số: tên ca, điều kiện đạt, ghi chú khi sai. Tác dụng phụ: tăng `bad` khi sai và in ra stdout. */
  const ok = (name, cond, extra = '') => { if (!cond) bad++; console.log(`${cond ? 'OK  ' : 'BAD '}${name}${cond || !extra ? '' : '  ← ' + extra}`); };
  /** Hàm làm gì: so hai giá trị JS bằng JSON (đủ cho dữ liệu thuần của bộ đọc). Trả về boolean. */
  const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
  /** Hàm làm gì: ca THUẬN — đọc `text` và so với `want`. Tác dụng phụ: gọi `ok` (in kết quả); lỗi YAML ngoài ý muốn tính là ca sai. */
  const good = (name, text, want) => {
    try { const got = parseYaml(text, 't.yaml'); ok(name, same(got, want), JSON.stringify(got)); }
    catch (e) { ok(name, false, e.message); }
  };
  /** Hàm làm gì: ca ÂM — đọc `text` PHẢI ném YamlError chứa `mustHave` (và đúng số dòng `line` nếu có). Tác dụng phụ: gọi `ok`. */
  const fails = (name, text, mustHave, line) => {
    try { parseYaml(text, 't.yaml'); ok(name, false, 'đáng lẽ phải ném lỗi'); }
    catch (e) { ok(name, e instanceof YamlError && e.message.includes(mustHave) && (line === undefined || e.line === line), e.message); }
  };

  good('thuan: bang phang + kieu gia tri', 'a: 1\nb: -7\nc: true\nd: false\ne: null\nf: ~\ng:\nh: chuoi tron\n', { a: 1, b: -7, c: true, d: false, e: null, f: null, g: null, h: 'chuoi tron' });
  good('thuan: bang long nhau + danh sach', 'paths:\n  be: src/A/BE\n  fe: src/A/FE\nlist:\n  - x\n  - 2\n', { paths: { be: 'src/A/BE', fe: 'src/A/FE' }, list: ['x', 2] });
  good('thuan: chu thich dau dong + sau gia tri + trong nhay', '# dau\na: 1  # sau\nb: "x # khong phai chu thich"\nc: \'y # cung vay\'\nd: a#b\n', { a: 1, b: 'x # khong phai chu thich', c: 'y # cung vay', d: 'a#b' });
  good('thuan: nhay don/kep + escape', "a: 'it''s'\nb: \"t\\\"q\\\\n\"\nc: \"\"\n", { a: "it's", b: 't"q\\n', c: '' });
  good('thuan: danh sach mot dong', 'a: [x, "y, z", 3]\nb: []\nc: {}\n', { a: ['x', 'y, z', 3], b: [], c: {} });
  good('thuan: yes/no/on la CHUOI, so 007 la so', 'a: yes\nb: no\nc: on\nd: 007\n', { a: 'yes', b: 'no', c: 'on', d: 7 });
  good('thuan: BOM + CRLF + --- dau tep', '\uFEFF---\r\na: 1\r\nb:\r\n  c: 2\r\n', { a: 1, b: { c: 2 } });
  good('thuan: nhan co dau tieng Viet + dau nhay don giua chu', 'ten: Bản đồ số\nx: don\'t\n', { ten: 'Bản đồ số', x: "don't" });
  good('thuan: khoa trong nhay', '"a b": 1\n', { 'a b': 1 });
  good('thuan: tep chi co chu thich ⇒ null', '# chi chu thich\n\n', null);
  good('thuan: khoa co dau cham/gach', 'a.b-c: 1\n', { 'a.b-c': 1 });
  good('thuan: thut 4 cap 2 khac nhau trong cac nhanh', 'a:\n    b: 1\nc:\n  d: 2\n', { a: { b: 1 }, c: { d: 2 } });

  fails('am: Tab trong thut le', 'a:\n\tb: 1\n', 'Tab', 2);
  fails('am: khoa trung', 'a: 1\nb: 2\na: 3\n', 'khoá trùng "a"', 3);
  fails('am: khoa trung trong khoi con', 'p:\n  x: 1\n  x: 2\n', 'khoá trùng "x"', 3);
  fails('am: khoa __proto__', '__proto__: 1\n', 'bị cấm', 1);
  fails('am: neo & bi danh', 'a: &x 1\n', 'neo', 1);
  fails('am: bi danh *x', 'a: *x\n', 'neo', 1);
  fails('am: the !!str', 'a: !!str 1\n', 'thẻ', 1);
  fails('am: khoi chu |', 'a: |\n  text\n', 'khối chữ', 1);
  fails('am: bang mot dong co noi dung', 'a: {x: 1}\n', 'bảng một dòng', 1);
  fails('am: danh sach chua bang', 'a:\n  - k: v\n', 'là bảng', 2);
  fails('am: danh sach long danh sach', 'a:\n  - - x\n', 'lồng', 2);
  fails('am: nhieu tai lieu', '---\na: 1\n---\nb: 2\n', 'nhiều tài liệu', 3);
  fails('am: chuoi tron chua ": "', 'a: x: y\n', '": "', 1);
  fails('am: so vuot khoang an toan', 'a: 99999999999999999999\n', 'vượt khoảng', 1);
  fails('am: nhay khong dong', 'a: "abc\n', 'nháy không đóng', 1);
  fails('am: thut le thua sau gia tri mot dong', 'a: 1\n  b: 2\n', 'thụt lề thừa', 2);
  fails('am: thut le len lech', 'a:\n    b: 1\n  c: 2\n', 'thụt lề', 3);
  fails('am: dong khong phai khoa', 'a: 1\nxin chao\n', 'không phải "khoá: giá trị"', 2);
  fails('am: escape la', 'a: "x\\q"\n', 'escape', 1);
  fails('am: muc danh sach rong', 'a:\n  -\n', 'rỗng', 2);
  fails('am: danh sach mot dong thieu ]', 'a: [x, y\n', 'thiếu "]"', 1);
  fails('am: danh sach mot dong long nhau', 'a: [x, [y]]\n', 'lồng', 1);
  fails('am: nhay het dong khi con ky tu thua', 'a: "x" y\n', 'ký tự thừa', 1);
  fails('am: thut nong hon dong dau', '  a: 1\nb: 2\n', 'nông hơn', 2);

  console.log(bad ? `${bad} ca SAI` : 'mini-yaml selftest: tất cả ca đúng kỳ vọng');
  return bad;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  if (process.argv.includes('--selftest')) process.exit(selftest() ? 1 : 0);
  console.error('Dùng: node scripts/lib/mini-yaml.mjs --selftest   (hoặc import { parseYaml } từ mô-đun này)');
  process.exit(2);
}
