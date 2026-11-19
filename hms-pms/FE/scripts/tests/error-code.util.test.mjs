// =============================================================================
// error-code.util.test.mjs — kiểm việc trang /error CHUẨN HOÁ `?code=` về danh sách đóng (review an ninh 2026-11-04 FE-2: phản chiếu tham số lừa đảo nội dung).
//   Trước: `this.code = params['code'] ?? 404` rồi `{{ code }}` làm tiêu đề lớn ⇒ `/error?code=Phiên hết hạn, gọi 090…` hiện NGUYÊN câu đó trong thẻ mang logo hệ thống.
//   Nguồn kiểm: src/app/features/error/error-code.util.ts (biên dịch bằng `typescript.transpileModule`, scripts/tests/_ts-loader.mjs; KHÔNG thêm gói npm, KHÔNG cần Angular / DOM)
//   + đọc văn bản error.component.ts (khoá mồi: component PHẢI gán code qua normalizeErrorCode, không được gán lại thẳng params['code']).
//   Chạy: `npm run check:unit` (thuộc chuỗi `npm run check`). Giới hạn nói thẳng: KHÔNG dựng component (cần Angular + trình duyệt thật) — chỉ hàm thuần + dấu vết trong mã.
// =============================================================================

import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from '../../../../../0.Core/src/Core/FE/tools/fe-overlay-fs.mjs';
import { join } from 'node:path';
import { APP, loadTs } from './_ts-loader.mjs';

let util;
let cleanup;

before(async () => {
  const u = await loadTs(join(APP, 'features', 'error', 'error-code.util.ts'));
  util = u.mod;
  cleanup = u.cleanup;
});

after(() => cleanup?.());

test('normalizeErrorCode: mã hợp lệ (số hoặc chuỗi số) giữ nguyên', () => {
  for (const code of [401, 403, 404, 409, 500]) {
    assert.equal(util.normalizeErrorCode(code), code, `số ${code}`);
    assert.equal(util.normalizeErrorCode(String(code)), code, `chuỗi "${code}" (đúng kiểu ActivatedRoute trả về)`);
  }
});

test('normalizeErrorCode: CA PHÁ — chuỗi tự do / câu lừa đảo KHÔNG được phản chiếu, rơi về 404 và luôn trả SỐ', () => {
  for (const raw of [
    'Phiên hết hạn, gọi 090…', 'Hệ thống bảo trì, nhập lại mật khẩu tại example.test', '<img src=x onerror=alert(1)>', 'javascript:alert(1)',
    '403 Forbidden', '40x', '', ' ', 'null', 'undefined', 'NaN', 'Infinity', '-404', '404.5', '4e2',
  ]) {
    const got = util.normalizeErrorCode(raw);
    assert.equal(got, 404, `"${raw}" phải rơi về 404`);
    assert.equal(typeof got, 'number', `"${raw}" phải trả số, không phải chuỗi`);
  }
});

test('normalizeErrorCode: vắng / mã HTTP lạ / mảng (?code=a&code=b) / đối tượng → 404', () => {
  for (const raw of [undefined, null, 0, 200, 302, 400, 418, 502, 503, ['403', '500'], ['x'], {}, true, NaN]) {
    assert.equal(util.normalizeErrorCode(raw), 404, `${JSON.stringify(raw)} → 404`);
  }
});

test('ERROR_PAGE_CODES là danh sách đóng đúng 5 mã mà luồng hợp lệ gửi (interceptor / guard / route **)', () => {
  assert.deepEqual([...util.ERROR_PAGE_CODES].sort((a, b) => a - b), [401, 403, 404, 409, 500]);
  assert.equal(util.ERROR_PAGE_DEFAULT_CODE, 404);
});

test('error.component.ts: gán code qua normalizeErrorCode, KHÔNG gán thẳng params["code"] (khoá mồi chống quay lại phản chiếu)', () => {
  const src = readFileSync(join(APP, 'features', 'error', 'error.component.ts'), 'utf8');
  assert.match(src, /import \{ normalizeErrorCode \} from '\.\/error-code\.util';/, 'phải import hàm chuẩn hoá');
  assert.match(src, /this\.code\s*=\s*normalizeErrorCode\(params\['code'\]\)/, 'phải gán code bằng normalizeErrorCode(params[\'code\'])');
  assert.doesNotMatch(src, /this\.code\s*=\s*params\[/, 'KHÔNG được gán this.code thẳng từ params[...] (phản chiếu tham số URL)');
  // Mọi phép gán `this.code = …` trong component (ngoài khai báo `code: number = 404`) phải đi qua normalizeErrorCode.
  const assigns = src.split('\n').filter((l) => /\bthis\.code\s*=(?!=)/.test(l));
  assert.ok(assigns.length >= 1, 'phải có ít nhất một phép gán this.code');
  for (const l of assigns) assert.match(l, /normalizeErrorCode\(/, `phép gán this.code phải đi qua normalizeErrorCode: ${l.trim()}`);
});

test('error.component.html: tiêu đề chỉ in `code` (đã là số) — không in tham số URL thô (message / reason) ra màn hình', () => {
  const html = readFileSync(join(APP, 'features', 'error', 'error.component.html'), 'utf8');
  assert.doesNotMatch(html, /queryParams|\bmessage\b\s*\}\}/, 'template không được đọc queryParams / in message thô');
});
