# Developer Workspace guide

## Where behavior lives

- `src/portals/code-review/features/tasks/routes`: dashboard, analytics, new/edit wizard, task detail and confirmation composition.
- `features/tasks/components`: the three wizard steps and review-feedback response panel.
- `features/tasks/domain`: pure task, checklist, metric and response rules. Change these before changing page conditionals.
- `features/tasks/hooks/useTaskDraft.ts`: persisted wizard state, hydration, reset and draft lifecycle.
- `features/tasks/api`: TanStack Query reads/mutations and attachment boundary.
- `src/portals/code-review/components/checklist.tsx`: editable/read-only checklist controls shared with Reviewer.
- `src/lib/statusMachine.ts`, `permissions.ts`, `storedChecklist.ts`, `checklistOrdering.ts`: cross-feature invariants.
- `src/mocks/handlers.ts` and `db.ts`: executable API behavior and seeded records.
- `packages/contracts/src`: runtime validation and public data types.
- `src/constants/routePaths.ts`: canonical URLs and parameter builders.

## Dependency flow

Pages compose feature components and hooks. Hooks call the shared API client with contract schemas and query keys. MSW handlers validate the same contracts, enforce permissions/status rules, and mutate the single mock database. Reviewer/Admin views consume the resulting task/review records, so a Developer rule change can affect all three workspaces and reports.

## Change-impact map

| Change                                         | Inspect together                                                                                                                       |
| ---------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| task ID/title generation or details validation | `taskRules.ts`, `WizardDetailsStep.tsx`, `useTaskDraft.ts`, task create/update handlers, wizard tests                                  |
| checklist filtering/order/answers              | `checklistRules.ts`, `storedChecklist.ts`, `checklistOrdering.ts`, `WizardChecklistStep.tsx`, checklist handlers/Admin Checklist/tests |
| draft, edit or reset lifecycle                 | `useTaskDraft.ts`, `NewTaskEntry`, `NewTaskWizard.tsx`, confirmation, session cleanup and wizard/edit tests                            |
| submission/resubmission gate                   | `statusMachine.ts`, `responseRules.ts`, wizard/detail panels, submit/response handlers, Reviewer queue/report metrics                  |
| task status or permissions                     | contracts enums, `permissions.ts`, `statusMachine.ts`, badges/cells, every role guard/handler and route tests                          |
| dashboard filters/table                        | `TaskFilterBar`, `taskFilters.ts`, `taskColumns.tsx`, task queries/summary handlers and responsive tests                               |
| analytics                                      | `taskMetrics.ts`, review statistics, seeded data, chart components and reports                                                         |
| navigation/notification link                   | `routePaths.ts`, notification handlers/bell, route tree and legacy redirect tests                                                      |

## Before changing Developer behavior

1. Identify whether the rule is source-parity behavior, a formal specification requirement, or a proposed enhancement.
2. Update runtime contracts before producers/consumers when the data shape changes.
3. Keep business rules in domain modules and authorization/status enforcement in handlers, not only in disabled UI.
4. Check draft hydration, refresh, Back/Forward, direct URLs and session cleanup.
5. Check downstream Reviewer queues/forms, Admin actions, notifications and report metrics.
6. Add a pure-domain test plus the nearest route/component integration test; add Playwright coverage for browser-only focus, persistence, file, chart or responsive behavior.
7. Run format, typecheck, lint, unit tests, production build and the affected Playwright journeys.
