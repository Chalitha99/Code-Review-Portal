# Testing strategy

Six layers, each answering a different question. A test that answers a question
another layer already answers is a maintenance cost with no return. There is no
mock backend anywhere ([ADR 0016](adr/0016-nestjs-is-the-only-backend.md)):
business rules live in NestJS and are tested there.

| Layer             | Question                                                    | Tool                             | Where                           |
| ----------------- | ----------------------------------------------------------- | -------------------------------- | ------------------------------- |
| **Web unit**      | Is this rule/helper correct?                                | Vitest                           | `apps/web/tests/unit`           |
| **Web component** | Does this screen render, gate and send the right request?   | Vitest + Testing Library (jsdom) | `apps/web/tests/component`      |
| **Visual & a11y** | Does it look right; is it accessible?                       | Storybook in Chromium + axe      | `apps/web/src/**/*.stories.tsx` |
| **API unit**      | Is this server rule correct?                                | Vitest, mocked Prisma            | `apps/api/src/**/*.spec.ts`     |
| **API e2e**       | Does the whole Nest app enforce it against a real database? | Vitest + supertest               | `apps/api/test/e2e`             |
| **Journeys**      | Does the journey work through the real stack?               | Playwright                       | `apps/web-e2e/tests/journeys`   |

Tests live apart from the code they test. Test-only helpers are under
`apps/web/tests/support` (import as `@tests/support/...`).

## Running

```bash
npm test                                   # every project's unit/component tests
npm run test:web                           # web, with the coverage gate
npm run test:storybook -w @sdp/web         # every story in Chromium, axe on each
npm run test:api                           # API unit specs

npm run e2e:db:up -w @sdp/api              # private PostgreSQL on 127.0.0.1:55432
npm run e2e:db:reset -w @sdp/api           # recreate sdp_e2e: migrate deploy + seed-e2e
E2E_DATABASE_URL=postgresql://postgres@127.0.0.1:55432/sdp_e2e npm run test:e2e -w @sdp/api
npm run e2e                                # Playwright; starts API :3100 + web :5185 itself
```

**The shared Neon database is never used by any test.** Every e2e entry point
(`scripts/e2e-db.mjs`, `scripts/e2e-serve.mjs`, `prisma/seed-e2e.ts`,
`test/e2e/db-env.ts`) refuses a non-local host or a database name without
`e2e`. Playwright runs its own API on :3100 and web on :5185, so it can never
reuse a developer's `npm run dev` (5175 → 3000 → Neon).

## Web unit tests — the tier that pays

Every pure function in a `domain/` folder or `lib/`. No rendering, no mocking.
`domain/` and the listed `lib/` rule modules are held to 90% statements / 85%
branches per file; the rest of the app has no threshold on purpose.

## Web component tests — canned answers, not a fake server

Screens render through the real route table and the real `apiClient` (fetch,
status handling, Zod contract parsing). Only `fetch` is replaced, by
`tests/support/apiStub.ts`:

```ts
apiStub.get('/tasks/:taskId', ({ params }) => toListItem(db, task));
apiStub.post('/tasks/:taskId/pick', () =>
  apiError(409, 'ALREADY_PICKED', 'Pinsara has already picked up this task.'),
);
expect(apiStub.requests('POST', '/tasks/:taskId/pick')).toHaveLength(1);
```

- A test declares what the server answers for that screen. **Any request it
  did not declare fails the test.**
- `serve.ts` / `serveReview.ts` are shorthands that serve rows exactly as given
  and echo writes the way NestJS stores them; workflow outcomes are opted into
  explicitly. None of NestJS's validation or scope rules are repeated — a test
  that needs a refusal states the 4xx it expects.
- The fixture dataset (`tests/support/fixtures`) is contract-validated data.

Query by **role and accessible name**. Test behaviour, not implementation.
`tests/support/setup.ts` installs the jsdom stubs Radix needs (pointer capture,
`scrollIntoView`, `matchMedia`, `ResizeObserver`).

## Visual and accessibility — Storybook

`npm run storybook -w @sdp/web` opens the catalogue; `npm run test:storybook`
renders every story in Chromium and runs its `play` function and axe. Axe is at
`todo` (reported, not failing) while the known contrast findings on the rank
and status badges and the DataTable stories are fixed; switch
`.storybook/preview.ts` to `a11y: { test: 'error' }` afterwards.

## API tests

- **Unit specs** next to each service: rules, error codes and statuses
  (`common/api-error.ts`: 400 malformed, 401, 403, 404, 409 state conflict,
  413/415 uploads, 422 business rule, 429 rate limit).
- **e2e** (`test/e2e/workflow.e2e-spec.ts`): the real app on the e2e database —
  security headers, CSRF, login throttling, session revocation, body limits,
  image validation, comment authorship, catalog rules, the Super Admin transfer
  block, email change.

## Journeys — Playwright

| Spec              | Covers                                                                                        |
| ----------------- | --------------------------------------------------------------------------------------------- |
| `01-auth`         | sign-in, HttpOnly cookies, sign-out, wrong password, deep link, axe on login and home         |
| `02-review-cycle` | wizard → submit → pick → request changes → developer sees it → admin grid                     |
| `03-handover`     | hand over with draft → admin reassigns → new reviewer sees previous comments                  |
| `04-admin-rules`  | Super Admin transfer blocked by review work; email change forces a new password               |
| `05-onboarding`   | invite → set password (link from the e2e mail outbox) → sign in → link spent; forgot password |

Each journey creates the data it changes. Invite/reset emails are captured by
the API's dev outbox (`E2E_MAIL_OUTBOX`); nothing is sent.

## What not to test

- Library behaviour. Radix's focus trap is Radix's problem.
- The same rule at three tiers. Test it once, at the cheapest tier that can see it.
- A server rule in a component test — state the server's answer instead.
- Implementation details — internal state, private functions, class names.
