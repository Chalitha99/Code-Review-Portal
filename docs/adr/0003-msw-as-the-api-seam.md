# 0003 · MSW at the network boundary, not a mock service object

**Status:** Superseded by [ADR 0016](0016-nestjs-is-the-only-backend.md) (2026-10-09) · **Date:** Phase 1, Sprint 0

## Context

Phase 1 is a frontend against mock data; Phase 2 replaces the mocks with a NestJS API, roughly
three months later. The brief asked for a `services/mockApiService.ts` — an object with methods
returning fixtures.

The question is what happens on the day the real API arrives.

## Decision

Components → TanStack Query hooks → a typed `api` client issuing **real `fetch` calls to real
URLs** → intercepted in Phase 1 by MSW.

```
Components → hooks → lib/apiClient.ts (fetch) ─┬─ Phase 1: MSW intercepts
                                               └─ Phase 2: NestJS answers
```

Phase 2 removal is deleting the `worker.start()` call. No component, hook or query changes.

`services/mockApiService.ts` exists as a thin documented re-export, so the structure the brief
asked for is present, but MSW is the mechanism.

Two rules keep the handlers honest as a rehearsal for the backend:

1. **Authorisation is enforced in the handler, never in the UI.** The Available queue excludes the
   caller's own submissions server-side; `requireAdmin` gates every management endpoint; the
   review gates re-run on submit. The UI hiding a button is a convenience.
2. **Responses are shaped exactly like the documented contract, errors included**, so the client's
   Zod parsing exercises the real path.

## Alternatives considered

- **A mock service object.** Rejected: every component importing it must be touched in Phase 2,
  and — more damaging — the app would never exercise loading, latency, error or race behaviour.
  FL 3.3-02 (two reviewers picking one task) cannot be modelled by a synchronous function at all.
- **A local Express server.** More faithful, but a second process to run and no browser-level
  interception for tests.

## Consequences

**Good.** Loading and error states are real. The concurrent-pick race is testable. The Zod
contract is exercised on every response, which is what keeps mock and API from drifting
(risk R5) until the Phase 2 OpenAPI codegen makes drift a build failure.

**The cost.**

- The handlers are now a substantial piece of software — roughly 1,400 lines with real
  authorisation logic. That is deliberate (it is the Phase 2 specification, executable), but it is
  code without its own tests; it is covered through the screens.
- **The store rebuilds from seed on every page load.** Any Playwright journey spanning a
  `page.goto()` asserts against a fresh database while appearing to walk a flow — it passes and
  proves nothing. Every cross-screen e2e therefore loads once and navigates in-app afterwards,
  including across sign-out and sign-in. This is documented at the top of `e2e/acceptance.spec.ts`
  because it has caught us more than once.
- Seed data must satisfy the real schemas, and `mocks/db.ts` validates it on load. That is a
  feature — a malformed fixture fails at startup with a Zod path rather than producing `undefined`
  three components deep.
