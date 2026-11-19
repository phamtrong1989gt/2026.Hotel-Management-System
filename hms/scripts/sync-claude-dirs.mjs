#!/usr/bin/env node
// sync-claude-dirs — đồng bộ cấu hình Claude Code (`.claude`) + `CLAUDE.md` từ LÕI sang dự án và mọi repo phần mềm (bố cục tách kho 2026-11-19).
//
// Vì sao: Claude Code chỉ nạp HOOK và lệnh `/…` từ `.claude` của thư mục ĐANG MỞ (thư mục phụ khai ở `additionalDirectories` chỉ được cấp quyền đọc / ghi, KHÔNG nạp cấu hình).
//   Kho gộp cũ chỉ có một thư mục; kho tách có 5 — mở folder nào cũng phải chạy hook chặn build FE, có lệnh `/vibe` `/stack`…, và biết đường dẫn LOGIC (`src/Apps/<Mã>/…`, `_bmad/…`) nằm ở đâu thật.
//   Nguồn chuẩn là `.claude` của LÕI (`commands/` do `/sync-claude` sinh từ `_bmad`, `settings.json` giữ hook). Công cụ này CHÉP sang các nơi còn lại và sinh `CLAUDE.md` chỉ đường — sửa ở lõi rồi chạy lại, ĐỪNG sửa bản sao.
//
// Dùng (ở thư mục dự án):
//   node scripts/sync-claude-dirs.mjs              = --check: CHỈ ĐỌC. Mã thoát 1 khi có bản sao lệch / thiếu / thừa.
//   node scripts/sync-claude-dirs.mjs --write      tạo / cập nhật `.claude/commands`, `.claude/settings.json`, `CLAUDE.md` ở dự án + từng repo phần mềm (KHÔNG xoá tệp thừa).
//   node scripts/sync-claude-dirs.mjs --write --prune   như trên, và xoá tệp `.md` thừa trong `.claude/commands` của bản sao.
//   node scripts/sync-claude-dirs.mjs --write --group   như `--write` và TẠO thêm bản cho thư mục CHỨA (thư mục cha chung của dự án và các repo phần mềm, khi nó không phải repo git) — để mở VS Code ở thư mục đó vẫn có hook + lệnh `/…` + CLAUDE.md.
//        Bản này chỉ ở máy này (không nằm trong repo nào). Đã tạo rồi thì `--write` / kiểm tự động tính nó; chưa tạo thì máy khác không bị đỏ.
//   node scripts/sync-claude-dirs.mjs --selftest   tự kiểm trên cây giả trong thư mục tạm.
// KHÔNG đụng `.claude/settings.local.json` (riêng từng máy) và KHÔNG ghi vào lõi.

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { pathToFileURL } from 'node:url';
import { PLATFORM_ROOT, PROJECT_ROOT, apps, isSplit } from './lib/workspace.mjs';

/** Dấu hiệu ghi ở đầu mỗi `CLAUDE.md` do công cụ sinh — để người sửa tay biết tệp này là bản sinh. */
const GENERATED = '<!-- Tệp SINH bởi scripts/sync-claude-dirs.mjs ở thư mục dự án — sửa công cụ rồi chạy lại, đừng sửa tay. -->';

/**
 * Hàm làm gì: đường dẫn tương đối (dấu `/`) từ thư mục `from` tới từng thư mục trong `tos` — dùng để khai `additionalDirectories` (tính từ thư mục KHỞI CHẠY Claude).
 * @param {string} from Thư mục khởi chạy (gốc repo đang mở).
 * @param {string[]} tos Các thư mục cần tới.
 * @param {typeof path} [pathApi] Bộ hàm đường dẫn (mặc định `path` của hệ điều hành; ca tự kiểm truyền `path.win32` để thử «khác ổ đĩa» ở mọi hệ điều hành).
 * @returns {string[]} Đường dẫn tương đối theo cùng thứ tự `tos` (vd `../../<thư mục lõi>`); cùng thư mục ⇒ `.`.
 * @throws {Error} Khi `from` và một đích nằm ở HAI Ổ ĐĨA khác nhau (`path.relative` trả về đường dẫn tuyệt đối): «khác ổ đĩa, không tạo được đường dẫn tương đối» — công cụ KHÔNG ghi đường dẫn tuyệt đối vào tệp (sẽ gắn cứng vào máy này).
 */
export function relDirs(from, tos, pathApi = path) {
  return tos.map((t) => {
    const rel = pathApi.relative(from, t);
    if (pathApi.isAbsolute(rel)) throw new Error(`khác ổ đĩa, không tạo được đường dẫn tương đối: từ «${from}» tới «${t}» — đặt dự án, lõi và các repo phần mềm trên CÙNG một ổ đĩa (công cụ không ghi đường dẫn tuyệt đối vào tệp cấu hình).`);
    return rel.split(pathApi.sep).join('/') || '.';
  });
}

/**
 * Hàm làm gì: đọc nguồn chuẩn ở lõi — mọi lệnh `.claude/commands/*.md` (nội dung thô) và khối `hooks` của `.claude/settings.json`.
 * @param {string} coreRoot Gốc lõi nền tảng.
 * @returns {{commands: Map<string, Buffer>, hooks: object}} Bảng tên tệp → nội dung; khối hooks. Ném lỗi nếu thiếu thư mục lệnh hoặc settings không phải JSON.
 */
export function loadSource(coreRoot) {
  const dir = path.join(coreRoot, '.claude', 'commands');
  if (!fs.existsSync(dir)) throw new Error(`lõi không có ${dir}`);
  const commands = new Map();
  for (const f of fs.readdirSync(dir).filter((n) => n.endsWith('.md')).sort()) commands.set(f, fs.readFileSync(path.join(dir, f)));
  const settingsFile = path.join(coreRoot, '.claude', 'settings.json');
  const hooks = fs.existsSync(settingsFile) ? (JSON.parse(fs.readFileSync(settingsFile, 'utf8')).hooks ?? {}) : {};
  return { commands, hooks };
}

/**
 * Hàm làm gì: dựng nội dung `.claude/settings.json` của một bản sao — chỉ khối hooks của lõi + `additionalDirectories` (đường dẫn tương đối tính từ thư mục khởi chạy).
 * @param {object} hooks Khối hooks lấy từ lõi.
 * @param {string[]} additional Danh sách đường dẫn tương đối tới các thư mục anh em.
 * @returns {string} Chuỗi JSON thụt 2 dấu cách, kết thúc bằng một dấu xuống dòng (LF).
 */
export function renderSettings(hooks, additional) {
  return JSON.stringify({ permissions: { additionalDirectories: additional }, hooks }, null, 2) + '\n';
}

/**
 * Hàm làm gì: dựng nội dung `CLAUDE.md` chỉ đường cho một thư mục — bảng 5 thư mục, phép dịch đường dẫn LOGIC ↔ THẬT, và luật «cấu hình chỉ lấy từ thư mục đang mở».
 * @param {{name:string, root:string}} me Thư mục đang sinh (tên thư mục + đường dẫn tuyệt đối).
 * @param {{coreRoot:string, projectRoot:string, apps:{code:string, name:string, root:string}[]}} ctx Toàn bộ bố cục.
 * @returns {string} Văn bản Markdown (LF), có dấu hiệu «tệp sinh» ở đầu.
 */
export function renderClaudeMd(me, ctx) {
  const rel = (to) => relDirs(me.root, [to])[0];
  const here = (root) => (path.resolve(root) === path.resolve(me.root) ? ' ← đang mở ở đây' : '');
  const group = me.group === true;
  const groupRepo = group && me.groupIsRepo === true;
  const total = 2 + ctx.apps.length;
  const rows = [
    `| Lõi nền tảng — \`src/Core\`, \`src/Services\` (SSO · Gateway · File), \`_bmad\` | \`${rel(ctx.coreRoot)}\`${here(ctx.coreRoot)} |`,
    `| Dự án — \`scripts\`, \`docs\`, \`deploy\`, \`services-config\`, \`workspace.json\` | \`${rel(ctx.projectRoot)}\`${here(ctx.projectRoot)} |`,
    ...ctx.apps.map((a) => `| Phần mềm ${a.code} — \`BE\`, \`FE\`, \`_contracts\`, \`scripts\` | \`${rel(a.root)}\`${here(a.root)} |`),
  ];
  const appLines = ctx.apps.map((a) => `- \`src/Apps/${a.code}/…\` → \`${rel(a.root)}/…\` (vd \`src/Apps/${a.code}/BE/x\` = \`${rel(a.root)}/BE/x\`)`);
  return [
    GENERATED,
    '',
    group ? `# ${me.name} — ${groupRepo ? 'gốc repo git chứa' : 'thư mục CHỨA'} dự án và các phần mềm${groupRepo ? '' : ' (KHÔNG phải repo git)'}` : `# ${me.name} — một trong ${total} thư mục của kho TÁCH`,
    '',
    'Kho gộp cũ (một thư mục có `src/Core`, `src/Services`, `src/Apps/<Mã>`, `scripts`, `docs`, `deploy`, `_bmad`) nay là các thư mục độc lập, KHÔNG submodule. Đường dẫn dưới đây tính từ thư mục đang mở:',
    '',
    '| Vai trò | Thư mục |',
    '|---|---|',
    ...rows,
    '',
    '## Đường dẫn LOGIC ↔ THẬT',
    '',
    'Luật `_bmad`, các lệnh `/vibe` `/stack` `/gen-module`…, hồ sơ `app.yaml` và thông báo của công cụ vẫn nói theo đường dẫn LOGIC của kho gộp cũ. Dịch sang đường dẫn thật:',
    '',
    ...appLines,
    `- \`src/Core/…\` · \`src/Services/…\` · \`_bmad/…\` → lõi (\`${rel(ctx.coreRoot)}/…\`)`,
    `- \`scripts/…\` · \`docs/…\` · \`deploy/…\` · \`services-config/…\` → dự án (\`${rel(ctx.projectRoot)}/…\`)`,
    '',
    `Chi tiết, cách công cụ nhận diện nhau và danh sách việc còn mở: \`${rel(ctx.projectRoot)}/docs/BO-CUC-KHO-TACH.md\`.`,
    '',
    '## Làm việc khi mở một thư mục riêng lẻ',
    '',
    ...(group
      ? [
        groupRepo
          ? '- Thư mục này là GỐC MỘT repo git chứa dự án và các phần mềm vệ tinh; lõi là repo RIÊNG đặt cạnh (xem bảng trên). Một lệnh git ở đây thấy cả dự án lẫn các phần mềm. `.claude/` và `CLAUDE.md` ở đây được commit cùng repo (riêng `.claude/settings.local.json` thì không). Lõi đã được cấp quyền qua `.claude/settings.json` → `additionalDirectories`.'
          : '- Thư mục này KHÔNG phải repo git (không có `.git`): lệnh git chạy trong TỪNG repo con (`git -C <repo> …`). `.claude/` và `CLAUDE.md` ở đây là bản SINH riêng của máy này, không commit ở đâu cả. Dự án và các phần mềm nằm ngay dưới thư mục này nên Claude sửa được tất cả; lõi đã được cấp quyền qua `.claude/settings.json` → `additionalDirectories`.',
        `- Nguồn chuẩn của \`.claude\` là LÕI. Sửa ở lõi, rồi chạy: \`node ${relDirs(me.root, [ctx.projectRoot])[0]}/scripts/sync-claude-dirs.mjs --write\` (kiểm: bỏ \`--write\`). Đừng sửa tay bản sao.`,
        `- Cổng và công cụ cấp dự án chạy từ thư mục dự án (\`${relDirs(me.root, [ctx.projectRoot])[0]}\`, \`node scripts/…\`); công cụ của khung BMAD chạy từ thư mục lõi.`,
      ]
      : [
        '- Lõi và dự án (riêng thư mục dự án: cả các phần mềm) đã được cấp quyền đọc / ghi qua `.claude/settings.json` → `additionalDirectories` (đường dẫn tương đối, tính từ thư mục đang mở); thư mục khác thì Claude sẽ hỏi quyền. HOOK và lệnh `/…` thì chỉ lấy từ `.claude` của thư mục ĐANG MỞ — vì vậy mỗi thư mục có bản sao `.claude/` và `CLAUDE.md` này.',
        '- Nguồn chuẩn của `.claude` là LÕI. Sửa ở lõi, rồi chạy ở thư mục dự án: `node scripts/sync-claude-dirs.mjs --write` (kiểm: `node scripts/sync-claude-dirs.mjs`). Đừng sửa tay bản sao.',
        '- Cổng và công cụ cấp dự án chạy từ thư mục dự án (`node scripts/…`); công cụ của khung BMAD chạy từ thư mục lõi.',
      ]),
    '- Hook của dự án chặn lệnh dựng FE (`npm run build`, `ng build`) từ phiên Claude: coder tự build ở terminal; kiểm kiểu bằng `ngc --noEmit` thì được.',
    '',
  ].join('\n');
}

/**
 * Hàm làm gì: lập kế hoạch toàn bộ tệp cần có ở dự án + từng repo phần mềm (chưa ghi gì).
 * @param {{coreRoot:string, projectRoot:string, apps:{code:string, name:string, root:string}[], groupRoot?:string}} ctx Bố cục thật (hoặc cây giả khi tự kiểm). `groupRoot` = thư mục CHỨA dự án + các phần mềm, chỉ có khi nó không phải repo git.
 * @param {{group?: boolean|'auto'}} [opt] `group: true` ⇒ tính cả thư mục chứa (tạo mới nếu chưa có); `'auto'` (mặc định) ⇒ chỉ tính khi nơi đó ĐÃ có `CLAUDE.md` hoặc `.claude` (máy nào bật thì máy đó được canh lệch, máy khác không bị đỏ); `false` ⇒ không tính.
 * @returns {{targets:{name:string, root:string, group?:boolean}[], files:{abs:string, content:Buffer|string}[], commandDirs:{dir:string, names:Set<string>}[], skippedGroup?:{root:string, others:string[]}}} Danh sách thư mục đích, tệp mong muốn (tuyệt đối), mỗi thư mục lệnh, tập tên tệp được phép có (để phát hiện tệp thừa) và — khi thư mục chứa còn có DỰ ÁN KHÁC — `skippedGroup` (thư mục chứa bị bỏ qua, không ghi, không kiểm).
 */
export function plan(ctx, opt = {}) {
  const src = loadSource(ctx.coreRoot);
  const all = [{ name: path.basename(ctx.projectRoot), root: ctx.projectRoot }, ...ctx.apps.map((a) => ({ name: a.name, root: a.root }))];
  const mode = opt.group ?? 'auto';
  const wantGroup = Boolean(ctx.groupRoot) && (mode === true || (mode === 'auto' && (fs.existsSync(path.join(ctx.groupRoot, 'CLAUDE.md')) || fs.existsSync(path.join(ctx.groupRoot, '.claude')))));
  // Thư mục chứa còn có DỰ ÁN KHÁC (có `workspace.json`) ⇒ `CLAUDE.md` / `.claude` ở đó thuộc dự án đầu tiên dựng nó: bỏ qua, KHÔNG ghi đè, KHÔNG canh lệch (hai dự án giành nhau một tệp sẽ phá bản của nhau mỗi lần `--write`).
  const sharedWith = wantGroup ? projectsSharingGroup(ctx) : [];
  const groupOn = wantGroup && sharedWith.length === 0;
  if (groupOn) all.push({ name: path.basename(ctx.groupRoot), root: ctx.groupRoot, group: true, groupIsRepo: Boolean(ctx.groupIsRepo) });
  const files = [];
  const commandDirs = [];
  for (const t of all) {
    const others = [ctx.coreRoot, ctx.projectRoot, ...ctx.apps.map((a) => a.root)].filter((r) => path.resolve(r) !== path.resolve(t.root));
    // Thư mục chứa: chỉ cần lõi (dự án + phần mềm nằm ngay dưới nó). Repo phần mềm: lõi + dự án. Dự án: thêm mọi phần mềm.
    const needed = t.group ? [ctx.coreRoot] : t.root === ctx.projectRoot ? others : others.filter((r) => r === ctx.coreRoot || r === ctx.projectRoot);
    files.push({ abs: path.join(t.root, '.claude', 'settings.json'), content: renderSettings(src.hooks, relDirs(t.root, needed)) });
    files.push({ abs: path.join(t.root, 'CLAUDE.md'), content: renderClaudeMd(t, ctx) });
    for (const [name, buf] of src.commands) files.push({ abs: path.join(t.root, '.claude', 'commands', name), content: buf });
    commandDirs.push({ dir: path.join(t.root, '.claude', 'commands'), names: new Set(src.commands.keys()) });
  }
  return { targets: all, files, commandDirs, skippedGroup: sharedWith.length ? { root: ctx.groupRoot, others: sharedWith } : undefined };
}

/**
 * Hàm làm gì: liệt kê các dự án KHÁC nằm dưới cùng thư mục chứa — thư mục con (không phải dự án này, không phải repo phần mềm của dự án này) có `workspace.json`.
 * @param {{projectRoot:string, apps:{root:string}[], groupRoot?:string}} ctx Bố cục thật (hoặc cây giả khi tự kiểm).
 * @returns {string[]} Tên thư mục các dự án khác (rỗng = thư mục chứa chỉ có dự án này). Không có `groupRoot` hoặc không đọc được thư mục ⇒ rỗng. Chỉ đọc, không ghi.
 */
export function projectsSharingGroup(ctx) {
  if (!ctx.groupRoot) return [];
  const norm = (p) => path.resolve(p).toLowerCase();
  const mine = new Set([ctx.projectRoot, ...ctx.apps.map((a) => a.root)].map(norm));
  let entries = [];
  try { entries = fs.readdirSync(ctx.groupRoot, { withFileTypes: true }); } catch { return []; }
  return entries
    .filter((e) => e.isDirectory() && !mine.has(norm(path.join(ctx.groupRoot, e.name))) && fs.existsSync(path.join(ctx.groupRoot, e.name, 'workspace.json')))
    .map((e) => e.name);
}

/**
 * Hàm làm gì: so kế hoạch với đĩa — báo tệp thiếu, tệp lệch nội dung và tệp `.md` thừa trong `.claude/commands` của bản sao.
 * @param {ReturnType<typeof plan>} p Kết quả của {@link plan}.
 * @returns {string[]} Danh sách vấn đề (tiếng Việt, mỗi phần tử một dòng); rỗng = khớp hoàn toàn.
 */
export function check(p) {
  const problems = [];
  for (const f of p.files) {
    const want = Buffer.isBuffer(f.content) ? f.content : Buffer.from(f.content, 'utf8');
    if (!fs.existsSync(f.abs)) { problems.push(`thiếu: ${f.abs}`); continue; }
    if (!fs.readFileSync(f.abs).equals(want)) problems.push(`lệch so với lõi: ${f.abs}`);
  }
  for (const c of p.commandDirs) {
    if (!fs.existsSync(c.dir)) continue;
    for (const n of fs.readdirSync(c.dir).filter((x) => x.endsWith('.md'))) if (!c.names.has(n)) problems.push(`thừa (lõi không có): ${path.join(c.dir, n)}`);
  }
  return problems;
}

/**
 * Hàm làm gì: ghi kế hoạch ra đĩa — tạo thư mục còn thiếu, ghi tệp thiếu / lệch; tuỳ chọn xoá `.md` thừa trong thư mục lệnh của bản sao.
 * @param {ReturnType<typeof plan>} p Kết quả của {@link plan}.
 * @param {{prune?:boolean}} [opt] `prune: true` ⇒ xoá tệp `.md` thừa.
 * @returns {{written:number, pruned:number}} Số tệp đã ghi (chỉ tính tệp thật sự đổi) và số tệp đã xoá. Tác dụng phụ: ghi / xoá tệp ở các thư mục đích.
 */
export function write(p, opt = {}) {
  let written = 0, pruned = 0;
  for (const f of p.files) {
    const want = Buffer.isBuffer(f.content) ? f.content : Buffer.from(f.content, 'utf8');
    if (fs.existsSync(f.abs) && fs.readFileSync(f.abs).equals(want)) continue;
    fs.mkdirSync(path.dirname(f.abs), { recursive: true });
    fs.writeFileSync(f.abs, want);
    written++;
  }
  if (opt.prune) {
    for (const c of p.commandDirs) {
      if (!fs.existsSync(c.dir)) continue;
      for (const n of fs.readdirSync(c.dir).filter((x) => x.endsWith('.md') && !c.names.has(x))) { fs.rmSync(path.join(c.dir, n)); pruned++; }
    }
  }
  return { written, pruned };
}

/**
 * Hàm làm gì: dựng ngữ cảnh THẬT của dự án này (lõi, dự án, các repo phần mềm) từ `workspace.json`.
 * @returns {{coreRoot:string, projectRoot:string, apps:{code:string, name:string, root:string}[], groupRoot?:string}} Bố cục thật. `groupRoot` có khi dự án và mọi repo phần mềm cùng nằm dưới MỘT thư mục cha KHÔNG phải repo git. Ném lỗi nếu không chạy kiểu tách.
 */
export function realContext() {
  if (!isSplit || !PLATFORM_ROOT) throw new Error('không chạy kiểu kho TÁCH (thiếu workspace.json hoặc lõi) — công cụ này chỉ có nghĩa ở bố cục tách');
  const list = apps().map((a) => ({ code: a.code, name: path.basename(a.repoRoot), root: a.repoRoot }));
  const parent = path.resolve(path.dirname(PROJECT_ROOT));
  const sameParent = [PROJECT_ROOT, ...list.map((a) => a.root)].every((r) => path.resolve(path.dirname(r)) === parent);
  const groupRoot = sameParent ? parent : undefined;
  // Thư mục chứa có `.git` (thư mục cha là gốc một repo riêng) ⇒ `.claude` + CLAUDE.md ở đó được commit; không có ⇒ bản riêng của máy.
  const groupIsRepo = Boolean(groupRoot) && fs.existsSync(path.join(parent, '.git'));
  return { coreRoot: PLATFORM_ROOT, projectRoot: PROJECT_ROOT, apps: list, groupRoot, groupIsRepo };
}

/**
 * Hàm làm gì: điểm vào dòng lệnh — `--check` (mặc định) hoặc `--write [--prune]`.
 * @param {string[]} argv Đối số sau tên tệp.
 * @returns {number} Mã thoát (0 = khớp / đã ghi xong; 1 = có lệch ở chế độ kiểm, hoặc lỗi môi trường: không chạy kiểu tách · lõi thiếu `.claude/commands` · khác ổ đĩa). Tác dụng phụ: in báo cáo; `--write` ghi tệp.
 */
export function main(argv) {
  let ctx, p;
  try {
    ctx = realContext();
    if (argv.includes('--group') && !ctx.groupRoot) { console.log('sync-claude-dirs: --group cần dự án và mọi repo phần mềm cùng nằm dưới MỘT thư mục cha — ở đây không đúng.'); return 1; }
    p = plan(ctx, { group: argv.includes('--group') ? true : 'auto' });
  } catch (e) {
    // Lỗi môi trường (không chạy kiểu tách · lõi thiếu .claude/commands · khác ổ đĩa…): in thông báo gọn thay vì stack trace.
    console.log(`sync-claude-dirs: ${e.message}`);
    return 1;
  }
  if (p.skippedGroup) console.log(`sync-claude-dirs: thư mục chứa «${path.basename(p.skippedGroup.root)}» còn có dự án khác (${p.skippedGroup.others.join(', ')}) — \`CLAUDE.md\` / \`.claude\` ở đó thuộc dự án đó: công cụ KHÔNG ghi và KHÔNG kiểm thư mục này.`);
  if (argv.includes('--write')) {
    const r = write(p, { prune: argv.includes('--prune') });
    console.log(`sync-claude-dirs: đã ghi ${r.written} tệp, xoá ${r.pruned} tệp thừa (${p.targets.length} thư mục đích).`);
    return 0;
  }
  const problems = check(p);
  if (problems.length === 0) { console.log(`sync-claude-dirs: ${p.targets.length} thư mục đích khớp lõi (${p.files.length} tệp).`); return 0; }
  for (const x of problems.slice(0, 40)) console.log(`  ✗ ${x}`);
  if (problems.length > 40) console.log(`  … và ${problems.length - 40} dòng nữa`);
  console.log(`sync-claude-dirs: ${problems.length} lệch — chạy: node scripts/sync-claude-dirs.mjs --write`);
  return 1;
}

/**
 * Hàm làm gì: tự kiểm trên cây giả trong thư mục tạm (ca thuận + ca âm). Tác dụng phụ: tạo và xoá thư mục tạm; in từng ca.
 * @returns {number} Số ca sai (0 = đạt).
 */
export function selftest() {
  let bad = 0;
  const ok = (name, cond) => { if (!cond) bad++; console.log(`${cond ? 'OK  ' : 'BAD '}${name}`); };
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'sync-claude-'));
  try {
    const core = path.join(tmp, '0.core'), proj = path.join(tmp, '1.P', 'proj'), a1 = path.join(tmp, '1.P', 'app-a'), a2 = path.join(tmp, '1.P', 'app-b');
    fs.mkdirSync(path.join(core, '.claude', 'commands'), { recursive: true });
    for (const d of [proj, a1, a2]) fs.mkdirSync(d, { recursive: true });
    fs.writeFileSync(path.join(core, '.claude', 'commands', 'vibe.md'), 'Đọc _bmad/vibe.prompt.md\n');
    fs.writeFileSync(path.join(core, '.claude', 'commands', 'stack.md'), 'stack\n');
    const hooks = { PreToolUse: [{ matcher: 'Bash', hooks: [{ type: 'command', command: 'echo chan' }] }] };
    fs.writeFileSync(path.join(core, '.claude', 'settings.json'), JSON.stringify({ permissions: { allow: ['Bash(x)'] }, hooks }));
    const ctx = { coreRoot: core, projectRoot: proj, apps: [{ code: 'AAA', name: 'app-a', root: a1 }, { code: 'BBB', name: 'app-b', root: a2 }] };
    const p = plan(ctx);
    ok('chưa ghi ⇒ báo thiếu', check(p).some((x) => x.startsWith('thiếu:')));
    ok('--write ghi đủ rồi --check sạch', write(p).written > 0 && check(p).length === 0);
    ok('ghi lần hai không đổi gì', write(p).written === 0);
    const sa = JSON.parse(fs.readFileSync(path.join(a1, '.claude', 'settings.json'), 'utf8'));
    ok('hook của lõi được chép, KHÔNG chép danh sách allow của lõi', JSON.stringify(sa.hooks) === JSON.stringify(hooks) && sa.permissions.allow === undefined);
    ok('repo phần mềm: additionalDirectories = lõi + dự án (tương đối)', JSON.stringify(sa.permissions.additionalDirectories) === JSON.stringify(['../../0.core', '../proj']));
    const sp = JSON.parse(fs.readFileSync(path.join(proj, '.claude', 'settings.json'), 'utf8'));
    ok('dự án: additionalDirectories = lõi + mọi phần mềm', JSON.stringify(sp.permissions.additionalDirectories) === JSON.stringify(['../../0.core', '../app-a', '../app-b']));
    const md = fs.readFileSync(path.join(a1, 'CLAUDE.md'), 'utf8');
    ok('CLAUDE.md: có dấu hiệu tệp sinh + chỉ đúng thư mục lõi + đánh dấu «đang mở»', md.startsWith(GENERATED) && md.includes('`../../0.core`') && md.includes('← đang mở ở đây') && md.includes('src/Apps/AAA/BE/x'));
    fs.writeFileSync(path.join(a2, '.claude', 'commands', 'vibe.md'), 'sửa tay\n');
    ok('CA PHÁ: sửa tay một lệnh ⇒ báo lệch đúng tệp', check(p).some((x) => x.startsWith('lệch so với lõi:') && x.includes('app-b')));
    write(p);
    fs.writeFileSync(path.join(proj, 'CLAUDE.md'), md);
    ok('CA PHÁ: CLAUDE.md sai nội dung ⇒ báo lệch', check(p).some((x) => x.includes('CLAUDE.md')));
    write(p);
    fs.writeFileSync(path.join(a1, '.claude', 'commands', 'la.md'), 'thừa\n');
    ok('CA PHÁ: lệnh thừa ⇒ báo thừa, --write KHÔNG xoá', check(p).some((x) => x.startsWith('thừa')) && (write(p), fs.existsSync(path.join(a1, '.claude', 'commands', 'la.md'))));
    ok('--prune xoá lệnh thừa', write(p, { prune: true }).pruned === 1 && check(p).length === 0);
    fs.rmSync(path.join(a1, '.claude', 'settings.json'));
    ok('CA PHÁ: thiếu settings.json ⇒ báo thiếu', check(p).some((x) => x.startsWith('thiếu:') && x.includes('settings.json')));
    fs.rmSync(path.join(core, '.claude', 'commands'), { recursive: true });
    let threw = false; try { plan(ctx); } catch { threw = true; }
    ok('lõi không có thư mục lệnh ⇒ plan ném lỗi (không sinh bản sao rỗng)', threw);

    // --- relDirs: đường dẫn tương đối hợp lệ + chặn khác ổ đĩa. Ký hiệu ổ đĩa C: / D: dưới đây là GIẢ, chỉ để thử `path.win32` ở mọi hệ điều hành (không phải đường dẫn thật).
    ok('relDirs: tương đối dùng dấu / và tính từ thư mục khởi chạy', JSON.stringify(relDirs('/x/p/app', ['/x/0.core', '/x/p/proj'], path.posix)) === JSON.stringify(['../../0.core', '../proj']) && JSON.stringify(relDirs('/x/a', ['/x/a'], path.posix)) === JSON.stringify(['.']));
    ok('CA PHÁ: relDirs khác ổ đĩa (C: → D:) ⇒ ném lỗi «khác ổ đĩa», KHÔNG trả đường dẫn tuyệt đối', (() => { try { relDirs('C:\\p\\app', ['D:\\core'], path.win32); return false; } catch (e) { return /khác ổ đĩa, không tạo được đường dẫn tương đối/.test(e.message); } })());
    ok('relDirs: cùng ổ đĩa kiểu Windows vẫn ra đường dẫn tương đối dấu /', JSON.stringify(relDirs('C:\\p\\app', ['C:\\core', 'C:\\p\\proj'], path.win32)) === JSON.stringify(['../../core', '../proj']));

    // --- Thư mục CHỨA (thư mục cha chung): không phải repo git; chỉ tính khi bật.
    fs.mkdirSync(path.join(core, '.claude', 'commands'), { recursive: true });
    fs.writeFileSync(path.join(core, '.claude', 'commands', 'vibe.md'), 'Đọc _bmad/vibe.prompt.md\n');
    fs.writeFileSync(path.join(core, '.claude', 'commands', 'stack.md'), 'stack\n');
    fs.writeFileSync(path.join(core, '.claude', 'settings.json'), JSON.stringify({ hooks }));
    const group = path.join(tmp, '1.P');
    const gctx = { ...ctx, groupRoot: group };
    ok('thư mục chứa CHƯA bật ⇒ không có trong kế hoạch (máy khác không bị đỏ)', plan(gctx).targets.every((t) => !t.group) && plan(ctx).targets.length === 3);
    const gp = plan(gctx, { group: true });
    ok('--group ⇒ có đích thư mục chứa', gp.targets.some((t) => t.group && t.root === group));
    write(gp);
    const sg = JSON.parse(fs.readFileSync(path.join(group, '.claude', 'settings.json'), 'utf8'));
    ok('thư mục chứa: additionalDirectories chỉ có lõi + chép hook', JSON.stringify(sg.permissions.additionalDirectories) === JSON.stringify(['../0.core']) && JSON.stringify(sg.hooks) === JSON.stringify(hooks));
    const gm = fs.readFileSync(path.join(group, 'CLAUDE.md'), 'utf8');
    const gRepoMd = renderClaudeMd({ name: '1.P', root: group, group: true, groupIsRepo: true }, gctx);
    ok('thư mục chứa LÀ gốc repo git ⇒ CLAUDE.md nói «gốc repo git» (không còn «KHÔNG phải repo git»)', gRepoMd.includes('gốc repo git') && !gRepoMd.includes('KHÔNG phải repo git'));
    ok('thư mục chứa: CLAUDE.md nói KHÔNG phải repo git + chỉ đúng dự án / phần mềm / lõi', gm.includes('KHÔNG phải repo git') && gm.includes('`proj`') && gm.includes('`app-a`') && gm.includes('`../0.core`') && gm.includes('src/Apps/AAA/BE/x') && gm.includes('node proj/scripts/sync-claude-dirs.mjs'));
    ok('đã bật ⇒ chế độ tự động tự tính thư mục chứa và khớp', plan(gctx).targets.some((t) => t.group) && check(plan(gctx)).length === 0);
    fs.writeFileSync(path.join(group, '.claude', 'commands', 'vibe.md'), 'sửa tay\n');
    ok('CA PHÁ: sửa tay lệnh ở thư mục chứa ⇒ báo lệch', check(plan(gctx)).some((x) => x.startsWith('lệch so với lõi:') && x.includes(path.join('1.P', '.claude'))));

    // --- Thư mục chứa DÙNG CHUNG với dự án khác: CLAUDE.md ở đó thuộc dự án đầu tiên ⇒ KHÔNG ghi đè, KHÔNG canh lệch.
    write(gp); // đưa thư mục chứa về đúng bản của dự án này
    fs.mkdirSync(path.join(group, 'other-proj'), { recursive: true });
    fs.writeFileSync(path.join(group, 'other-proj', 'workspace.json'), '{}');
    const foreignMd = `${GENERATED}\n# bản của DỰ ÁN KHÁC — không được đụng\n`;
    fs.writeFileSync(path.join(group, 'CLAUDE.md'), foreignMd);
    const sp2 = plan(gctx, { group: true });
    ok('thư mục chứa có dự án khác ⇒ bỏ qua, ghi rõ dự án nào (skippedGroup)', sp2.targets.every((t) => !t.group) && sp2.skippedGroup?.others.join() === 'other-proj');
    write(sp2, { prune: true });
    ok('CA PHÁ: --write (kể cả --group) KHÔNG ghi đè CLAUDE.md của dự án khác ở thư mục chứa', fs.readFileSync(path.join(group, 'CLAUDE.md'), 'utf8') === foreignMd);
    ok('thư mục chứa dùng chung: --check KHÔNG báo lệch ở thư mục chứa (không giành quyền)', check(sp2).every((x) => !x.includes(path.join('1.P', 'CLAUDE.md'))));
    fs.rmSync(path.join(group, 'other-proj'), { recursive: true });
    ok('gỡ dự án khác ⇒ thư mục chứa KHÔNG còn bị coi là dùng chung (dự án + repo phần mềm của chính nó không tính)', projectsSharingGroup(gctx).length === 0 && plan(gctx, { group: true }).targets.some((t) => t.group));
  } finally { fs.rmSync(tmp, { recursive: true, force: true }); }
  console.log(bad ? `${bad} ca SAI` : 'sync-claude-dirs selftest: tất cả ca đúng kỳ vọng');
  return bad;
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  process.exit(process.argv.includes('--selftest') ? (selftest() ? 1 : 0) : main(process.argv.slice(2)));
}
