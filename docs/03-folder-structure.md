# Folder structure

## Repository root

```
Repo_SDP/
  .husky/               pre-commit hook (lint-staged)
  .storybook/           Storybook config, and the preview that loads the real
                        stylesheet so stories render styled
  docs/                 this documentation
  e2e/                  Playwright specs
  packages/             workspace packages — contracts and types
  public/               static assets, including the MSW service worker
  src/                  the application
```

There is no CI workflow in this repository yet. The five gates a workflow would
run are `format:check`, `typecheck`, `lint`, `test` (which carries `--coverage`,
and therefore the domain thresholds) and `build`.

## `packages/` — two workspace packages

| Package          | Import as        | Holds                                                                |
| ---------------- | ---------------- | -------------------------------------------------------------------- |
| `@sdp/contracts` | `@sdp/contracts` | Zod schemas for every API payload, plus the types inferred from them |
| `@sdp/types`     | `@sdp/types`     | Types with no runtime counterpart (utility and view-model types)     |

They stayed as packages rather than folding into `src/` because they are the
contract between this frontend and the API — the one part of the repo a second
consumer (a BFF, a shared test kit, the Delivery portal if it ever splits out)
would take as a unit. Component code moved to `src/components` because it is
this application's UI, not a shared library.
See [ADR 0012](./adr/0012-component-tiers-and-the-portal-layer.md).

## `src/`

```
src/
  app/          App.tsx, providers.tsx, RootLayout, AppBar, AppFooter, guards — the shell
  components/
    ui/         tier 1 — React and its own helpers, nothing else
    common/     tier 2 — app-aware, portal-agnostic
  features/     application-wide features: auth, home, notifications
  hooks/        hooks no single feature owns (session, media query, reveal)
  config/       env.ts — the only file reading import.meta.env, plus the
                routes facade and workspaceTheme
  constants/    values identical in every environment
  content/      user-facing strings as typed JSON
  lib/          framework-level helpers (api client, formatters, storage, rules)
  mocks/        MSW handlers, seeded database, fixtures
  portals/      the three sub-applications
  routes/       every route definition in the app
  services/     imperative service objects used outside React
  styles/       all CSS
  test/         test infrastructure (not tests)
  types/        app-local types
  main.tsx      entry point
```

### Why `src/features/` exists alongside `portals/*/features/`

Auth, home and notifications are not the Code Review portal's. `/login` is
mounted outside `/crp`, `HomePage` is the picker that chooses _between_
portals, and `NotificationBell` is rendered by the shell's `AppBar`. Putting
them inside a portal means Delivery and Wiki would have to import Code Review
in order to sign a user in.

The rule that follows, and that ESLint enforces: **`src/app` may not import
`@/portals/*`.** There is exactly one exception, `app/useSessionReset.ts`,
which carries an inline disable and an explanation of why inverting it is a
design change rather than a move.

`src/pages/` and `src/stores/` are gone. `pages/` held a single unrouted
screen; `stores/` held a single empty file. Add either back when something
needs it.

### `constants/` vs `config/`

The distinction is mechanical, not stylistic.

|                                     | `constants/`                          | `config/`                             |
| ----------------------------------- | ------------------------------------- | ------------------------------------- |
| Contents                            | Values identical in every environment | Values that come from the environment |
| Reads `import.meta.env`             | Never                                 | Always                                |
| Importable from a plain Node script | Yes                                   | No                                    |
| Files                               | `routePaths`, `portals`, `roles`      | `env`, `routes`, `workspaceTheme`     |

Merging them would make `constants/` untestable outside a bundler, which matters
because `routePaths.ts` is walked by a test.

Constants are `.ts`, not `.js`: `allowJs` is off, so a `.js` file would sit
outside `tsc -b` entirely, and `as const` narrowing would be lost — `statusConfig[task.status]`
would degrade from an exhaustively-checked `Record<TaskStatus, …>` to an untyped
lookup, forfeiting the compile error that fires today when a status is added.
User-facing **strings** are `.json` under `src/content/`, which is the shape a
translation pipeline can consume.

### `content/` — strings live outside components

Every user-visible string is in a JSON file, imported through `src/content/index.ts`.
No literal copy in a component.

```tsx
import { content } from '@/content';
<h1>{content.home.title}</h1>;
```

Two reasons: copy changes stop being code changes, and the day this needs a
second language, there is one place to translate rather than three hundred.

### `lib/` — the framework layer

| File                                                     | Responsibility                                                                                      |
| -------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| `apiClient.ts`                                           | The only place `fetch` is called. Base URL, JSON handling, error normalisation, contract validation |
| `queryClient.ts`                                         | The single QueryClient, its defaults and retry policy                                               |
| `sessionStorage.ts`                                      | Typed, quota-safe session storage, and the `sdp.*` purge on sign-out                                |
| `formatters.ts`                                          | Date and number formatting, one implementation each                                                 |
| `logger.ts`                                              | The one logging boundary                                                                            |
| `statusMachine.ts`, `permissions.ts`                     | Domain rules that outgrew a single feature                                                          |
| `storedChecklist.ts`, `checklistOrdering.ts`             | Checklist rules shared by the wizard and the admin screens                                          |
| `kpiBuckets.ts`, `reviewStats.ts`, `analyticsTargets.ts` | Metric derivation shared by the analytics screens                                                   |
| `attachments.ts`, `tabNavigation.ts`                     | Upload constraints; tab scroll restoration                                                          |

Nothing in `lib/` imports a component, a feature or a portal — enforced.

The six rule modules in the second half of that table carry the same 90/85/90/90
coverage threshold as `domain/`, listed explicitly in `vitest.config.ts`. They
are domain logic that happens to be shared, and they stay portable to the
Phase 2 backend.

### `portals/` — the sub-applications

```
portals/
  code-review/
    components/   this portal's shared components — Task/Review/Rank-coupled
    hooks/        this portal's data hooks (useTasks, useReviews, useUsers, …)
    features/
      admin/ reports/ reviews/ tasks/
        api/ components/ domain/ hooks/ routes/
  delivery/       phase 2 shell
  wiki/           phase 3 shell
```

A feature folder only grows the sub-folders it needs.

`components/` and `hooks/` at the portal level are a real tier, not a dumping
ground. A component belongs there when it is reusable across that portal's
features **and** carries that portal's domain vocabulary — `badges`, `cells`,
`checklist`, `taskColumns`, `taskFilters`, `ReviewCycleHistory` all model
Task, Review or Rank. Anything reusable that does _not_ mention the domain
(`DataTable`, `Skeleton`, `PageContainer`, the chart primitives) is tier 2 and
lives in `src/components/common`.

The test is the import list, not the folder it happens to sit in: if a
component reaches for `@sdp/contracts` domain types or a portal concept, it is
portal-level; if the most it reaches for is `content`, `config`, `hooks` and
`lib`, it is `common/`.

A portal feature may use its own portal's `components/` and `hooks/`, and any
app-wide layer. It may not reach into another portal, and `common/` may not
reach into any portal — both enforced by `eslint-plugin-boundaries`.

### `routes/` — route configuration only

```
routes/
  index.tsx                    the router tree, and createBrowserRouter
  codeReviewRoutes.tsx         the /crp subtree
  LegacyWorkspaceRedirect.tsx  /developer/* -> /crp/developer/*, and its test
  routeHandle.ts               typed route handles and title resolution
  routeParams.ts               typed useParams
```

The guards live in `src/app` (`RequireAuth`, `RequireWorkspace`) because they
are shell concerns that the router composes, not route configuration. Delivery
and Wiki are mounted directly in `index.tsx`: a single lazy route each does not
earn its own file yet.

Page components stay in their feature's `routes/` folder. `src/routes/` holds
route _configuration_ — moving thirty screens here would collapse the feature
architecture, which is not what "all routes in one folder" asks for. What is
centralised is every place a route is _declared_, and every path _string_, which
lives one step further out in `src/constants/routePaths.ts`.

### `styles/`

| File         | Contents                                             |
| ------------ | ---------------------------------------------------- |
| `index.css`  | Imports only. Nothing is declared here.              |
| `Themes.css` | `@theme` design tokens, and the `@utility` gradients |
| `base.css`   | `@layer base` element defaults                       |

Three files listed here previously are gone, and the reasons are worth keeping:

- `utilities.css` declared a **second** set of gradient utilities, against
  `--gradient-*` custom properties that were never defined. All six emitted
  `background-image: var(--undefined)`. Gradients cannot come from `@theme`
  because there is no gradient namespace, so `Themes.css` declares them as
  `@utility` blocks — and that is the only place they are declared.
- `Pages.css` held two `@keyframes` nothing referenced.
- The original `base.css` referenced four custom properties that did not exist
  and was masked entirely by a later import; the file here is the one that was
  actually doing the work.

If you add a file back, wire it into `index.css` and say what it is for. And
note the failure mode all three shared: **a CSS custom property that does not
exist fails silently.** The Tailwind-v4 rule in `eslint.config.js` catches the
`utility-[--var]` form of this; nothing catches a plain `var(--typo)`, so
check the built stylesheet when adding tokens.

## Configuration files

| File                   | Purpose                                                             |
| ---------------------- | ------------------------------------------------------------------- |
| `vite.config.ts`       | Build config and the `@`/`@sdp/*` aliases                           |
| `vitest.config.ts`     | Merges the Vite config; defines the `unit` and `storybook` projects |
| `tsconfig.json`        | Project references only                                             |
| `tsconfig.app.json`    | The strict app config                                               |
| `tsconfig.node.json`   | Config files, which run in Node                                     |
| `eslint.config.js`     | Correctness rules **and the architectural zones**                   |
| `playwright.config.ts` | e2e config; starts the dev server itself                            |
| `.prettierrc`          | Formatting; `tailwindStylesheet` points at `src/styles/index.css`   |

## Path aliases

| Alias            | Resolves to              |
| ---------------- | ------------------------ |
| `@/…`            | `src/…`                  |
| `@sdp/contracts` | `packages/contracts/src` |
| `@sdp/types`     | `packages/types/src`     |

Declared in both `vite.config.ts` and `tsconfig.app.json` — they must be changed
together. There is no `baseUrl`: it is deprecated in TypeScript 6, so `paths`
targets are `./`-relative.
