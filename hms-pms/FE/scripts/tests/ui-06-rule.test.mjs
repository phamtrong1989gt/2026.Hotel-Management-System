// Test đơn vị cho luật UI-06 của scripts/check-ui-rules.mjs (ngày giờ trong HTML phải qua pipe `date`).
// check-ui-rules.mjs chạy quét ngay khi nạp nên KHÔNG import được: test này đọc CHÍNH tệp nguồn, trích literal regex + hàm skip của UI-06 rồi thử trực tiếp
// (đổi luật trong tệp nguồn là test thấy ngay — không có bản sao riêng để lệch).
// Ca PASS: khoá i18n đuôi At/Date/Time trong `{{ 'khoá' | translate }}` KHÔNG bị bắt (2026-11-03: `{{ 'analysis-sync.match.lastSeenAt' | translate }}` bị bắt nhầm).
// Ca PHÁ: biến ngày giờ trần / đi qua translate vẫn BỊ bắt; pipe date vẫn được miễn.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const SRC = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '..', 'check-ui-rules.mjs'), 'utf8');

/** Trích khối của luật UI-06 (từ `id: 'UI-06'` tới `fix:`) rồi dựng `{ re, skip }` thật từ literal trong nguồn. */
function loadUi06() {
  const start = SRC.indexOf("id: 'UI-06'");
  assert.ok(start > 0, "không thấy id: 'UI-06' trong check-ui-rules.mjs");
  const end = SRC.indexOf('fix:', start);
  const block = SRC.slice(start, end);
  const reLine = block.split('\n').find((l) => /^\s*re:\s*\//.test(l));
  assert.ok(reLine, 'không thấy dòng re: /…/ của UI-06');
  const re = new Function(`return ${reLine.replace(/^\s*re:\s*/, '').replace(/,\s*$/, '')};`)();
  const skipAt = block.indexOf('skip:');
  assert.ok(skipAt > 0, 'không thấy skip: của UI-06');
  const skip = new Function(`return ${block.slice(skipAt + 'skip:'.length).trim().replace(/,\s*$/, '')};`)();
  return { re, skip };
}

const { re, skip } = loadUi06();
/** Luật có báo vi phạm cho dòng này không (cùng cách check-ui-rules áp: re khớp và skip không miễn). */
const flagged = (line) => re.test(line) && !skip(line, { selector: '' });

test('PASS: nhãn cột bằng khoá i18n đuôi At/Date/Time KHÔNG bị bắt (đỏ giả cũ)', () => {
  assert.equal(flagged(`<th scope="col">{{ 'analysis-sync.match.lastSeenAt' | translate }}</th>`), false);
  assert.equal(flagged(`<th>{{ "main.place.createdDate" | translate }}</th>`), false);
  assert.equal(flagged(`<span>{{ 'main.x.startTime' | translate: { n: 1 } }}</span>`), false);
});

test('PHÁ: biến ngày giờ in trần vẫn BỊ bắt', () => {
  assert.equal(flagged('<td>{{ x.createdAt }}</td>'), true);
  assert.equal(flagged('<td>{{ row.postedDate }}</td>'), true);
  assert.equal(flagged('<td>{{ m.lastSeenAt }}</td>'), true);
  assert.equal(flagged('<td>{{ item.startTime }}</td>'), true);
});

test('PHÁ: biến ngày giờ đi qua translate (không phải chuỗi khoá) vẫn BỊ bắt', () => {
  assert.equal(flagged('<td>{{ x.lastSeenAt | translate }}</td>'), true);
});

test('PHÁ: dòng có CẢ nhãn khoá i18n LẪN ngày giờ trần ⇒ vẫn bị bắt (không miễn cả dòng)', () => {
  assert.equal(flagged(`<td>{{ 'a.b.lastSeenAt' | translate }}: {{ x.createdAt }}</td>`), true);
});

test('PASS: đã qua pipe date / chuỗi đã định dạng không bị bắt (hành vi cũ giữ nguyên)', () => {
  assert.equal(flagged(`<td>{{ x.createdAt | date:'dd/MM/yyyy HH:mm' }}</td>`), false);
  assert.equal(flagged('<td>{{ x.createdDateText }}</td>'), false);
});
