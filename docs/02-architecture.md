# Architecture

## Principles

These are the standards this codebase is held to. Where a rule can be enforced
by a tool rather than by review, it is.

| Principle                  | How it shows up here                                                                                   |
| -------------------------- | ------------------------------------------------------------------------------------------------------ |
| **Maintainability**        | Another developer can work on this without asking the author. Comments explain _why_, never _what_.    |
| **Consistency**            | The same problem gets the same solution. One way to fetch, one way to validate, one way to style.      |
| **Separation of concerns** | UI, business rules, API, state and validation live in different folders, and ESLint stops them mixing. |
| **Reusability**            | Shared where there is genuine commonality — not shared speculatively.                                  |
| **Type safety**            | `strict` + `noUncheckedIndexedAccess`; `any` is a lint error. Contracts are validated at runtime too.  |
| **Testability**            | Business rules are pure functions in `domain/`, testable without rendering.                            |
| **Accessibility**          | WCAG-conscious from the start, gated by axe in two suites.                                             |
| **Security**               | The client never decides authorization. See [Security](./18-security.md).                              |
| **Performance**            | Measured, not guessed. Route-level code splitting is the one thing done up front.                      |
| **Scalability**            | A fourth sub-application is three files, not a refactor.                                               |
| **Observability**          | One logging boundary; errors surface with context.                                                     |
| **Backward compatibility** | Shared components and contracts change deliberately, recorded as ADRs.                                 |

## Technology stack

| Layer                  | Choice                                              |
| ---------------------- | --------------------------------------------------- |
| Framework              | React 19, TypeScript 6, Vite 8                      |
| Routing                | React Router 7 (data router, lazy route modules)    |
| Server state           | TanStack Query 5                                    |
| Client state           | Zustand 5                                           |
| Forms                  | React Hook Form 7 + Zod 4 via `@hookform/resolvers` |
| Tables                 | TanStack Table 8                                    |
| Primitives             | Radix UI                                            |
| Styling                | Tailwind CSS 4 (CSS-first config) + CVA             |
| Icons / charts / dates | Lucide, Recharts, date-fns                          |
| Notifications          | Sonner                                              |
| Mocking                | MSW 2                                               |
| Testing                | Vitest 4, Testing Library, Playwright, axe-core     |
| Documentation          | Storybook 10                                        |

What each one is responsible for — and what it must **not** be used for — is in
[Dependency governance](./15-dependency-governance.md).

## The shape of the application

```
                         ┌──────────────────────────┐
   /login  ──────────────│  LoginPage (no shell)    │
                         └──────────────────────────┘
                                     │ RequireAuth
                         ┌───────────▼──────────────┐
   /       ──────────────│  AppLayout (app bar)     │
                         └───────────┬──────────────┘
                    ┌────────────────┼────────────────┐
                 /crp             /delivery         /wiki
             Code Review           Phase 2          Phase 3
```

The shell owns the app bar, the skip link, the error boundary and the auth
guard. It knows nothing about any portal's internals — it mounts whatever each
portal's route list declares.

## Feature architecture

Inside a portal, code is organised by **feature**, not by file type:

```
src/portals/code-review/
  domain/                  rules used by three or more features
  features/
    auth/  tasks/  checklists/  reviews/  admin/  reports/  notifications/
      api/          TanStack Query hooks — the only place fetching happens
      components/   feature-specific UI
      domain/       pure business rules — no React, no fetching
      hooks/        feature-specific React hooks
      routes/       page components
```

A feature owns its slice top to bottom. If two features need the same thing, it
moves up — to `portals/code-review/domain/`, or out to `src/lib`, `src/constants`
or `src/components`.

### Why `domain/` matters

Business rules live in `domain/` as pure functions with no React import, no
data fetching and no UI. That is enforced by ESLint, not convention:

```js
files: ['src/**/domain/**/*.ts'];
// bans react, react-dom, @tanstack/react-query, sonner, and any component import
```

The payoff is that the rules most likely to be wrong — checklist composition,
review-cycle counting, self-review exclusion, step gating — are tested by calling
a function, not by driving a form. `checklistModel.test.ts` asserts that the
Customization checklist has exactly 23 questions without rendering anything.

## Layer direction

Dependencies point one way. ESLint enforces each arrow.

```
  pages / routes
        │
        ▼
  features (api → domain, components, hooks)
        │
        ▼
  components/common   ── may not import a portal
        │
        ▼
  components/ui       ── may not import @/ at all
        │
        ▼
  lib · constants · content · schemas · types
```

Two rules do the heavy lifting:

- `src/components/ui/**` cannot import `@/*`, `react-router-dom`,
  `@tanstack/react-query`, `zustand` or `msw`. The design system stays
  portal-agnostic **by construction**, which is what will let Delivery and Wiki
  adopt it unchanged.
- `src/components/common/**` cannot import `@/portals/*`. This caught a real
  inversion during development, where the app bar depended on a component inside
  the code-review portal.

## Adding a sub-application

Three files. See [Routing](./11-routing-and-authorization.md) for detail.

1. A segment and paths in `src/constants/routePaths.ts`
2. A descriptor in `src/constants/portals.ts`
3. A route list in `src/routes/`, mounted in `src/routes/index.tsx`
