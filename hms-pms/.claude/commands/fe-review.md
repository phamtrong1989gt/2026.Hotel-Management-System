---
description: "FE review — gating checklist R-fe.* (gradus) trên module Angular (FE framework _bmad/custom/fe, MANDATORY pre-commit)"
---

# `/fe-review` — Pre-commit gating review (gradus)

FE framework `_bmad/custom/fe`. Adversarial — đọc code + đối chiếu contract + base class gradus. KHÔNG chỉ tin build/test xanh (`[[structural-verify-insufficient]]`). Review CHỈ REPORT: KHÔNG sửa `src/Core/FE/**` (nguồn dùng chung), `{app_fe}/src/app/modules/**` hay `{app_fe}/src/app/platform` — sửa phần chung chỉ theo quy trình duy nhất R-fe.27 (MỘT chỗ ở `src/Core/FE`, ghi `src/Core/FE/CHANGELOG.md`, `npm run check:shared` ở `src/`) do phiên core. `{app_fe}` = `src/Apps/<Mã>/FE` của phần mềm đang review.

## Load
```
_bmad/custom/fe/custom/{conventions,naming-strategy,ui-derivation}.yaml
_bmad/custom/fe/custom/fe-ui-catalog.yaml           ← vocabulary đóng (cell/find/control/size/action)
_bmad/custom/fe/custom/skills/fe-review.md          ← full checklist (nhóm 0 gate máy + 8 nhóm gradus)
_bmad/custom/fe/rules/_index.md + R-fe.*.md
{app_fe}/UI-RULES.md                                ← luật giao diện máy bắt (UI-01…13, HIS-01/02)
{app_contracts}/modules/{Module}/*.yaml             ← SKIP root.backend (screens.yaml → verify placement/screen→API)
src/Core/FE/platform/{ui,core}/base/**              ← base class (khi cần) — nguồn chung, chỉ ĐỌC
{file(s) FE review}
```

## Thực thi (theo `_bmad/custom/fe/custom/skills/fe-review.md`)
0. Gate máy: `npm run check` trong `{app_fe}` (chuỗi trong `package.json`; BDS/PMKT = 22 cổng 2026-11-04) — **`check:platform-sync` (PS-00…PS-06, KIT-01; R-fe.27) + `check:storage` (STORE-01…06 gồm 03b / 06; R-fe.28) + `check:security` (SEC-FE-00…05) đứng ĐẦU chuỗi**, rồi arch · module-parity · cells · glue · envelope · examples · controls · ui-rules · history · doc-v3 · i18n · dependent · department-region · maps · method-docs · camera-view-parity · export · unit · crypto-key (CK-01…09); BPHCM = 21 cổng: thêm `check:route-parity` (RP-01…05: route FE ↔ controller BE ↔ RouterLink SSO; đứng sau module-parity) và không có department-region · camera-view-parity; `npm run check:all` chạy hết không dừng ở cổng đỏ đầu. Chạm `src/Core/FE/**` ⇒ thêm `npm run check:kit` (ngc độc lập nguồn chung) + `npm run check:shared` CHẠY Ở `src/` (không nằm trong `npm run check` của FE) và dòng `src/Core/FE/CHANGELOG.md`. + `_bmad/tests/screens-check.ps1 -Module {app_contracts}/modules/{Module}` — đỏ = BLOCK.
1. Extends base classes (ERROR — R-fe.21).
2. DI ctor + TOKEN cho super (inject() phụ thuộc phụ OK) · **changeDetection khai tường minh (ERROR — R-fe.14: base = Eager, trình bày = OnPush, cấm Default)** · RxJS/props + signal cục bộ, KHÔNG store/httpResource (R-fe.2/3/5/12/13/14).
3. UI wrapper `g-*`/`ct-*` + nút `g-button` + g-dialog-header [actions] + template @if/@for (ERROR — R-fe.11 · WARN R-fe.4; gate check:controls).
4. columnConfigs builder + cell renderer tồn tại (ERROR — R-fe.22, check:cells) + nút Lịch sử HIS-01/02 (check:history) + ngày giờ qua formatter (UI-06/07).
5. i18n keys `{modulePrefix}.{field}` (prefix kebab): màn MỚI `features/{feModule}/{resource}/i18n/{vi,en}.json` (đủ vi + en), module cũ #1–#5 `{app_fe}/src/assets/i18n/{vi,en}.json` (check:i18n) (ERROR — R-fe.23).
6. Placement `features/{feModule}` (module chính = `main` — D1; module-parity MP-02) + layering (check:arch) — KHÔNG `modules/` (lõi đóng băng), KHÔNG `src/Core/FE/**`, KHÔNG tạo `src/app/platform` (ERROR — R-fe.24, R-fe.27). Không chép nguồn chung / không chạm `localStorage`·`sessionStorage`·`BroadcastChannel('<tên trần>')` thẳng (ERROR — R-fe.27/28).
7. Codegen fidelity: DTO/Command/service/validator/enum ↔ contract; envelope qua responseAdapter.
8. Form 1-dialog / batch BulkResult / master-detail dialog phụ (WARN — R-fe.17/19/20).

## Output
Verdict **BLOCK** (ERROR ❌) | **PASS-WITH-WARN** | **PASS**; mỗi finding `file:line` + fix. Nhắc chạy `npm run check`; build do coder chạy. Phân loại A/B/C/D (B/C/D → cập nhật `_bmad/custom/fe/**` + ghi UNRELEASED ở `_bmad/custom/fe/manifest.yaml`; chạm gradus platform / module chung → chỉ report).

---

$ARGUMENTS
