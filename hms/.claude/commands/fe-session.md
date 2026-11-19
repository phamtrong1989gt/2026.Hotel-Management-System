---
description: "Start FE session (FE framework _bmad/custom/fe — Angular gradus codify) — load context + apply folder-scope rules"
---

# Session: FE framework (`_bmad/custom/fe`)

**FE Angular (gradus) framework codify session.** Từ v5.2.0 FE framework đã di trú vào `_bmad/custom/fe/` (không còn `_bmad_fe/` top-level). Folder-scope rules:
- TOUCH: `_bmad/custom/fe/**`, `{app_contracts}/modules/**` (thư mục `_shared` của hợp đồng không còn)
- DON'T TOUCH: `_bmad/custom/{skills,prompts,templates}/**` + phần còn lại của `_bmad/**` (BE + shared), mã BE (`{app_be}/**`, `src/Core/{Framework,Host,Modules,Tests}/**`, `src/Services/*/BE/**`), `{app_fe}/src/app/modules/**` (module lõi cục bộ — đọc-only)
- **VÙNG CẤM MỚI — `src/Core/FE/**`** (NGUỒN FE DÙNG CHUNG: `platform/` + module `audit-log|operations|notification` + `tools/` + `tests/` — vùng cấm cũ là thư mục `platform/` chép trong từng ứng dụng FE; nay phần đó chỉ còn MỘT bản ở đây và HIỆN KHÔNG được bảo vệ bằng gì ngoài luật này). Đọc-only với phiên FE của một phần mềm. Sửa phần chung chỉ có MỘT quy trình (R-fe.27): sửa ĐÚNG MỘT chỗ ở `src/Core/FE` → ghi `src/Core/FE/CHANGELOG.md` → `npm run check:shared` Ở `src/` — do phiên core thực hiện; phiên này gặp việc đó thì emit PROMPT BÀN GIAO, không tự sửa. Và KHÔNG tạo lại `{app_fe}/src/app/platform` hay chép module chung vào `{app_fe}/src/app/modules` (cổng `check:platform-sync` PS-02/03/04)
- Chạm BE/shared rule → emit PROMPT BÀN GIAO cho session BE (`custom/be` — hiện là `custom/{skills,prompts}`), không tự sửa

Apply memory: `[[bmad-fe-session-isolation]]` (folder-scope thay framework-tách), `[[scan-real-codebase-before-codify]]`.

**Phần mềm đang làm:** `{app_fe}` = `src/Apps/<Mã>/FE` (BDS | PMKT). Giá trị các biến `{app_*}`: `node scripts/lib/apps.mjs --vars --app <Mã>` (chạy ở thư mục DỰ ÁN, hoặc đặt `PTCORE_PROJECT_ROOT`).

---

## Step 1 — Load context

⚠️ **`_bmad/custom/fe/_session/` is git-ignored** (per-dev internal). Nếu thư mục/files chưa exist trên working copy → bootstrap từ template trước.

Đọc 3 files TRƯỚC khi làm gì khác (mirror `_bmad/_session/` pattern):
1. `_bmad/custom/fe/_session/resume.md` — AI entry point + workflow
2. `_bmad/custom/fe/_session/context.md` — current state + decisions + backlog + Pending decisions
3. `_bmad/custom/fe/_session/history.md` — 5 mục cuối (entries `[CROSS]` mirror với `_bmad/_session/history.md`)

Load on-demand:
- `_bmad/custom/fe/manifest.yaml` — version + roadmap + stack
- `_bmad/custom/fe/HOW-TO.md` — quick start chi tiết (có mục "FE của phần mềm MỚI · sửa phần dùng chung")
- `_bmad/custom/fe/custom/{conventions,naming-strategy,type-mapping,ui-derivation,fe-placement,vocabulary}.yaml`
- `_bmad/custom/fe/rules/_index.md` + `R-fe.{N}.*.md` — 28 R-fe.* rules (R-fe.27 nguồn chung · R-fe.28 namespace lưu trữ)
- `src/Core/FE/README.md` — kit dùng chung (cấu trúc, cổng `check:platform-sync` / `check:storage`, tạo FE phần mềm mới)

### Bootstrap (nếu `_session/` chưa exist on local working copy)
1. Tạo 4 files từ template (tham khảo git log gần nhất).
2. Hỏi user: "Phát hiện `_bmad/custom/fe/_session/` rỗng — bootstrap from latest known state OK?"
3. Sau bootstrap, proceed Step 1 đọc lại.

## Step 2 — Stack THỰC (gradus, recalibrated v0.3.0 — KHÔNG phải greenfield)

| Layer | Choice (gradus THẬT) |
|---|---|
| Framework | Angular 22.2.2 (standalone, TS 6.0.3) — **zone-based** (`provideZoneChangeDetection`); Angular 22 mặc định OnPush → khai `changeDetection` tường minh (màn kế thừa base = Eager) |
| State | **RxJS + FormGroup + props** (+ signal cục bộ; KHÔNG NgRx store) |
| Server state | **HttpClient + BaseCrudService + ResponseAdapter** (envelope `ApiResponseData<T>`) |
| DI | **ctor + TOKEN service cho super**; `inject()` cho phụ thuộc phụ |
| UI library | Material 22.2.2 + CDK qua `ct-*`/`g-*` (nút g-button — gate check:controls) + `columnConfigs` builder |
| i18n | **@ngx-translate**, prefix kebab, key `{modulePrefix}.{field}`; màn dự án MỚI `features/{feModule}/{resource}/i18n/{vi,en}.json`, module cũ gộp `{app_fe}/src/assets/i18n` |
| Nguồn dùng chung | `src/Core/FE` (`platform/` + `modules/{audit-log,operations,notification}`) — MỘT bản, ứng dụng KHÔNG chép (R-fe.27); `npm install` CHỈ ở `src/` (npm workspaces) |
| Nơi sinh | `{app_fe}/src/app/features/{feModule}/` (module chính của phần mềm = `main` — D1; `modules/` = lõi đóng băng) |
| Form | create+edit **1 MatDialog** (dual-mode) |
| Testing | **Chưa có khung test component** (Karma/Jasmine gỡ 2026-10-14); hàm thuần: `npm run check:unit` (`node --test`) |
| Guard | `npm run check` trong `{app_fe}` = chuỗi trong `package.json` (BDS/PMKT = 20 cổng 2026-11-01; **platform-sync · storage** đứng đầu rồi arch · module-parity · cells · glue · envelope · examples · controls · ui-rules · history · doc-v3 · i18n · dependent · department-region · maps · method-docs · camera-view-parity · export · unit); ở `src/`: `check:kit` · `check:shared` |
| Node | ≥22.22.3 / 24.15 (dải `engines` của `@angular/*` 22.2.2) |

Reference: `{app_fe}/src/app/features/main/place-category/**` (CRUD feature chuẩn) + `src/Services/Sso/FE/src/app/modules/identity/users/**` (list + edit + popup chi tiết đầy đủ nhất; đã gỡ khỏi BDS).

## Step 3 — Report context + tiếp tục

Sau khi đọc 3 files, report cho user: framework version hiện tại (từ manifest), state gần nhất (từ context.md), việc đang treo (Pending decisions / backlog). Rồi hỏi user muốn làm gì.

## Cross-stack handoff template

Khi user yêu cầu sửa BE/shared rule/skill từ session FE này:

> ❌ KHÔNG sửa trực tiếp — session FE chỉ touch `_bmad/custom/fe/**` + `{app_contracts}/modules/**`.
>
> PROMPT BÀN GIAO cho session BE:
> ```
> Session: BE (_bmad/custom/{skills,prompts} — tương lai custom/be)
> Task từ FE vX.Y.Z: [chi tiết]
> Files cần sửa: _bmad/custom/skills/{X}.md hoặc _bmad/custom/prompts/{Y}.prompt.md
> Rationale: [why]
> ```

Khi cần sửa NGUỒN FE DÙNG CHUNG (`src/Core/FE/**`) từ session FE này:

> ❌ KHÔNG sửa trực tiếp — nguồn chung đổi giao diện của MỌI phần mềm cùng lúc.
>
> PROMPT BÀN GIAO cho phiên core:
> ```
> Session: core FE (src/Core/FE) — quy trình R-fe.27
> Task từ FE vX.Y.Z: [chi tiết]
> Tệp cần sửa: src/Core/FE/{platform|modules/<x>}/…  (ĐÚNG MỘT chỗ)
> Phải làm kèm: dòng src/Core/FE/CHANGELOG.md (+ platform/CHANGELOG.md, platform/versions.ts nếu đổi API) · npm run check:shared Ở src/
> Rationale: [why] · Ứng dụng bị ảnh hưởng: BDS / PMKT / SSO
> ```

---

$ARGUMENTS
