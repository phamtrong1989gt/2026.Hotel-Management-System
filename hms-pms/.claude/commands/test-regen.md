---
description: "Framework regression runner — baseline 01/02/03 dựng lại 2026-10-14 (`--lock`); chạy FULL LUỒNG BE + FE (spec-prep → analyst → spec-lint → developer → test → doc → review → fe-developer → fe-review), ghi thẳng sandbox thật, diff actual vs expected baseline, report PASS/FAIL/WARN"
argument-hint: "<01 | 02 | 03 | all> [--lock]"
---

> ✅ Baseline dựng lại 2026-10-14 (`--lock`): chế độ DIFF chạy được; `--lock` chỉ chạy khi coder yêu cầu (tốn token). **FULL LUỒNG BE + FE; mã sinh GHI THẲNG sandbox thật `App.Modules.Test` + `features/test` (không ghi tạm), 3 scenario chạy LẦN LƯỢT** — xem "Quy tắc ghi" ở `_bmad/tests/runner.md` + `_bmad/tests/regression/_index.md`.

Đọc và thực thi đầy đủ hướng dẫn tại `_bmad/tests/runner.md`.

$ARGUMENTS
