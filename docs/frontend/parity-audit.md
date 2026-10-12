# Code Review Portal — post-migration parity audit

Source of truth for behaviour: `Service-Delivery-Portal/CodeReviewPortal/Frontend/src` (**S**).
Destination: `Repo_SDP/apps/web/src` (**D**); `CR` = `D/portals/code-review`.
Baseline for review: commit `b93250b` (pre-sync); the sync and this audit's fixes are uncommitted.

Result legend: **matched** · **intentional** (destination-specific, explained) · **missing** · **changed** · **broken** · **fixed** (defect found and fixed by this audit) · **blocked**.

## Method

1. Mechanical map of every S file to its D counterpart, compared after stripping imports:
   92 identical, 170 differing, and 45 with no D counterpart.
2. Every differing pair was read for behavioural change (logic, conditions, validation, copy that changes meaning). Import paths and the destination UI kit were ignored.
3. Every D import, `content/*.json` key and `features/*/api` endpoint was checked for a matching file, key and MSW handler. All of them resolve.
4. Findings were verified against the running code and tests listed under each row.

S-only files with no D counterpart:

- **Destination shell:** `app/router.tsx`, `AppHeader.tsx`, `lazyRoutes.ts`, `workspaces/*`, `styles/global.css`. These are replaced by `routes/codeReviewRoutes.tsx`, `app/AppBar.tsx`, per-route `lazy` and `styles/Themes.css` + `base.css`.
- **Source orphans with no importers:** `ReviewCommentComposer.tsx`, `NamedRecordPanel.tsx`.
- **Everything else:** source QA tests. Their behaviours are covered below, by the migrated suites, or by this directory.

## Developer

| Flow                                                       | Expected (S)                                             | D path                                                                          | Observed in D                                                                                         | Result             | Risk | Fix / verification                                                                                   |
| ---------------------------------------------------------- | -------------------------------------------------------- | ------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- | ------------------ | ---- | ---------------------------------------------------------------------------------------------------- |
| Wizard step gating (customer, CRIM, task types, checklist) | `features/tasks/domain/taskRules.ts`                     | `CR/features/tasks/domain/taskRules.ts`                                         | Same rules                                                                                            | matched            | —    | `newTaskWizard.test.tsx`, `taskRules.test.ts`                                                        |
| Checklist visibility by task type                          | inline in `checklistRules.ts`                            | `lib/checklistVisibility.ts` (re-exported)                                      | Same logic, moved                                                                                     | matched            | —    | `checklistVisibility.test.ts`, `qualityChecklist.qa.test.tsx`                                        |
| Submit → confirmation → draft cleared                      | `NewTaskWizard.tsx:431` `draft.reset()`                  | `CR/features/tasks/routes/NewTaskWizard.tsx:419`, `SubmissionConfirmedPage.tsx` | Draft kept the submitted `taskId`, so a direct step URL reopened a non-Draft task and saves got a 409 | **fixed**          | med  | Reset on confirmation mount · `developer/submitClearsDraft.test.tsx`                                 |
| New task entry clears store                                | `app/routeAdapters.tsx`                                  | `CR/features/tasks/routes/NewTaskEntry.tsx`                                     | Same, moved beside the feature                                                                        | matched            | —    | `newTaskWizard.test.tsx`                                                                             |
| Resume / edit draft                                        | `EditTaskRedirect`, `useTaskDraft`                       | same names                                                                      | Identical                                                                                             | matched            | —    | `editTask.test.tsx` (D uses a Draft; the S test used ChangesRequested, contradicting `canEditDraft`) |
| My Tasks KPI cards ↔ filters                               | `DeveloperLayout`, `taskFilters`                         | same                                                                            | Same, except Approved now counts only Approved                                                        | matched            | —    | `myTasks.test.tsx`, `status/deliveredRemoval.test.tsx`                                               |
| Developer analytics                                        | `taskMetrics.ts`                                         | `CR/features/tasks/domain/taskMetrics.ts`                                       | Same once Delivered is removed                                                                        | matched            | —    | `taskMetrics.test.ts`, `developerAnalytics.test.tsx`                                                 |
| Task detail, review feedback, responses                    | `TaskDetailPage`, `ReviewFeedbackPanel`, `responseRules` | same                                                                            | Debug logs removed; copy moved to `tasks.json`                                                        | matched            | —    | `taskDetail.qa.test.tsx`, `reviewResponse.test.tsx`, `responseRules.test.ts`                         |
| Yes/No/N/A picker keyboard                                 | Radix arrow keys only                                    | `CR/components/checklist.tsx:99-112` adds its own handler                       | Browser check: ArrowRight from Yes selects No (one step); no double fire                              | matched (verified) | —    | Browser journey (see Verification)                                                                   |
| Search by compact generated title                          | `taskFilters.test.ts` "compact titles"                   | `CR/components/taskFilters.test.ts`                                             | Case dropped during sync                                                                              | missing test       | low  | Restored in place                                                                                    |

## Reviewer

| Flow                                            | Expected (S)                                                | D path                                                       | Observed in D                                                                                  | Result       | Risk | Fix / verification                                                             |
| ----------------------------------------------- | ----------------------------------------------------------- | ------------------------------------------------------------ | ---------------------------------------------------------------------------------------------- | ------------ | ---- | ------------------------------------------------------------------------------ |
| Available / My Review / History tabs, pick task | `ReviewQueuePage`                                           | `CR/features/reviews/routes/ReviewQueuePage.tsx`             | URL-filter sync moved from an effect to render time; same result                               | matched      | —    | `reviewQueue.test.tsx`, `shared/crossRoleJourney.test.tsx`                     |
| Reviewer KPI cards                              | `ReviewerLayout`                                            | same                                                         | Approved only (after Delivered removal)                                                        | matched      | —    | `reviewerAnalytics.test.tsx`                                                   |
| Draft autosave / manual save / failure          | `ReviewTaskPage.tsx:93-217` (refs)                          | `CR/.../ReviewTaskPage.tsx:105-260` (state + layout effects) | Implementation rewritten with the same logic; source tests not migrated                        | changed impl | med  | `reviewer/reviewAutosave.test.tsx`                                             |
| Rank / comment rules, decision dialog           | `reviewRules`, `ReviewerAssessment`, `ReviewDecisionDialog` | same                                                         | Same (`RANK_DETAILS` → `getRankLabel`, same text)                                              | matched      | —    | `reviewRules.test.ts`, `finalReviewDecisionUX.qa`, `commentFirstAssessment.qa` |
| Re-review adjudication, cycles                  | `reviewCycles` (inline)                                     | `lib/reviewCycles.ts`                                        | Same logic, moved                                                                              | matched      | —    | `reReviewAdjudication.qa`, `reviewCycles.test.ts`                              |
| Handover by reviewer                            | `HandoverDialog`                                            | same                                                         | Same                                                                                           | matched      | —    | `handover.test.tsx`, `postHandoverReviewerUX.qa`                               |
| Image lightbox                                  | `ImageLightboxModal.tsx:215-228`                            | `CR/components/ImageLightboxModal.tsx:228-240`               | Arrow keys at first/last image no longer `preventDefault`; viewport focusable only when zoomed | changed      | low  | Documented; not a demonstrated defect                                          |
| Mode E (finished review)                        | Approved                                                    | `ReviewTaskPage.tsx:545`                                     | Approved only (after removal)                                                                  | matched      | —    | —                                                                              |

## Admin

| Flow                                                                    | Expected (S)                                                         | D path                                                 | Observed in D                                                                    | Result                | Risk    | Fix / verification                                                                     |
| ----------------------------------------------------------------------- | -------------------------------------------------------------------- | ------------------------------------------------------ | -------------------------------------------------------------------------------- | --------------------- | ------- | -------------------------------------------------------------------------------------- |
| Tasks grid, assign, cancel (reason required), delete (SuperAdmin)       | `AdminTasksPage`                                                     | same                                                   | Same; D label says "Reason for cancellation" (S says "optional" but enforces it) | matched / intentional | —       | `adminWorkspace.test.tsx`                                                              |
| Users: role multi-select, SuperAdmin ⇒ Admin, last SuperAdmin protected | `AdminUsersPage`, `UserFormDialog`, `RoleMultiSelect`                | same                                                   | Identical                                                                        | matched               | —       | `adminWorkspace.test.tsx`, `superAdminAuthorization.test.ts`                           |
| Customers                                                               | `AdminCustomersPage`, `CustomerFormDialog`                           | same                                                   | Identical                                                                        | matched               | —       | `adminWorkspace.test.tsx`                                                              |
| Checklist editor: reorder, save/discard, leave guard                    | `UnifiedChecklistEditor`                                             | same                                                   | Effects rewritten as render-time state adjustment; same behaviour                | matched               | —       | `admin/checklistEditor.test.tsx`, `adminChecklist.test.tsx`                            |
| Task types: add/rename duplicate check, reorder                         | `TaskTypeManager`                                                    | same                                                   | Same                                                                             | matched               | —       | `admin/checklistEditor.test.tsx`                                                       |
| Handovers list, reassign / return to queue / cancel                     | `AdminHandoversPage`, `AdminHandoverActionsCard`, `api/handovers.ts` | same                                                   | Same; handlers identical                                                         | matched               | —       | `handover.test.tsx`, `handoverFilters.test.ts`                                         |
| Handover summary tooltips by keyboard                                   | `HandoverSummaryCard.tsx` L97/113/165 `tabIndex={0}`                 | `CR/features/admin/components/HandoverSummaryCard.tsx` | Tooltip triggers not focusable                                                   | **fixed**             | low–med | Focusable `<button type="button">` triggers · `admin/handoverSummaryKeyboard.test.tsx` |
| Reports                                                                 | `AdminReportsPage`, `reportMetrics`                                  | same                                                   | Extra Delivered card and filter option (baseline)                                | **fixed**             | low     | Removed with Delivered · `status/deliveredRemoval.test.tsx`                            |

## Shared, routing and data

| Flow                   | Expected (S)                 | D path                                          | Observed in D                                                                  | Result                                 | Risk | Fix / verification                                       |
| ---------------------- | ---------------------------- | ----------------------------------------------- | ------------------------------------------------------------------------------ | -------------------------------------- | ---- | -------------------------------------------------------- |
| Route table            | `app/routes.tsx`             | `routes/codeReviewRoutes.tsx`                   | Every path exists under `/crp/…`; legacy URLs redirect                         | intentional                            | —    | `router.test.tsx`                                        |
| Workspace guards       | `WORKSPACE_ACCESS`           | `config/routes.ts`                              | Identical; Admin no longer implies Developer/Reviewer                          | matched (behaviour change vs baseline) | med  | `shared/roleAccess.test.tsx`                             |
| Task status lifecycle  | `packages/types` enums       | `packages/contracts` enums, `lib/taskPolicy.ts` | Delivered status present, `Approved → Delivered` declared                      | **fixed**                              | med  | Removed (see below) · `status/statusLifecycle.test.ts`   |
| Mock API               | 66 endpoints                 | `mocks/handlers.ts`                             | Same method+path set, validation and status codes                              | matched                                | —    | full suite                                               |
| Seed data              | `mocks/data/*.json`          | same                                            | Equal except SEMCO-007 status; D adds 2 baseline users                         | fixed / intentional                    | —    | `status/deliveredRemoval.test.tsx`                       |
| Mock persistence       | `persistence.ts`             | same                                            | Identical; needs a migration for old Delivered snapshots                       | **fixed**                              | low  | Pre-parse migration · `status/deliveredRemoval.test.tsx` |
| Cross-role consistency | —                            | —                                               | Status, cycle and counters agree across workspaces                             | matched                                | —    | `shared/crossRoleJourney.test.tsx`                       |
| Design tokens          | `global.css` + config tokens | `styles/Themes.css`                             | All S tokens present; `ink-600/800/300/100`, `canvas-strong` undefined in both | matched (inherited)                    | low  | Documented                                               |

## Delivered status — decision

**Removed.** Requested by the project owner once the audit showed:

- the source has no Delivered status;
- nothing in the destination could reach it;
- the backend does not consume the contract's task status.

**Evidence**

- S `packages/types/src/enums.ts` has no Delivered; there, `Approved: []` and the terminal statuses are Approved and Cancelled.
- In D, Delivered could not be reached:
  - no MSW handler writes it;
  - there is no UI action for it;
  - `nextStatuses` and `canTransition` had only test callers.
- It was still exposed:
  - selectable in 3 status filters;
  - accepted via `?status=Delivered`;
  - shown as a separate Reports card;
  - present on one seed record (SEMCO-007, otherwise identical to the S record).
- `apps/api` imports only `apiErrorSchema` from `@sdp/contracts`.

**Changes**

- `packages/contracts/src/enums.ts` and `task.ts`. This is the one change outside `apps/web`, explicitly authorised.
- `apps/web` logic, labels, palette and tokens, the Reports card, the seed record, and the mock handlers and db.
- A `restoreDatabase` migration so a saved browser snapshot with a Delivered task loads as Approved instead of being discarded.

**Current transitions**

| From             | Allowed next                          |
| ---------------- | ------------------------------------- |
| Draft            | Submitted, Cancelled                  |
| Submitted        | InReview, Cancelled                   |
| InReview         | Approved, ChangesRequested, Cancelled |
| ChangesRequested | ReSubmitted, Cancelled                |
| ReSubmitted      | InReview, Cancelled                   |
| Approved         | —                                     |
| Cancelled        | —                                     |

`Draft → Cancelled` is a pre-existing destination contract edge that S lacks. It is never offered: `canCancelTask` excludes Draft, and developers discard drafts instead.

**Remaining:** Prisma `DELIVERED`, `TASK_DELIVERED` and `deliveredAt` in `apps/api` (backend is out of scope). Remove or keep them with the future Delivery Portal design.

## Out of scope / unresolved

| Item                                                         | Location                                                                      | Impact                                       | Next action          |
| ------------------------------------------------------------ | ----------------------------------------------------------------------------- | -------------------------------------------- | -------------------- |
| QA docs describe the removed editor and "F5 wipes mock data" | `qa/gap-register.md`, `qa/test-cases/TC-ADM-workspace.md`, `TC-REV-review.md` | Stale manual test cases                      | Update docs          |
| SuperAdmin missing in the real API's role codes              | `apps/api/src/modules/auth/auth.constants.ts:9`                               | SuperAdmin features only work against MSW    | Backend change       |
| `feedbackSummary` max 10,000 chars                           | `packages/contracts/src/review.ts`                                            | Legacy over-length drafts would 422          | Product decision     |
| Notification links use legacy `/developer…` paths            | `mocks/handlers.ts`, `mocks/data/notifications.json`                          | One extra redirect; navigation state dropped | Optional cleanup     |
| Portal Access page; theme/profile controls                   | —                                                                             | Not present in this phase                    | Skipped by direction |

## E2E follow-up — root causes and fixes

Each test was fixed one at a time and then re-run three times. The fixes are spec-only, except one approved app fix for a defect that predates the sync.

| Group                             | Tests                                                                            | Root cause                                                                                                                                                                                                                                                                                                                                                                                                           | Fix                                                                                                                                                                                                                                                                 |
| --------------------------------- | -------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Real app defect (since `b93250b`) | `mockWorkerRecovery.spec.ts:94`                                                  | With the mock worker stopped, requests reach Vite's `/api` proxy (`vite.config.ts`), which answers `502 text/plain` when no backend is listening. `isMockDetached()` only recognised a 404, so the one-shot recovery never ran and Handovers showed "This page ran into a problem".                                                                                                                                  | `apps/web/src/lib/apiClient.ts`: a non-JSON 502 also counts as detached (still DEV-only). Covered by `shared/mockDetachedRecovery.test.ts`, which fails without the fix. Spec: the stale "seed raises no handovers" premise was replaced by "Handovers lists rows". |
| Pre-existing spec drift           | `login.spec.ts:35`; `sessionExpiry.spec.ts` ×3                                   | Cookie auth: a signed-out page load gets `GET /api/auth/me` → 401 by design (`hooks/useSession.ts`). The session specs planted the source's `sdp.session` envelope and expected its "2 hours without activity" copy.                                                                                                                                                                                                 | Ignore only that expected 401. Plant the revoked identity under `sdp.mock-user-id` and assert the destination copy.                                                                                                                                                 |
| Loading races                     | `developer.spec.ts:348`, `reviewer.spec.ts:252`, plus 3 rewritten decision tests | Clicked a loading-skeleton row; read the charts before they mounted; clicked "View in Review History" while the dialog's own 850 ms redirect (`ReviewDecisionDialog.tsx`) was unmounting it.                                                                                                                                                                                                                         | Wait for a loaded task row, for the chart nodes, and for the redirect itself.                                                                                                                                                                                       |
| Sync drift (source parity)        | 5 acceptance, 1 developer, 4 reviewer, 8 admin, 6 responsive                     | The specs encoded UI the source replaced: the editable title (now a read-only generated `CUSTOMER-CRIM-VERSION`); a context-aware back link ("Back to …"); the General Check form (now rank + comments + confirm dialog); drafts in the admin grid; cancel without a reason; the tabbed checklist and its sessionStorage (now the unified editor with a leave-guard and `beforeunload`); `.rounded-card` stat cards. | Specs drive the current UI with the same intent. Removed features are asserted as their current contract, e.g. the unsaved order is guarded, not persisted, and is dropped when the session ends.                                                                   |

## Verification

Run on 2026-10-01. Commands from the repo root unless noted.

| Check                                                    | Command                                                    | Before audit (synced tree)                    | After audit                                                                   |
| -------------------------------------------------------- | ---------------------------------------------------------- | --------------------------------------------- | ----------------------------------------------------------------------------- |
| Typecheck (web, web-e2e, api)                            | `npm run typecheck`                                        | pass                                          | pass                                                                          |
| Lint                                                     | `npx eslint apps/web packages/contracts`                   | pass                                          | pass                                                                          |
| Unit / component / integration, with coverage thresholds | `npx vitest run --project unit --coverage` (in `apps/web`) | 666/666 (56 files)                            | **706/706 (64 files)**                                                        |
| Production build                                         | `npm run build:web`                                        | bundle ok                                     | pass                                                                          |
| Prettier, changed files only                             | `npx prettier --check <files>`                             | —                                             | pass                                                                          |
| Playwright e2e, full suite                               | `npx nx run @sdp/web-e2e:e2e`                              | 171 passed / 41 failed (parallel, under load) | **212/212** parallel (twice) and on one worker, after the e2e follow-up below |
| Playwright e2e on the pre-sync tree `b93250b`            | `npx playwright test` in an extracted copy                 | 206 passed / 6 failed                         | —                                                                             |

The e2e failures reported after the audit (30 parallel, 31 on one worker) were all root-caused and fixed in the follow-up below.

**Regression proof:** with each fix reverted, every D1 and D3 test failed (5/5). With the fixes restored, they pass.

**Browser journeys:** scripted with Playwright against `npm run dev:web`, Chromium at 1440×900. The script lives in a scratchpad, not in the repo. All 26 checks passed:

- **Shell:**
  - header shows the user;
  - Code Review home lists the 3 workspaces;
  - Delivery and Wiki "coming soon" pages render;
  - sign out returns to login.
- **Developer:**
  - My Tasks renders;
  - loaded rows open their detail page (3/3);
  - the Status filter has 8 options and no Delivered;
  - the full wizard reaches the confirmation page;
  - the picker's arrow key moves exactly one option;
  - **D1**: a step URL after submit opens an empty wizard;
  - Analytics renders.
- **Reviewer** (shared browser profile, so the developer's submission is visible):
  - picks that task;
  - autosave reaches "Saved";
  - Request Changes succeeds;
  - Analytics renders.
- **Admin:**
  - Tasks renders;
  - Reports shows 4 count cards and no Delivered;
  - checklist keyboard reorder and discard work;
  - **D3**: the handover tooltip opens on keyboard focus;
  - Users, Customers and Handovers render.

The only console error or HTTP ≥ 400 in any journey was `401 GET /api/auth/me` on a signed-out page load. That is pre-existing and also happens on `b93250b`.

**Edit boundary:** every change is under `apps/web/`, except the authorised Delivered removal in `packages/contracts/src/enums.ts` and `task.ts`. Screenshots that the e2e runs rewrote in `apps/web-e2e/src/screenshots/` were restored to `HEAD`.

**Not automated / not run:**

- Storybook visual tests.
- Lightbox zoom edge cases in a real browser.
- Responsive layouts beyond what the existing Playwright responsive spec covers.
- The Portal Access page and theme/profile controls (not present).
