# ADR 0016 — NestJS is the only backend; the MSW mock is removed

- **Status:** Accepted
- **Date:** 2026-10-09
- **Supersedes:** [0003 · MSW at the network boundary](0003-msw-as-the-api-seam.md)

## Context

ADR 0003 put MSW at the network boundary so the frontend could be built before
the API existed, and so "Phase 2" would be deleting one folder. By October 2026
the browser already ran only against NestJS; MSW survived as the Vitest backend
(`src/mocks`, ~8,000 lines) and as the place several business rules were still
specified first. That left two implementations of the same rules, a mock that
could disagree with the API, and test data shaped by mock internals.

## Decision

1. **Every rule the mock enforced and the API lacked was ported to NestJS**, with
   unit and e2e tests (authorship of review comments, server-side image checks,
   admin-only retired checklist data, immutable customer codes, draft reset on
   pick/return, atomic handover draft, legacy statuses, and more).
2. **`apps/web/src/mocks`, `public/mockServiceWorker.js` and the `msw` dependency
   are deleted.** `apiClient` has no mock identity, no worker recovery.
3. **Tests are separated from source and from the server:**
   - `apps/web/tests/unit` — pure rules;
   - `apps/web/tests/component` — real screens through the real `apiClient`,
     with **per-test canned answers** (`tests/support/apiStub.ts`): stateless,
     no business rules, and any undeclared request fails the test;
   - Storybook stories, run in a real browser with axe;
   - `apps/api` unit specs and e2e specs against a throwaway PostgreSQL;
   - `apps/web-e2e/tests/journeys` — Playwright through React → NestJS →
     PostgreSQL.
4. **The e2e database is never the shared Neon database**: a private local
   cluster, recreated from `prisma/migrations` and `prisma/seed-e2e.ts`, behind
   guards that refuse any non-local URL.
5. **HTTP statuses follow RFC 9110** (`apps/api/src/common/api-error.ts`), not
   the mock's choices: 400 malformed, 401/403/404, 409 state conflict, 413/415
   upload limits, 422 business rule, 429 rate limit; workflow actions answer 200.

## Consequences

- A rule exists once, in NestJS, and is tested there. Component tests state the
  server's answer instead of re-implementing it.
- The fixture dataset (`tests/support/fixtures`) is data only; it is not served
  by any handler logic.
- Journeys need PostgreSQL locally (`npm run e2e:db:up -w @sdp/api`) or a
  service container in CI.
