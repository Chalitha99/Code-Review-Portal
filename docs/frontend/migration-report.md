# Code Review Portal migration report

## Result

The completed Code Review frontend is integrated under `src/portals/code-review` without replacing the destination scaffold. Delivery and Wiki placeholders remain intact. `/crp/...` is canonical; legacy Developer, Reviewer and Admin deep links redirect with their path parameters, query strings and fragments intact.

The destination application owns the router, shell, error boundary, provider/query client, session cleanup, scroll restoration, toaster, role guards, style entry, contracts and MSW bootstrap. Migrated features do not retain a second router, provider tree, API client or mock database.

## Preserved wiring and cleanup

- Developer dashboard, filtering, creation/edit wizard, derived identifiers/titles, checklist applicability/validation, drafts, submission, confirmation, task detail, feedback response, resubmission and analytics.
- Reviewer available/assigned/history queues, self-review exclusion, pick-up, ranking, findings/screenshots, decisions, history, handover and analytics.
- Admin task/user/customer/checklist/handover management and reports.
- notifications and canonical deep links; responsive/motion/accessibility behavior; source content and seeded mock behavior.
- source-only dependencies added only where imported: Atlassian drag/drop + hitbox, Radix Switch and TanStack Table.
- known `ChecklistSummary` and task-detail QA typing defects fixed. The stale Admin Reports baseline now passes against migrated seeded-data behavior.
- a browser-only submission race was fixed by retaining the completed draft until navigation unmounts the wizard; new-task entry/create-another paths remain responsible for reset.
- checklist radio controls now update selection with arrow-key focus, and amber selected states use a WCAG-AA contrast token.

## Verification performed

| Command/check                         | Result                                                                                              |
| ------------------------------------- | --------------------------------------------------------------------------------------------------- |
| `npm run typecheck`                   | pass                                                                                                |
| `npm run lint`                        | pass                                                                                                |
| `npm run format:check`                | pass                                                                                                |
| `npm run test`                        | pass: 43 files, 506 tests                                                                           |
| `npm run build`                       | pass; Vite reports a non-fatal >500 kB main-chunk warning                                           |
| `npm run build-storybook`             | pass                                                                                                |
| focused Playwright login + acceptance | login 10/10; all seven acceptance journeys passed after fixes (full acceptance plus focused reruns) |
| development server                    | pass at configured `http://localhost:5175` (ready in under one second when run directly)            |

## Known environment/tooling limitations

- `npm run test:coverage` instruments successfully but five interaction tests exceeded the shared 20-second test budget under coverage/OneDrive load. The same 506 tests pass without instrumentation, so no coverage percentage was claimed.
- `npm run test:storybook` is blocked by Vite failing to parse Vitest's virtual browser module when the Windows checkout path contains an apostrophe (`Completed UI's`). The static Storybook build succeeds.
- The first full Playwright run exposed a stale harness port (`5173` versus destination Vite `5175`) and old home expectations; both were corrected. A subsequent 212-test run was intentionally narrowed after slow failing acceptance cases identified test synchronization issues. Login and all business acceptance journeys were then verified; the entire 212-test matrix was not re-run to completion.
- jsdom emits non-fatal pseudo-element `getComputedStyle` and canvas-not-implemented notices during chart/accessibility tests.
- production and Storybook builds warn about large generated chunks; this is a performance follow-up, not a functional failure.

## Remaining architectural note

Lowercase identifiers are canonical for workspaces/routes. The migrated source user records still expose Pascal-case role labels through their existing runtime schema to preserve seeded behavior. The replan records wire-level lowercase normalization as required work to coordinate with the production identity contract rather than silently changing the observable mock contract during parity migration.
