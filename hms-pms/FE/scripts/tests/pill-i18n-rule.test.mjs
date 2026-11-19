// Test đơn vị cho luật PILL-01 (scripts/pill-i18n-rule.mjs): chữ trong cellPill / cellIcon / cellBoolPill / cellBoolIcon không được là khoá i18n.
// Chạy bằng `npm run check:unit` (check-unit.mjs gom mọi *.test.mjs). Có ca PASS (không đỏ oan) và ca PHÁ (khoá i18n phải bị bắt).
import test from 'node:test';
import assert from 'node:assert/strict';
import { findI18nKeyInVerbatimCells, blankComments, isTranslateCallee, I18N_KEY_SHAPE } from '../pill-i18n-rule.mjs';

test('PHÁ: cellPill với text là khoá i18n ⇒ bị bắt, kèm số dòng và tên hàm', () => {
  const src = [
    'const cell = cellPill({',
    "  0: { text: 'analysis-sync.statusName.0', icon: 'schedule' },",
    "  1: { text: 'Đang chạy', color: 'success' },",
    '});',
  ].join('\n');
  const hits = findI18nKeyInVerbatimCells(src);
  assert.equal(hits.length, 1);
  assert.deepEqual(hits[0], { fn: 'cellPill', key: 'analysis-sync.statusName.0', line: 2 });
});

test('PHÁ: cellIcon / cellBoolPill / cellBoolIcon dùng khoá i18n ⇒ đều bị bắt', () => {
  const src = [
    "cellIcon({ 1: { icon: 'star', text: 'main.place.starTip' } });",
    "cellBoolPill('main.place.on', 'main.place.off', 'success', 'error');",
    "cellBoolIcon('lock', 'lock_open', 'error', 'success', 'main.place.locked', 'main.place.open');",
  ].join('\n');
  const keys = findI18nKeyInVerbatimCells(src).map((h) => `${h.fn}:${h.key}`);
  assert.deepEqual(keys, [
    'cellIcon:main.place.starTip',
    'cellBoolPill:main.place.on',
    'cellBoolPill:main.place.off',
    'cellBoolIcon:main.place.locked',
    'cellBoolIcon:main.place.open',
  ]);
});

test('PASS: chữ nguyên văn, tên icon, màu, phiên bản không bị đỏ oan', () => {
  const src = [
    "cellPill({ 1: { text: 'Mới', color: 'info' }, 2: { text: 'Hoàn tất', icon: 'check_circle', color: 'success' }, 3: { text: 'N/A' }, 4: { text: 'v1.2' } });",
    "cellBoolIcon('lock', 'lock_open', 'error', 'success', 'Đã khóa', 'Hoạt động');",
    "cellIcon({ true: { icon: 'verified', color: 'success', text: 'Đã xác minh' } });",
  ].join('\n');
  assert.deepEqual(findI18nKeyInVerbatimCells(src), []);
});

test('PASS: khoá i18n NGOÀI 4 hàm (cột title, find, cellCategory) không bị soi', () => {
  const src = [
    "col('status', { title: 'analysis-sync.col.status', cell: cellCategory('analysisSyncStatus', { pill: true }), find: findSelect('analysisSyncStatus') });",
    "const label = this.translate.instant('analysis-sync.statusName.0');",
  ].join('\n');
  assert.deepEqual(findI18nKeyInVerbatimCells(src), []);
});

test('PASS: ví dụ trong chú thích không bị tính; số dòng giữ nguyên sau khi bỏ chú thích khối', () => {
  const src = [
    '/* ví dụ cũ:',
    "   cellPill({ 0: { text: 'analysis-sync.statusName.0' } })",
    '*/',
    "// cellPill({ 0: { text: 'a.b.c' } })",
    "export const BAD = cellPill({ 0: { text: 'main.x.y' } });",
  ].join('\n');
  const hits = findI18nKeyInVerbatimCells(src);
  assert.equal(hits.length, 1);
  assert.equal(hits[0].line, 5);
  assert.equal(blankComments(src).split('\n').length, src.split('\n').length);
  assert.equal(blankComments(src).length, src.length);
});

test('đếm ngoặc: lời gọi lồng nhau và chuỗi chứa dấu ngoặc không làm lệch thân lời gọi', () => {
  const src = [
    "cellPill({ 0: { text: 'Hoạt động (mặc định)', color: 'success' } });",
    "const after = something('main.after.call');",
    "cellPill(build({ text: 'main.nested.key' }));",
  ].join('\n');
  const keys = findI18nKeyInVerbatimCells(src).map((h) => h.key);
  assert.deepEqual(keys, ['main.nested.key']);
});

test('hình dạng khoá i18n: có dấu chấm + tiền tố viết thường + mỗi đoạn sau có chữ cái', () => {
  for (const ok of ['analysis-sync.statusName.0', 'a.b', 'main.place-photo.title', 'analysis-sync.identifierType.12']) assert.ok(I18N_KEY_SHAPE.test(ok), ok);
  for (const no of ['Đang chạy', 'N/A', 'v1.2', 'lock_open', 'success', 'Mới.', 'a.1', 'Main.place.x']) assert.ok(!I18N_KEY_SHAPE.test(no), no);
});

// ───────── G1 (2026-11-04): khoá i18n là đối số trực tiếp của lời gọi DỊCH là cách dịch đúng ⇒ không báo (ca thật: màn modules/ của SSO) ─────────

test('PASS (G1): this.translate.instant(...) trong cellPill / cellBoolIcon — chuỗi được dịch trước khi tới ô', () => {
  const src = [
    "col('type', { cell: cellPill({",
    "  [T.Sso]: { text: this.translate.instant('sso-app.type-1'), color: '', icon: 'hub' },",
    "  [T.Business]: { text: this.translate.instant('sso-app.type-2'), color: '', icon: 'apps' },",
    '}) }),',
    "col('canSign', { cell: cellBoolIcon('check_circle', 'error', 'success', 'error', this.translate.instant('sso-key.canSignYes'), this.translate.instant('sso-key.canSignNo')) }),",
    "col('isSystem', { cell: cellBoolIcon('lock', '', 'warn', undefined, this.translate.instant('role.systemRoleHint')) }),",
  ].join('\n');
  assert.deepEqual(findI18nKeyInVerbatimCells(src), []);
});

test('PASS (G1): các dạng gọi dịch khác — translate.instant trần, bí danh .instant, translate(), translate.get(), mảng khoá, biểu thức ba ngôi, xuống dòng giữa tên và ngoặc', () => {
  const src = [
    "cellPill({ 0: { text: translate.instant('main.a.b') } });",
    "cellPill({ 0: { text: n.instant('main.a.c') } });",
    "cellPill({ 0: { text: this.i18n?.instant('main.a.d') } });",
    "cellPill({ 0: { text: translate('main.a.e') } });",
    "cellPill({ 0: { text: this.translate.get('main.a.f') } });",
    "cellPill({ 0: { text: this.translateService.get('main.a.g') } });",
    "cellPill({ 0: { text: this.translate.instant(['main.a.h', 'main.a.i']) } });",
    "cellPill({ 0: { text: this.translate.instant(flag ? 'main.a.j' : 'main.a.k', { n: 1 }) } });",
    'cellPill({ 0: { text: this.translate',
    "  .instant('main.a.l') } });",
  ].join('\n');
  assert.deepEqual(findI18nKeyInVerbatimCells(src), []);
});

test('PHÁ (G1): khoá thô vẫn bị bắt khi đứng CẠNH lời gọi dịch trong cùng ô, và số dòng đúng', () => {
  const src = [
    'cellPill({',
    "  0: { text: this.translate.instant('sso-app.type-1') },",
    "  1: { text: 'sso-app.type-2' },",
    "  2: { text: this.translate.instant('sso-app.type-3') + 'sso-app.type-4' },",
    '});',
  ].join('\n');
  const hits = findI18nKeyInVerbatimCells(src);
  assert.deepEqual(hits.map((h) => `${h.line}:${h.key}`), ['3:sso-app.type-2', '4:sso-app.type-4']);
});

test('PHÁ (G1): không miễn nhầm — khoá trong object tham số nội suy, trong hàm KHÁC (map.get / foo), hay sau lời gọi dịch đã đóng', () => {
  const src = [
    "cellPill({ 0: { text: this.translate.instant('main.ok.key', { name: 'main.bad.param' }) } });",
    "cellPill({ 0: { text: MAP.get('main.bad.map') } });",
    "cellPill({ 0: { text: foo('main.bad.foo') } });",
    "cellPill({ 0: { text: this.translate.instant('main.ok.two'), tooltip: wrap('main.bad.wrap') } });",
    "cellBoolPill(this.translate.instant('main.ok.on'), 'main.bad.off', 'success', 'error');",
  ].join('\n');
  const keys = findI18nKeyInVerbatimCells(src).map((h) => h.key);
  assert.deepEqual(keys, ['main.bad.param', 'main.bad.map', 'main.bad.foo', 'main.bad.wrap', 'main.bad.off']);
});

test('isTranslateCallee: nhận .instant / .stream / translate( / <…translate…>.get(; không nhận map.get( hay hàm thường', () => {
  const at = (s) => isTranslateCallee(s + "('x')", s.length);
  for (const yes of ['this.translate.instant', 'translate.instant', 'x?.instant', 'a.stream', 'translate', 'this.translate', 'this.translate.get', 'this.translateService.get', 'this.translate .  instant']) assert.ok(at(yes), yes);
  for (const no of ['map.get', 'this.get', 'foo', 'instantiate', 'retranslate', 'this.translate.use', 'cellPill']) assert.ok(!at(no), no);
});
