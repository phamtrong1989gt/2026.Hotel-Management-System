---
description: "FE developer — đọc {app_contracts}/modules/{Module}/ (screens.yaml SLS v3) → gen module Angular vào {app_fe}/src/app/features/{feModule}/ cắm vừa platform gradus (nguồn chung src/Core/FE; FE framework _bmad/custom/fe)"
---

# `/fe-developer` — Gen module gradus từ contract

FE framework `_bmad/custom/fe`. Boundary: TOUCH (output) `{app_fe}/src/app/features/{feModule}/{resource}/` (kèm `i18n/{vi,en}.json` của module MỚI) + route con `{app_fe}/src/app/features/pages.routes.ts`; framework-codify `_bmad/custom/fe/**`. DON'T: `{app_fe}/src/app/modules/**` (lõi đóng băng), **`src/Core/FE/**` (NGUỒN DÙNG CHUNG: `platform/` + module `audit-log|operations|notification` — read-only với phiên này; sửa chỉ theo quy trình duy nhất R-fe.27 ở phiên core)**, `{app_fe}/src/app/platform` (KHÔNG được tồn tại — PS-02), `root.backend:`, mã BE (`{app_be}/**`, `src/Core/{Framework,Host,Modules,Tests}/**`, `src/Services/*/BE/**`), `_bmad/custom/{skills,prompts,templates}/**`. `{app_fe}` = `src/Apps/<Mã>/FE` của phần mềm đang làm (BDS | PMKT; `node scripts/lib/apps.mjs --vars --app <Mã>` — chạy ở thư mục DỰ ÁN, hoặc đặt `PTCORE_PROJECT_ROOT`).

Gen code **EXTENDS base classes gradus** (BaseCrudService / BaseMainModuleComponent / BaseDialogModuleComponent) + wrapper `ct-*`/`g-*` + i18n key — KHÔNG freestanding/greenfield.

## Load

```
{app_contracts}/modules/{Module}/{model,api,module,screens}.yaml + flow.md (nếu có)   ← SKIP root.backend; ui.yaml ĐÃ KHAI TỬ (gate C7)
_bmad/custom/fe/docs/fe-codegen-guide.md               ← ĐỌC TRƯỚC (HOW-TO code UI)
_bmad/custom/fe/custom/fe-ui-catalog.yaml              ← vocabulary đóng (cell/find/control/size/action)
_bmad/custom/fe/custom/{conventions,naming-strategy,type-mapping,ui-derivation,fe-placement}.yaml
_bmad/custom/fe/custom/skills/fe-developer.md          ← full skill (steps 0-8)
_bmad/custom/fe/custom/templates/*                     ← scaffold gradus-native
_bmad/custom/fe/rules/_index.md + R-fe.*.md
{app_fe}/UI-RULES.md                                   ← luật giao diện máy bắt (UI-01…13, HIS-01/02)
# base class + reference (đọc khi cần signature) — NGUỒN CHUNG, chỉ ĐỌC:
src/Core/FE/platform/core/base/base-crud.service.ts
src/Core/FE/platform/ui/base/{base-main-module,base-dialog-module,status-list-base}.component.ts + table-builders.ts
src/Core/FE/platform/core/utils/tree.util.ts           ← indentedTreeOptions / excludeSelfAndDescendants (ô chọn cha)
src/Core/FE/platform/doc-v3/examples/base-crud-page/base-crud-page-scaffold-generator/*.example.ts   ← khung lõi
{app_fe}/src/app/features/main/place-category/** · src/Services/Sso/FE/src/app/modules/identity/users/**   ← reference (users nay ở FE SSO, đã gỡ khỏi BDS)
```

## Thực thi (theo `_bmad/custom/fe/custom/skills/fe-developer.md`)

0. Contract + platform pre-check. `screens.yaml` THIẾU → STOP (chạy `/analyst`; ui.yaml đã khai tử v5.3.7 — KHÔNG fallback `ui.yaml.placement`).
   - **`screens.yaml` = NGUỒN CHÂN LÝ màn hình**: `feDomain` (parent/feModule/apiPrefix) → placement + baseUrl; `feDomain.parent` PHẢI = `features`; `feModule` = `main` cho module CHÍNH của phần mềm (`{module_project}`, spec `moduleName: Main` — D1, ngoại lệ `ALLOW.features.main` của `check:module-parity`), module phụ = kebab(`App.Modules.{X}`); beModule `PTCore.*` → STOP (lõi đóng băng). `screens[]` → màn cần gen + `uses`; `relations[]` → dialog phụ + master-detail.
1. Resolve UI schema: screens.yaml columns/nodes (SLS v3) > BE label > ui-derivation default → i18n key + ct-field type + columnConfigs.
2-6. Gen vào `{app_fe}/src/app/features/{feModule}/{resource}/`:
   - `{resource}.model.ts` (DTO≠Command; kiểu lô/xuất import `@core/models/batch-action.model`)
   - `{resource}.service.ts` (extends BaseCrudService, baseUrl = serverAPI + feDomain.apiPrefix + /{Entity})
   - `{resource}.component.ts(.html)` (extends BaseMainModuleComponent + columnConfigs col/cell/find) ← màn list
   - `edit/{resource}-edit.component.ts(.html)` (extends BaseDialogModuleComponent + fb.group + initFormWithDto) ← màn form
   - `changeDetection: ChangeDetectionStrategy.Eager`; pageActions có `this.historyPageAction` + `...this.basePageActions` + `this.baseHelpAction`, rowActions có `this.historyRowAction`
   - i18n module MỚI = `{app_fe}/src/app/features/{feModule}/{resource}/i18n/{vi,en}.json` (mỗi file một khoá gốc `{modulePrefix}` kebab, đủ CẢ vi + en — check:i18n I18N-FEATURES-PAIR); module cũ #1–#5 còn khối gộp ở `{app_fe}/src/assets/i18n/{vi,en}.json` (KHÔNG dời)
7. Route con `{app_fe}/src/app/features/pages.routes.ts`; menu + quyền (RoleController/RoleAction) → snippet cho coder (SQL coder chạy). KHÔNG sửa `src/Core/FE/**`/app config. Cần nhớ gì ở trình duyệt → `appLocalStorage`/`appSessionStorage`/`nsChannelName` (`@core/storage/ns-storage`), CẤM `localStorage`/`sessionStorage`/`BroadcastChannel('<tên trần>')` thẳng (R-fe.28); không gõ chuỗi trần `'app-secure'` (dùng `secureKeyDbName()`); FE MỚI không phải chủ cũ của origin khai `provideStorageNamespace('<ns>', { legacyMigration: false })`. An ninh giao diện (`check:security`, SEC-FE): mở URL do dữ liệu quyết định ⇒ `openUrlSafely` (`@core/utils/open-url.util`), KHÔNG `window.open(…)` thẳng / `[innerHTML]` / `bypassSecurityTrust*` / `eval`.
8. Complex/master-detail (relations 1-N/1-1) → dialog phụ focused (mirror users), KHÔNG FormArray giant.

Áp R-fe.1,2,3,4,5,11,13,14,16,17,18,19,21,22,23,24,25,26,27,28. Verify: `npm run check` trong `{app_fe}` (chuỗi trong `package.json`; BDS/PMKT = 22 cổng 2026-11-04, `check:platform-sync` + `check:storage` + `check:security` đứng đầu — FOREGROUND, Node ≥22.22.3/24.15: `PATH="/c/Program Files/nodejs:$PATH"`); build/AOT do CODER chạy (agent không build, không cắm route tạm). Rồi `/fe-review Module: {Module}`.

---

$ARGUMENTS
