# SEBSA Service Delivery Portal

An Nx monorepo. **`apps/web`** is the frontend shell hosting several internal
applications — the **Code Review Portal** (spec `SPL/OPS/FO-001`) is the
first; **Delivery** and **Wiki** follow in later phases and are already
registered as navigable shells so the portal registry stays exercised.
**`apps/api`** is the NestJS + Prisma API used by the frontend, including
cookie-based JWT authentication and RBAC. **`apps/web-e2e`** holds the
Playwright suite, and **`packages/contracts`** / **`packages/types`** are
shared, framework-free packages consumed by the frontend.

```bash
npm install
npm run dev          # nx run-many -t dev — starts every app with a dev target
npm run dev:web       # just the frontend — http://localhost:5175; expects the API on port 3000
npm run dev:api       # just the NestJS API — http://localhost:3000
```

The web app has no mock backend: every `/api` call goes to NestJS. `apps/api`
needs its database and authentication environment values — see
[Environment](#environment).

### How the frontend reaches NestJS

- **Development:** Vite (`:5175`) proxies `/api` to NestJS (`:3000`, override
  with `SDP_API_TARGET`). NestJS mounts everything under `setGlobalPrefix('api')`
  and `apiClient` calls relative `/api/...` URLs, so browser and API share one
  origin.
- **Session:** `POST /api/auth/login` sets HttpOnly cookies — `sdp_access`
  (15-minute JWT, bound to a server-side session) and `sdp_refresh` (rotated,
  scoped to `/api/auth`) — plus a readable `sdp_csrf` token that `apiClient`
  echoes in `X-CSRF-Token` on every write. On a 401 the client refreshes once.
- **Authorisation:** global JWT → Roles → CSRF guards, then each service's
  policy; roles and status are re-read on every request.
- **Contracts:** `@sdp/contracts` Zod schemas validate every response in
  `apiClient` and the request bodies in NestJS.
- **Production:** serve the web build and the API behind one HTTPS reverse
  proxy. Cookies are `Secure` in production, so the app must be served over
  HTTPS; startup fails if `COOKIE_SECURE=false` or a non-https origin is set.

Nx also builds a project graph from these packages; `npm run graph` (or
`npx nx graph`) opens an interactive view of what depends on what.

---

## Scripts

Everything is driven through [Nx](https://nx.dev). `nx run-many -t <target>`
fans a target out to every project that defines it; `nx run <project>:<target>`
(or `npx nx <target> <project>`) runs it for one project. Build, test, lint
and typecheck targets are cached by Nx (`nx.json`) — an unchanged project
replays its last result instead of re-running. `dev` and `serve` are never
cached.

| Script                            | What it does                                                                                                  |
| --------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| `npm run dev`                     | `nx run-many -t dev` — Vite dev server (web) + esbuild watch (api)                                            |
| `npm run dev:web`                 | `nx run @sdp/web:dev` — frontend with `/api/*` proxied to NestJS                                              |
| `npm run dev:api`                 | `nx run @sdp/api:dev` — the NestJS API                                                                        |
| `npm run build`                   | `nx run-many -t build` — type-check and build every project                                                   |
| `npm run build:web`               | `nx run @sdp/web:build` — `tsc -b` then `vite build`                                                          |
| `npm run build:api`               | `nx run @sdp/api:build` — esbuild bundle                                                                      |
| `npm run typecheck`               | `tsc -b` across the root solution (`apps/web`, `apps/web-e2e`, `apps/api`, all packages)                      |
| `npm run test`                    | `nx run-many -t test` — unit/component tests for every project                                                |
| `npm run test:web`                | `nx run @sdp/web:test` — Vitest, jsdom, with coverage (`**/domain/**` held to 90%)                            |
| `npm run test:api`                | `nx run @sdp/api:test` — NestJS unit tests (Vitest, mocked Prisma)                                            |
| `npm run e2e`                     | `nx run @sdp/web-e2e:e2e` — Playwright journeys against React → NestJS → a throwaway PostgreSQL (below)       |
| `npm run lint` / `lint:fix`       | `nx run-many -t lint` — one ESLint flat config for the whole repo, including the architectural boundary rules |
| `npm run format` / `format:check` | Prettier, run directly (not through Nx)                                                                       |
| `npm run graph`                   | `nx graph` — visualize the project dependency graph                                                           |

Inside `apps/web` you can also run its local scripts directly (`npm run dev`,
`test:watch`, `test:ui`, `storybook`, `test:storybook`, `preview`, …) — see
`apps/web/package.json`.

### Testing layers

| Layer         | Where                           | Runs against                                                                                           |
| ------------- | ------------------------------- | ------------------------------------------------------------------------------------------------------ |
| Web unit      | `apps/web/tests/unit`           | pure rules and helpers                                                                                 |
| Web component | `apps/web/tests/component`      | real screens + `apiClient`; per-test canned API answers (`tests/support/apiStub.ts`) — no mock backend |
| Storybook     | `apps/web/src/**/*.stories.tsx` | every story in real Chromium (`npm run test:storybook`), axe on each                                   |
| API unit      | `apps/api/src/**/*.spec.ts`     | services with mocked Prisma                                                                            |
| API e2e       | `apps/api/test/e2e`             | the whole Nest app + a throwaway PostgreSQL (`E2E_DATABASE_URL`)                                       |
| Journeys      | `apps/web-e2e/tests/journeys`   | the full stack in a browser                                                                            |

**The e2e database is never the shared Neon database.** It is a private
PostgreSQL cluster (`initdb`, 127.0.0.1:55432) recreated from
`prisma/migrations` and `prisma/seed-e2e.ts`; every script refuses a non-local
URL or a database name without `e2e`.

```bash
npm run e2e:db:up -w @sdp/api      # start the private cluster (first run creates it)
npm run e2e:db:reset -w @sdp/api   # drop + recreate sdp_e2e, migrate deploy, seed
E2E_DATABASE_URL=postgresql://postgres@127.0.0.1:55432/sdp_e2e npm run test:e2e -w @sdp/api
npm run e2e                         # Playwright: starts API :3100 + web :5185 itself, resets the DB first
```

### Running web and api in separate terminals

`npm run dev` runs both apps through one Nx process (`nx run-many -t dev`),
multiplexing their output into a single terminal. If you'd rather control
each independently — its own `Ctrl+C`, its own terminal to close — open two
terminals instead and run:

```bash
npm run dev:web   # terminal 1 — http://localhost:5175
npm run dev:api   # terminal 2 — http://localhost:3000
```

### Stopping a stuck dev server

`apps/web/vite.config.ts` sets `strictPort: true` on purpose: if port 5175 is
already taken, Vite fails immediately with `Port 5175 is already in use`
rather than silently starting on 5176, which would desync it from the
Playwright config's `baseURL`. So if a previous `apps/web` dev server didn't
shut down cleanly (for example `Ctrl+C` not reaching it), free the port by
hand before starting a new one — same idea applies to `apps/api` on 3000.

**Windows** — find the PID holding the port, then kill it:

```powershell
Get-NetTCPConnection -LocalPort 5175 -State Listen | Select-Object OwningProcess
taskkill /F /PID <pid>
```

(Or open Task Manager, search for the `node.exe` process, and end it.)

**macOS/Linux**:

```bash
lsof -ti tcp:5175 | xargs kill -9
```

---

## Layout

```
apps/
  web/           @sdp/web     — the frontend shell (Vite + React)
  web-e2e/       @sdp/web-e2e — Playwright specs against apps/web
  api/           @sdp/api     — NestJS scaffold (config + health check; not yet consumed by web)
packages/
  contracts/     @sdp/contracts — Zod schemas for everything crossing the network
  types/         @sdp/types     — the type-only face of contracts (zero runtime)
docs/            numbered engineering & architecture standards, ADRs
qa/              manual, spec-traceable test plan and results
```

### `apps/web/src`

```
app/         providers, root layout, app bar, app footer, guards — the shell
routes/      the router tree and the /crp subtree
components/
  ui/        tier 1 — React, Radix, CVA and nothing else
  common/    tier 2 — app-aware, portal-agnostic
features/    app-wide features: auth, home, notifications
hooks/       hooks no single feature owns (session, media query, reveal)
portals/
  code-review/
    components/      this portal's shared, domain-carrying components
    hooks/           this portal's data hooks
    features/<name>/ api · components · domain · hooks · routes
  delivery/  wiki/   Phase 2 and 3 shells
lib/         apiClient, queryClient, formatters, session storage, domain rules
config/      env, the routes facade, workspaceTheme
constants/   routePaths, portals, roles
content/     every user-facing string, as JSON
```

### `apps/api/src`

```
config/                       env schema and typed configuration factory
common/
  interceptors/                cross-cutting request/response concerns (logging)
  filters/                     exception handling
modules/
  health/                      the only feature module so far — a health check endpoint
```

This is a Phase 7 scaffold: `AppModule` wires up `ConfigModule` and
`HealthModule` and nothing else yet. There is no database integration,
authentication, or business logic here, and `apps/web` does not call it.

There is no `packages/ui` and no `src/shared`. Both appeared in an earlier
draft of this README and never existed on disk.

---

## The rules that matter

These apply to `apps/web`, the only app with real business logic today.

### Three component tiers

The distinction is **what a component is allowed to know**, and it is enforced by ESLint rather
than by convention.

| Tier            | Lives in                                   | May import                                  | Example                                       |
| --------------- | ------------------------------------------ | ------------------------------------------- | --------------------------------------------- |
| Design system   | `apps/web/src/components/ui`               | react, radix, cva, lucide                   | `Button`, `Dialog`, `Select`                  |
| App composition | `apps/web/src/components/common`           | tier 1, `config`, `content`, `hooks`, `lib` | `DataTable`, `PageHeader`, `Skeleton`         |
| Portal          | `apps/web/src/portals/<portal>/components` | tiers 1–2, plus that portal's domain        | `badges`, `taskColumns`, `ReviewCycleHistory` |

The decision is made by the **import list**, not by where a file currently sits. `DataTable` renders
whatever columns it is given, so it is tier 2; `taskColumns` names Task, Review and Rank, so it is
not. Tier 2 may not import a portal, and `apps/web/src/app` may not import a portal at all — that is
what lets Delivery and Wiki be built without depending on Code Review.

### `domain/` is React-free, and lint enforces it

Business rules live in `domain/` folders that may not import React, TanStack Query, or anything
under `components/`. That restriction is the whole reason the folder exists: it is what makes the
tricky rules — checklist composition, review-cycle counting, rank gating, self-review exclusion —
testable without rendering anything.

`checklistModel.test.ts` pins the seeded composition (Customization 23 questions, Configuration 8,
Lobby 8, Quick Report 9, Upgrade Service 10) against the real seed file, so an edit that changes a
task type's question count fails the build.

### Contracts are the single source of truth

`@sdp/contracts` describes what crosses the network. `apps/web/src/lib/apiClient` validates
responses against it and NestJS validates requests against it, so contract drift fails loudly in
development rather than shipping. Form schemas live in the owning feature's `domain/` and
are built by `.pick()`/`.extend()` from a contract — never by redeclaring the shape.

### Authentication and authorization are decided by the server

NestJS authenticates the HttpOnly JWT cookies and enforces roles and ownership. The UI's role
gating shapes what a user sees; it does not secure anything.

### Strings live in `apps/web/src/content`

Every user-facing string is JSON, so the specification's exact error wording can be asserted in
tests rather than retyped into JSX — and so adopting i18n later is a change to one file.

### Colour is computed, not chosen

The categorical chart palette in `apps/web/src/styles/index.css` was validated for lightness band,
chroma floor, colourblind separation and contrast. The obvious choice — reusing the violet and blue
semantic tokens — puts those two hues 0.4 ΔE apart under deuteranopia. Every chart also carries a
legend with counts and percentages, so colour is never the sole encoding.

Storybook accessibility checks (previously run in CI) surfaced several contrast failures that way,
not by inspection: white on `success-500` is 3.3:1, white on `warning-500` is 2.2:1, and dimming
tinted text with `opacity` pushed every feedback tone below 4.5:1.

---

## Environment

### `apps/web`

No frontend authentication secret or token setting is required. The browser
calls relative `/api` URLs; Vite proxies them to `http://localhost:3000` during
development (`SDP_API_TARGET` overrides it). JWT access and refresh tokens remain in HttpOnly cookies.

### `apps/api`

Create `apps/api/.env` and fill in real values; every variable, its default and
what to change when hosting is in
[`docs/26-configuration-and-hosting.md`](./docs/26-configuration-and-hosting.md).
This is a separate process from `apps/web`.

| Variable                                   | Example                                               | Purpose                                                                                      |
| ------------------------------------------ | ----------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| `NODE_ENV`                                 | `development`                                         |                                                                                              |
| `PORT`                                     | `3000`                                                | HTTP listen port                                                                             |
| `DATABASE_URL`                             | `postgresql://user:password@host/sdp?sslmode=require` | PostgreSQL (Neon). `sslmode=require` is mandatory in production                              |
| `FRONTEND_ORIGIN`                          | `http://localhost:5175`                               | CORS allow-list and the origin in emailed links; `https://` only in production               |
| `JWT_ACCESS_SECRET` / `JWT_REFRESH_SECRET` | 32+ random characters                                 | Separate secrets for the two cookies                                                         |
| `COOKIE_SECURE`                            | unset                                                 | `Secure` cookies; on automatically in production, which refuses `false`                      |
| `TRUST_PROXY`                              | `1`                                                   | Express `trust proxy` behind a TLS-terminating proxy (hop count or addresses — never `true`) |
| `SWAGGER_ENABLED`                          | unset                                                 | API docs at `/api/docs`; defaults to on only when `NODE_ENV=development`                     |

Node 22 or newer is required (Vite 8).

---

## Working on it

See [`docs/`](./docs) for the full engineering and architecture standards —
start with [`docs/README.md`](./docs/README.md).

Adding a portal: add its segment to `apps/web/src/constants/routePaths.ts` and mount it in
`apps/web/src/routes/index.tsx`. `/delivery` and `/wiki` are already there as one lazy route each —
copy either. The shell needs no other change.

Adding a feature: create `apps/web/src/features/<name>/{api,components,domain,hooks,routes}`. Put
the rules in `domain/` first and test them there; the components that follow become thin.

Adding a component: pick the tier from its import list, using the table above. Start inside the
feature that needs it and promote only when a second consumer actually exists — promoting early is
how a "shared" component ends up carrying one caller's domain.
