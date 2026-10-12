# Test run results

Copy this file to `qa/results/<date>-run-<NN>/results.md` (e.g.
`qa/results/2026-09-09-run-01/results.md`) before starting a pass. Do not edit
the case files under `qa/test-cases/` — record outcomes here instead.

## Run metadata

- **Date:**
- **Tester:**
- **Branch / commit:**
- **Build:** `npm run dev` at `http://localhost:5175`
- **Preflight (TC-ENV) result:** Pass / Fail — if Fail, the manual pass below
  is informational only until re-run

## Summary

| Area             | Total cases | Pass | Fail | Blocked | N/A |
| ---------------- | ----------- | ---- | ---- | ------- | --- |
| TC-ENV           |             |      |      |         |     |
| TC-AUTH          |             |      |      |         |     |
| TC-DEV-dashboard |             |      |      |         |     |
| TC-DEV-wizard    |             |      |      |         |     |
| TC-DEV-checklist |             |      |      |         |     |
| TC-REV-dashboard |             |      |      |         |     |
| TC-REV-review    |             |      |      |         |     |
| TC-REV-history   |             |      |      |         |     |
| TC-DEV-response  |             |      |      |         |     |
| TC-HAND          |             |      |      |         |     |
| TC-ADM-workspace |             |      |      |         |     |
| TC-RPT-reports   |             |      |      |         |     |
| TC-XCUT          |             |      |      |         |     |
| **Total**        |             |      |      |         |     |

## Case-level results

One row per case actually executed. Add rows as needed; omit cases marked
N/A for this run rather than leaving them blank.

| Case ID | Status | Notes / defect ref |
| ------- | ------ | ------------------ |
|         |        |                    |

## Defects filed

| Defect ref | Case ID | Severity | Summary | Status |
| ---------- | ------- | -------- | ------- | ------ |
|            |         |          |         |        |

## Deviations from the gap register

Anything that failed _not_ because of a known gap (i.e. a new, unexpected
defect) — list it here even if also filed above, so a reviewer of this run
doesn't have to cross-reference the defect tracker to see what's new.
