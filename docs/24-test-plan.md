# Test plan

The Code Review Portal is specified in **SPL/OPS/FO-001, Issue 01** ("Service
Delivery Portal — Code Review Portal Specification"). This document is the
bridge between that specification and the running application: a
human-executable, spec-traceable manual test suite, plus a register of
specified items that are not implemented so they are visible rather than
silently untested.

The suite lives in [`qa/`](../qa/), one level above `docs/`, because it is
executed by QA and by non-developers signing off a build — not read as
engineering reference. This document is the only thing that needs reading
before opening it.

## Scope

In scope: every screen, field table, RMB (right-hand action / button) option,
and functional-logic (FL) rule numbered in SPL/OPS/FO-001 §1.5 and §2, as
implemented in this repository's Code Review Portal (`/crp`). Out of scope:
the Delivery Portal and Wiki Portal (both placeholder routes — see
[`qa/test-cases/TC-XCUT-cross-cutting.md`](../qa/test-cases/TC-XCUT-cross-cutting.md)
for their "coming soon" state) and anything not described by the spec except
where noted as an inverse gap (see below).

Automated coverage (unit, component, Storybook/a11y, Playwright — see
[13 · Testing strategy](./13-testing-strategy.md)) is not duplicated here.
Where automated coverage already exists, this suite exercises the same
behaviour manually for sign-off purposes and the traceability matrix records
the corresponding automated spec file. Manual cases exist because they are the
artefact a non-developer can execute and sign, not because the app is
otherwise untested.

## Environment setup

1. `npm install` at the repo root (workspace install — see
   [01 · Getting started](./01-getting-started.md)).
2. Run **`npm run dev` only**. The app serves at **`http://localhost:5175`**
   (`vite.config.ts` sets `strictPort: true` — a README reference to `5173` is
   stale). `src/main.tsx` starts the MSW mock worker only when
   `import.meta.env.DEV`; `npm run preview` of a production build has **no
   API at all** and must not be used for manual testing.
3. Sign in with any of the 11 seeded accounts and the shared password below.

No other services, environment variables, or seed scripts are required — the
mock API and its database are entirely client-side.

## Test data and roles

- **Password** (all 11 seeded accounts): `Sebsa@2026`, from
  `src/mocks/data/credentials.json`. This is a Phase-1 demo credential set,
  replaced by Keycloak/SSO in Phase 2 — see the gap register.
- **Users and roles** are seeded in `src/mocks/data/users.json`. Roles are
  additive; 9 of the 11 accounts hold Developer, Reviewer, and Admin
  together, so most flows can be exercised from a single login. Two accounts
  exist specifically for negative testing:
  - `dheliya.kankanamge@sebsaworld.com` — Developer only, active — proves
    workspace hiding and the route guard's redirect for roles the user
    doesn't hold.
  - `nimal.perera@sebsaworld.com` — Reviewer, `isActive: false` — proves the
    inactive-account rejection path.
- There is **no impersonation or user switcher**
  ([ADR 0013](./adr/0013-single-identity-no-impersonation.md)). Any test case
  that needs two different users in sequence (developer submits, reviewer
  picks, admin reassigns, etc.) requires a genuine sign-out and sign-in as the
  other person — the test case's Preconditions column says so.

### The mock database is in-memory — read this before running anything

`src/mocks/db.ts` rebuilds the entire dataset from the seed JSON files on
every module evaluation. **A browser refresh (F5) discards every task,
checklist answer, review, comment, user, customer, and handover created
during the session** and restores the original seed data.

- Sign-out is client-side only and does **not** reset the database.
- A reload **does** reset it.
- Multi-user scenarios (developer submits → signs out → reviewer signs in and
  picks the task) must be run as one continuous browser session with sign-outs
  in between, and **no reload**.

Every test case's Preconditions column states whether it needs a fresh seed
(reload first) or must continue directly from a prior case's end state. Follow
the stated order within a file — cases are sequenced deliberately.

### Session behaviour

2-hour sliding TTL, storage key `sdp.session`. "Remember me" persists to
`localStorage`; otherwise the session lives in `sessionStorage`. Signing out
purges every key prefixed `sdp.`.

## Test case format

Every test case is one row in a table in its area file under
[`qa/test-cases/`](../qa/test-cases/), with these columns:

| Column          | Contents                                                                           |
| --------------- | ---------------------------------------------------------------------------------- |
| ID              | `TC-<AREA>-<sub-area>-<seq>`, e.g. `TC-DEV-WIZ-007`                                |
| Spec ref        | Spec section and FL rule, e.g. `2.5.4 FL 2.5-01`, or `—` for unspecified/gap items |
| Priority        | `P1` blocker / `P2` major / `P3` minor                                             |
| Preconditions   | Signed-in user, role, task/data state, and whether a reload is required first      |
| Steps           | Numbered, one action per step, referencing controls by accessible name             |
| Expected result | Quoted verbatim from the spec where the spec itself quotes a message               |
| Status          | `Pass / Fail / Blocked / N/A` — filled in at execution, not in this document       |
| Notes           | Defect reference — filled in at execution                                          |

Steps reference every control by its **accessible name**, taken from
`src/content/*.json` (`common`, `home`, `login`, `tasks`, `reviews`, `admin`).
This codebase has zero `data-testid` attributes; the content JSON is the
canonical user-visible vocabulary, and it is also what the Playwright specs
under `e2e/` query against — writing manual steps the same way keeps the two
scripts describing one application instead of two.

## Roles required per area

| Area               | Role(s) needed                                                    |
| ------------------ | ----------------------------------------------------------------- |
| TC-AUTH, TC-XCUT   | Any account; both negative accounts above                         |
| TC-DEV-\*          | Developer                                                         |
| TC-REV-\*, TC-HAND | Reviewer (and a second Reviewer/Admin account for two-user cases) |
| TC-ADM-\*, TC-RPT  | Admin                                                             |

## Entry criteria

- The branch under test builds (`npm run build`) and `npm run dev` serves the
  app at `http://localhost:5175` with no console errors on load.
- **TC-ENV** (the automated preflight gates — typecheck, lint, unit/coverage,
  Playwright, Storybook) has been run and its results recorded. A red suite
  blocks the manual pass — see below.

## Exit criteria

- Every P1 case has a recorded Pass/Fail/Blocked/N/A status.
- No open P1 defect. Open P2/P3 defects are logged and triaged, not
  necessarily fixed before sign-off.
- The dry run described in the Verification section below has been executed
  at least once and recorded under `qa/results/`.

## Defect severity

| Severity | Definition                                                                                                                      |
| -------- | ------------------------------------------------------------------------------------------------------------------------------- |
| **P1**   | Blocks the golden path: a spec'd action cannot be completed, data is lost or corrupted, or a security/authorization rule fails. |
| **P2**   | A spec'd rule, message, or field is wrong, missing, or produces an incorrect result, but a workaround exists.                   |
| **P3**   | Cosmetic, wording, or an edge case with no functional consequence.                                                              |

A case that fails during execution because of an application defect is
recorded as **Fail** with the defect referenced in Notes — it is never
rewritten to pass by weakening what it checks.

## Gap register and traceability matrix

- [`qa/gap-register.md`](../qa/gap-register.md) — spec items with no
  implementation to test (SSO, email notifications, the Delivered status
  transition, the reviewer's verdict branch on a developer's rejection,
  Integrations & Services), plus the inverse case: implemented capability the
  spec does not describe (the Admin Quality Checklist tab).
- [`qa/traceability-matrix.md`](../qa/traceability-matrix.md) — one row per
  spec section from §1.5 through §2.19.3, mapping to the manual test case IDs
  that cover it and to the automated spec file that already exercises it at
  the e2e or unit/component tier. Any spec row with no test case ID
  reconciles back to the gap register.

## Verification (dry run)

This deliverable is documentation, so its own verification is a dry run
rather than a build:

1. `npm run dev`, sign in as `janith.hasthanayake@sebsaworld.com` /
   `Sebsa@2026`.
2. Execute **TC-ENV** in full, plus every **P1** case in TC-AUTH,
   TC-DEV-wizard, TC-REV-review, and TC-DEV-response — the end-to-end spine:
   create a task → complete the checklist → submit → sign in as a second user
   → pick → rank 3 → request changes → sign back in as the developer → reject
   one finding with a reason → resubmit.
3. Confirm every step's control is findable by the accessible name written in
   the case. A step that cannot be followed exactly as written is a defect in
   the **test case**, fixed before the plan is considered done — not a reason
   to loosen the step.
4. Record the run as the first entry under `qa/results/` (copy
   `qa/results/RESULTS-TEMPLATE.md` into a dated run folder), proving the
   template itself is usable.
5. `npm run format:check` over the new Markdown before it is considered done.

Cases that fail during the dry run because of an application bug are logged
as defects in the results file — they are not "fixed" by weakening the case.

## Running a full pass

See [`qa/README.md`](../qa/README.md) for the short, execution-focused
version of steps 1–2 above, intended for whoever is running the suite rather
than maintaining it.
