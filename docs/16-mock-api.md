# Mock API — removed

The MSW mock API (`apps/web/src/mocks`) was removed on 2026-10-09. NestJS
(`apps/api`) is the only backend, in the browser and in every test layer that
needs one. See [ADR 0016](adr/0016-nestjs-is-the-only-backend.md).

- Component tests declare the server's answers per test:
  `apps/web/tests/support/apiStub.ts` (+ `serve.ts`, `serveReview.ts`).
- The former seed data lives on as test fixtures in
  `apps/web/tests/support/fixtures` — data only.
- Full-stack checks: `apps/api/test/e2e` and `apps/web-e2e/tests/journeys`,
  against a throwaway PostgreSQL ([testing strategy](13-testing-strategy.md)).
