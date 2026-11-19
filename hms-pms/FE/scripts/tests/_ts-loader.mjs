// =============================================================================
// _ts-loader.mjs — nạp tệp TypeScript THUẦN (không Angular / DOM) vào `node --test` mà KHÔNG thêm gói npm.
//
//   Cách làm giống scripts/tests/sso-return-url.test.mjs: biên dịch bằng `typescript.transpileModule` (đã có trong devDependencies) sang ES module trong thư mục tạm,
//   rồi `import()`. Thêm so với bản gốc: (1) đi theo import TƯƠNG ĐỐI (`./x.util`) — biên dịch đệ quy các tệp .ts được trỏ tới; (2) import KHÔNG tương đối
//   (`@core/...`, `@angular/...`) phải được khai ở `stubs` — nếu không thì ném lỗi rõ ràng (tệp thuần không được kéo Angular vào); (3) import chỉ dùng làm KIỂU thì
//   transpileModule tự bỏ nên không cần khai.
//
//   Tên tệp bắt đầu bằng `_` và không kết thúc `.test.mjs` nên `node --test <danh sách tệp>` không coi đây là tệp test.
//   transpileModule không kiểm kiểu — kiểu do `tsc` / `ngc` canh ở `npm run check` và lệnh kiểm kiểu riêng.
// =============================================================================

import { mkdtempSync, readFileSync, writeFileSync, rmSync, existsSync } from '../../../../../0.Core/src/Core/FE/tools/fe-overlay-fs.mjs';
import { tmpdir } from 'node:os';
import { join, dirname, resolve, basename } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import ts from 'typescript';

/** Gốc FE của phần mềm PMS (thư mục chứa package.json). */
export const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
/** `src/app` — gốc để dựng đường dẫn tệp nguồn trong test. */
export const APP = join(ROOT, 'src', 'app');

const COMPILER_OPTIONS = { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022, removeComments: true };

/**
 * Lấy NGUYÊN VĂN mã của một số hàm `export function` từ một tệp .ts (đếm ngoặc nhọn) — để test dùng ĐÚNG hàm thật làm stub cho một import nặng
 * (vd `hasAnyRole` của role-context.service, tệp kéo cả Angular) thay vì chép tay một bản có thể lệch.
 *
 * @param file đường dẫn tuyệt đối tới tệp .ts
 * @param names tên các hàm cần lấy (phải là `export function name(`)
 * @returns văn bản TypeScript của các hàm, nối bằng dòng trống
 */
export function extractExportedFunctions(file, names) {
  const text = readFileSync(file, 'utf8');
  return names.map((name) => {
    const start = text.search(new RegExp(`export function ${name}\\s*\\(`));
    if (start < 0) throw new Error(`Không thấy "export function ${name}(" trong ${file}`);
    const open = text.indexOf('{', text.indexOf(')', start));
    let depth = 0;
    for (let i = open; i < text.length; i++) {
      if (text[i] === '{') depth++;
      else if (text[i] === '}' && --depth === 0) return text.slice(start, i + 1);
    }
    throw new Error(`Không khớp được dấu ngoặc của hàm ${name} trong ${file}`);
  }).join('\n\n');
}

/**
 * Biên dịch + nạp một tệp .ts thuần.
 *
 * @param entry đường dẫn tuyệt đối tới tệp .ts cần nạp
 * @param options.stubs bảng `{ 'đặc tả import': 'mã TypeScript thay thế' }` cho các import không tương đối (vd `'@core/services/role-context.service'`)
 * @returns `{ mod, cleanup }` — `mod` = namespace của module đã nạp; `cleanup()` xoá thư mục tạm (gọi trong `after`)
 */
export async function loadTs(entry, { stubs = {} } = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'fe-pms-unit-'));
  const compiled = new Map();   // đường dẫn .ts tuyệt đối → đường dẫn .mjs đã ghi
  let counter = 0;

  /** Đổi mọi `from '<đặc tả>'` trong mã đã biên dịch của `fromTs` sang URL của bản đã biên dịch / stub. */
  const rewriteImports = (js, fromTs) => js.replace(/(\bfrom\s*)(['"])([^'"\n]+)\2/g, (_m, pre, quote, spec) => {
    if (Object.prototype.hasOwnProperty.call(stubs, spec)) {
      const stubJs = ts.transpileModule(stubs[spec], { compilerOptions: COMPILER_OPTIONS }).outputText;
      const stubOut = join(dir, `${counter++}-stub.mjs`);
      writeFileSync(stubOut, stubJs, 'utf8');
      return `${pre}${quote}${pathToFileURL(stubOut).href}${quote}`;
    }
    if (spec.startsWith('.')) {
      const target = resolve(dirname(fromTs), spec.endsWith('.ts') ? spec : `${spec}.ts`);
      if (!existsSync(target)) throw new Error(`Import tương đối không có tệp: '${spec}' (từ ${fromTs})`);
      return `${pre}${quote}${pathToFileURL(compile(target)).href}${quote}`;
    }
    throw new Error(`Import '${spec}' (từ ${fromTs}) không được hỗ trợ trong tệp thuần — khai nó ở "stubs" hoặc bỏ import khỏi tệp thuần.`);
  });

  /** Biên dịch một tệp (và đệ quy các import tương đối của nó); ghi trước đường ra để import vòng không lặp vô hạn. */
  function compile(absTs) {
    const known = compiled.get(absTs);
    if (known) return known;
    const out = join(dir, `${counter++}-${basename(absTs).replace(/\.ts$/, '')}.mjs`);
    compiled.set(absTs, out);
    const js = ts.transpileModule(readFileSync(absTs, 'utf8'), { compilerOptions: COMPILER_OPTIONS, fileName: absTs }).outputText;
    writeFileSync(out, rewriteImports(js, absTs), 'utf8');
    return out;
  }

  const mod = await import(pathToFileURL(compile(entry)).href);
  return { mod, cleanup: () => rmSync(dir, { recursive: true, force: true }) };
}
