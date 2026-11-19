// check-dependent — gate cho hàm thuần của ô chọn cha–con (platform/core/utils/dependent-options.util.ts).
// Node chạy thẳng tệp .ts (type stripping) — KHÔNG cần build Angular. Có ca PHÁ: mỗi ca sai kỳ vọng ⇒ đỏ.
// Chạy: npm run check:dependent
import { pathToFileURL } from 'node:url';
import { toPhysical } from '../../../../0.Core/src/Core/FE/tools/fe-overlay-fs.mjs';
import { join } from 'node:path';

const u = await import(pathToFileURL(toPhysical(join(process.cwd(), 'src/app/platform/core/utils/dependent-options.util.ts'))).href);   // toPhysical: nguồn chung src/Core/FE khi ứng dụng không còn bản chép
const { childOptions, pruneChildValue, parentKeys, parentSignature } = u;

const wards = [
  { id: 1, cityId: 10, name: 'A' }, { id: 2, cityId: 10, name: 'B' },
  { id: 3, cityId: 20, name: 'C' }, { id: 4, cityId: null, name: 'mồ côi' },
];
let bad = 0;
/** Ghi nhận một ca kiểm: in ✓/✗ kèm mô tả và cộng bộ đếm lỗi `bad` khi `c` sai. Tham số: `c` điều kiện đúng; `m` mô tả ca. Trả về: không. Tác dụng phụ: in ra màn hình, sửa `bad`. */
const ok = (c, m) => { if (!c) bad++; console.log(`${c ? '✓' : '✗'} ${m}`); };
/** Nối `id` các phần tử thành chuỗi `1,2,3` để so sánh kết quả. Tham số: `a` mảng đối tượng có `id`. Trả về: chuỗi. Tác dụng phụ: không. */
const ids = (a) => a.map((x) => x.id).join(',');

ok(ids(childOptions(wards, 10, 'cityId')) === '1,2', 'cha đơn (số) → chỉ con của cha');
ok(ids(childOptions(wards, '10', 'cityId')) === '1,2', 'cha dạng chuỗi (URL/params) vẫn khớp id số');
ok(ids(childOptions(wards, [10, 20], 'cityId')) === '1,2,3', 'cha NHIỀU → gộp con của mọi cha đã chọn');
ok(ids(childOptions(wards, [], 'cityId')) === '', 'chưa chọn cha (form: none) → rỗng');
ok(childOptions(wards, null, 'cityId', 'all') === wards, 'chưa chọn cha (lưới: all) → nguyên nguồn, cùng tham chiếu');
ok(ids(childOptions(wards, 99, 'cityId')) === '', 'cha không có con → rỗng');
ok(ids(childOptions(wards, 10, 'cityId')).includes('4') === false, 'dòng con KHÔNG có khoá cha (null) không lọt vào');
ok(childOptions(undefined, 10, 'cityId').length === 0 && childOptions(null, 10, 'cityId').length === 0, 'nguồn null/undefined → []');
ok(parentKeys([10, '', null, '20', NaN]).join() === '10,20', 'parentKeys bỏ phần tử rỗng / NaN');
ok(parentSignature([10, 20]) === '10,20' && parentSignature(null) === '', 'parentSignature ổn định');

const opts = childOptions(wards, 10, 'cityId');
ok(pruneChildValue(1, opts) === 1, 'prune đơn: giá trị còn hợp lệ → giữ');
ok(pruneChildValue(3, opts) === null, 'prune đơn: lạc sang cha khác → null');
ok(pruneChildValue(null, opts) === null, 'prune: rỗng giữ nguyên');
const arr = [1, 3];
const pr = pruneChildValue(arr, opts);
ok(Array.isArray(pr) && pr.join() === '1', 'prune nhiều: giữ phần còn hợp lệ');
const same = [1, 2];
ok(pruneChildValue(same, opts) === same, 'prune nhiều: không đổi ⇒ CÙNG tham chiếu (không ghi lại)');
ok(pruneChildValue('2', opts) === '2', 'prune: chuỗi "2" khớp id 2');
ok(pruneChildValue(1, [], 'id') === null, 'prune: danh sách rỗng → null');

// NHIỀU cặp trong một form: hai ô con CÙNG nguồn `wards`, mỗi ô một cha riêng (ô cha tên khác cột khoá → fk 'cityId' khai tường minh) — độc lập nhau
{
  const form = { cityId: 10, permCityId: 20 };
  const a = childOptions(wards, form.cityId, 'cityId');          // cặp 1: dependsOn cityId (fk mặc định = cityId)
  const b = childOptions(wards, form.permCityId, 'cityId');      // cặp 2: dependsOn permCityId + dependsFk cityId
  ok(ids(a) === '1,2' && ids(b) === '3', 'hai cặp tỉnh–xã trong một form cho hai danh sách ĐỘC LẬP');
  ok(ids(childOptions(wards, form.permCityId, 'permCityId')) === '', 'thiếu dependsFk (fk = tên ô cha "permCityId") ⇒ rỗng — lý do gate C32 bắt buộc dependsFk');
  const wardA = 3, wardB = 3;                                    // xã 3 (tỉnh 20) chọn ở cả hai cặp
  ok(pruneChildValue(wardA, a) === null && pruneChildValue(wardB, b) === 3, 'đổi tỉnh cặp 1 chỉ bỏ xã của cặp 1; cặp 2 giữ nguyên');
}

console.log(bad ? `\n✗ ${bad} ca sai` : '\n✓ check-dependent: mọi ca đúng');
process.exit(bad ? 1 : 0);
