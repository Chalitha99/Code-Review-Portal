# Developer Workspace functionality replan

This is analysis only. It does not authorize or include feature implementation. It compares the migrated, source-equivalent behavior with the functional specification `SPL-OPS-FO-001`.

## Required

| Gap                                                                                             | UI/state/API/model/validation/test impact                                                                                                                            | Risk and sequence                                                                                                                                          |
| ----------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Replace the in-browser MSW persistence boundary with production authentication and service APIs | Keep pages/hooks; implement transport/auth adapters matching `@sdp/contracts`, server concurrency/error semantics, attachment storage and integration/contract tests | Highest integration risk. Freeze API contracts, implement auth/session, then reference data, task/checklist, review/handover/notification/report endpoints |
| Normalize wire-level role values to lowercase while retaining display labels                    | Add explicit role-ID schema and boundary adapters; update authorization payloads/tests without changing visible labels                                               | Medium cross-cutting risk. Do after production identity contract is agreed                                                                                 |
| Confirm notification delivery channels and lifecycle against the formal backend contract        | API events, unread/read persistence, deep links, actor/audience rules and integration tests                                                                          | Sequence after task/review status APIs                                                                                                                     |
| Validate production upload constraints and evidence retention                                   | Upload progress/errors, MIME/size policy, attachment/evidence model, secure download and e2e tests                                                                   | Security/storage dependency; sequence before production review rollout                                                                                     |

## Recommended

| Opportunity                                                                  | Impact                                                                                            | Sequence                                                |
| ---------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- | ------------------------------------------------------- |
| Server-authoritative optimistic concurrency for pick-up, edits and handovers | Expose version/conflict errors in contracts, queries and dialogs; add two-client Playwright tests | With production task/review APIs                        |
| URL-backed dashboard filters and report ranges                               | Shareable state, Back/Forward semantics and route tests                                           | After route contract stabilizes                         |
| Draft conflict/recovery UX across tabs/devices                               | Draft metadata, merge/discard UI and persistence tests                                            | After server draft endpoint                             |
| Split chart/report bundles further                                           | Lazy chart families and measure route chunks                                                      | Independent performance pass                            |
| Expand Storybook coverage to all migrated workflow components                | Add provider/MSW decorators, interaction and a11y stories                                         | Incremental, starting with wizard/checklist/review form |

## Optional

- saved filter views and column preferences;
- exportable Developer analytics;
- richer upload previews and annotations;
- user-selectable reduced-density tables;
- offline draft indicators once server persistence exists.

## Future

- real-time queue and notification updates;
- audit-log exploration across portals;
- configurable workflow/checklist versioning;
- cross-portal handoff into Delivery and Wiki phases.

Any item that changes validation, status transitions, ranking, self-review exclusion, checklist applicability, response gates or generated identifiers requires explicit product approval and must not be folded into maintenance work.
