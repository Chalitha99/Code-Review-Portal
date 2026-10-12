# 23 · Adding a new UI — page, route, and wiring

The end-to-end recipe for putting a new screen on the air: where the files go,
what each one is allowed to know, and the order to write them in.

Read [22 · Route modules](./22-route-modules.md) first — it explains the one
export a page file must have. This document is the wider job around it.

Written for someone new to the codebase. Every step below is a real file in this
repository, and the worked example is a screen that is genuinely missing today.

---

## The mental map

A screen is never one file. It is four layers, and they are separate on purpose:

```
src/content/*.json          the words           ← what the user reads
src/constants/routePaths.ts the address         ← where it lives
src/portals/…/routes/*.tsx  the page            ← the screen itself
src/routes/*Routes.tsx      the registration    ← how the router finds it
```

Why split them? Each answers a different question, and each changes for a
different reason. Copy changes without touching code. A URL changes in one file
instead of thirty. The router grows without the pages knowing it exists.

The rule that follows from this, and the one most often broken by newcomers:

> **A page component contains no string literals and no URL literals.**
> Words come from `@/content`. Addresses come from `@/constants/routePaths`.

---

## Before you write anything: where does the page live?

Two possible homes. Pick with this table:

| Question                                                                          | Answer | Put it in                                         |
| --------------------------------------------------------------------------------- | ------ | ------------------------------------------------- |
| Does the screen belong to the _shell_ — sign-in, a portal chooser, an error page? | Yes    | `src/features/<name>/routes/` (app-wide)          |
| Does it belong to one feature of one portal?                                      | Yes    | `src/portals/<portal>/features/<feature>/routes/` |

Almost every new screen is the second. The shell owns very few: sign-in and the
portal chooser live in `src/features/auth` and `src/features/home`, which are
application-wide features rather than any portal's. `src/pages/` no longer
exists — it held one unrouted screen and was removed.

The feature folder is created on demand. A feature only grows the sub-folders it
actually needs:

```
portals/code-review/features/admin/
  api/         TanStack Query hooks for this feature
  components/  components only this feature uses
  domain/      pure business rules, no React
  hooks/       stateful logic extracted from the page
  routes/      the page components themselves     ← your new file goes here
```

Do not create empty folders "for later". Add `components/` the day you have a
second component.

---

## The worked example

Task: build the **Admin dashboard** at `/crp/admin`.

> **Read this as a pattern, not as an outstanding task.** When this was
> written, `AdminDashboardPage.tsx` was an empty placeholder and `/crp/admin`
> led nowhere. It now resolves to `AdminTasksPage`, and the empty file has been
> removed. The six steps below are still exactly how a new screen is added —
> only the example is no longer a gap. To follow along for real, pick a route
> that genuinely does not exist yet.

The path is already in `routePaths`, the route is registered in
`codeReviewRoutes.tsx`, and the "Admin" card on the home page reaches it.

---

### Step 1 · Put the words in `content/`

Strings live in typed JSON, never in the component. Add to
[src/content/home.json](../src/content/home.json), or create a new file for a
larger feature:

```jsonc
// src/content/admin.json
{
  "dashboard": {
    "title": "Admin",
    "subtitle": "Manage users, customers, and system-wide reports.",
    "empty": {
      "title": "Nothing to manage yet",
      "description": "Users and customers will appear here once the API is connected.",
    },
  },
}
```

A new file has to be registered in the catalog —
[src/content/index.ts](../src/content/index.ts):

```ts
import home from './home.json';
import a11y from './a11y.json';
import admin from './admin.json'; // ← add

export const content = {
  a11y,
  home,
  admin, // ← add
} as const;
```

`as const` is what makes `content.admin.dashboard.title` autocomplete and makes
a typo a compile error rather than `undefined` on screen.

**Strings with a value in them** use the `t()` helper, already exported from
`@/content`. Placeholders are `{name}`:

```jsonc
{ "totalUsers": "{count} users" }
```

```tsx
t(content.admin.dashboard.totalUsers, { count: 42 }); // → "42 users"
```

Never build a sentence by concatenating (`count + " users"`) — word order
differs between languages, and the whole point of this folder is that a
translator can work on the JSON alone.

---

### Step 2 · Declare the address in `routePaths.ts`

[src/constants/routePaths.ts](../src/constants/routePaths.ts) is the only file
in the repo allowed to contain a URL string. It has three exports and each has a
distinct job:

| Export          | Used by                                        | Example value  |
| --------------- | ---------------------------------------------- | -------------- |
| `SEGMENTS`      | the other two, and the router's top level      | `"admin"`      |
| `routePaths`    | components, for `<Link to={…}>` — **absolute** | `"/crp/admin"` |
| `relativePaths` | the route tree — **relative to the parent**    | `"admin"`      |

The split exists because React Router mounts children relative to their parent:
`codeReviewRoutes` is already nested under `/crp`, so writing `path: "/crp/admin"`
there would produce `/crp/crp/admin`. Both forms derive from the same `SEGMENTS`
entry, so they cannot drift apart.

For our example all three already exist:

```ts
export const SEGMENTS = { crp: 'crp', admin: 'admin' /* … */ } as const;

const CRP = `/${SEGMENTS.crp}` as const;

export const routePaths = {
  crp: {
    admin: { dashboard: `${CRP}/${SEGMENTS.admin}` }, // "/crp/admin"
  },
} as const;

export const relativePaths = {
  crp: { admin: SEGMENTS.admin }, // "admin"
} as const;
```

#### Paths with a parameter in them

A dynamic segment is a **builder function**, not a template you write at the
call site:

```ts
export const SEGMENTS = {
  tasks: 'tasks',
  taskId: ':taskId', // the router's placeholder form
} as const;

export const routePaths = {
  crp: {
    developer: {
      // Builders encode their arguments. A task id containing "/" or "?" cannot
      // break the URL, which a template literal at the call site would allow.
      taskDetail: (taskId: string) =>
        `${CRP}/${SEGMENTS.developer}/${SEGMENTS.tasks}/${encodeURIComponent(taskId)}`,
    },
  },
} as const;
```

Read the parameter back through [routeParams.ts](../src/routes/routeParams.ts),
not raw `useParams` — it centralises the narrowing so no component has to write
`params.taskId!`.

---

### Step 3 · Write the page

The file is named after its export, in PascalCase:
`AdminDashboardPage.tsx`.

```tsx
// src/portals/code-review/features/admin/routes/AdminDashboardPage.tsx

import { Heading, Text } from '@/components/ui';
import { content } from '@/content';

/**
 * The Code Review Portal's admin workspace — `Figma UI Wireframes/Admin.png`.
 *
 * Mounted at `/crp/admin` behind the admin role. Renders a static shell for
 * now; the user and customer tables arrive with the API in phase two.
 */
export function AdminDashboardPage() {
  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-6 px-6 py-12">
      <div className="flex flex-col gap-1">
        <Heading level={1} size="lg">
          {content.admin.dashboard.title}
        </Heading>
        <Text tone="muted">{content.admin.dashboard.subtitle}</Text>
      </div>
    </div>
  );
}

export { AdminDashboardPage as Component };
export default AdminDashboardPage;
```

Four things to notice, each a standard from
[04 · Coding standards](./04-coding-standards.md):

1. **JSDoc on the exported component**, saying what it is and where it sits — and
   pointing at the wireframe it implements.
2. **No string literals in the markup.** Every word came from `content`.
3. **`export { … as Component }`.** Without it the route fails to type-check.
   This is [22 · Route modules](./22-route-modules.md).
4. **Exactly one `<h1>`** — `Heading level={1}` — and it is the page title.

#### The file's internal order

Keep this order in every component file:

1. Imports — external packages, then `@sdp/*`, then `@/…`, then `./relative`
2. Types and interfaces
3. Constants
4. The component
5. Sub-components used only in this file

Past roughly 200 lines the file is doing more than one job. Split it by
responsibility — pull a section into `components/`, pull logic into a hook in
`hooks/` — not by counting lines.

---

### Step 4 · Register the route

[src/routes/codeReviewRoutes.tsx](../src/routes/codeReviewRoutes.tsx):

```tsx
import type { RouteObject } from 'react-router-dom';
import { relativePaths } from '@/constants/routePaths';
import { content } from '@/content';
import type { RouteHandle } from './routeHandle';

/** Typed so a typo in a handle key is a compile error, not a silent no-op. */
const handle = (value: RouteHandle): RouteHandle => value;

export const codeReviewRoutes: RouteObject[] = [
  {
    index: true,
    element: <HomeRoute />, // the portal chooser, from src/features/home
  },
  {
    path: relativePaths.crp.admin,
    handle: handle({ title: content.admin.dashboard.title }),
    lazy: () => import('@/portals/code-review/features/admin/routes/AdminDashboardPage'),
  },
];
```

Three details:

- **`lazy`, not `element`.** Each route becomes its own JavaScript chunk, so
  visiting the developer dashboard does not download the admin one. You can see
  the split in `npm run build` output.
- **`relativePaths`, not `routePaths`.** See the table in step 2.
- **`handle`** carries the page title. The shell reads it via
  `resolveRouteTitle(useMatches())` in [routeHandle.ts](../src/routes/routeHandle.ts),
  so the title lives next to the route that owns it instead of in a lookup table
  someone has to remember to update. The one-line `handle()` wrapper exists only
  to type-check the object — without it, `handle` is `unknown` and a misspelt key
  fails silently.

`index: true` means "this is the page at the parent's own address" — it is how
`/crp` itself renders, and it never takes a `path`.

---

### Step 5 · Link to it

Anything that navigates uses `routePaths` — the **absolute** form:

```tsx
import { Link } from 'react-router-dom';
import { routePaths } from '@/constants/routePaths';

<Link to={routePaths.crp.admin.dashboard}>{content.admin.dashboard.title}</Link>;
```

If the destination belongs on the home page's workspace grid, add it in
[HomePage.tsx](../src/features/home/routes/HomePage.tsx), whose cards are
derived from `permissions.accessibleWorkspaces()` and painted by
`config/workspaceTheme.ts`. A `constants/navigation.ts` holding the same data
as a typed list was written but never wired to anything, and has been removed —
if you reinstate that approach, replace the HomePage implementation rather than
running both:

```ts
{
  id: "admin",
  title: content.home.workspaces.admin.title,
  description: content.home.workspaces.admin.description,
  icon: "ShieldCheck",                       // Lucide icon name
  href: routePaths.crp.admin.dashboard,      // never a literal
  requiredRoles: ["admin"],
  gradient: "admin",
}
```

For navigation triggered by code rather than a click — after a successful
submit, say — use the hook, still with no literal:

```tsx
const navigate = useNavigate();
navigate(routePaths.crp.admin.dashboard);
```

---

### Step 6 · Verify

```bash
npm run typecheck     # the route module contract, and every type
npm run lint          # naming, unused code, hook rules
npm run build         # confirms the lazy chunk actually splits
```

`typecheck` catches the mistakes that matter most here — a missing `Component`
export, a misspelt `content` key, a `handle` with a wrong field. Run it before
the dev server; it is faster and the message is more precise.

---

## Building the UI inside the page

The page is a layout. The pieces inside it come from one of three places, and
choosing wrongly is the most common architectural mistake in this codebase.

### Which tier does a component belong to?

|                     | `src/components/ui/`             | `src/components/common/`                 | the feature's `components/` |
| ------------------- | -------------------------------- | ---------------------------------------- | --------------------------- |
| Knows about         | React, Radix, CVA — nothing else | app constants, content, routing, queries | anything its feature knows  |
| May import `@/…`    | **No**                           | Yes                                      | Yes                         |
| May import a portal | No                               | No                                       | Its own only                |
| Gets its data from  | props only                       | may fetch                                | may fetch                   |
| Example             | `Button`, `Card`, `DataTable`    | `AppBar`, `PageHeader`                   | `TaskTable`                 |

Decide with two questions:

1. **Does it need `@/…` to work?** If yes it cannot be `ui/`. A component that
   imports `content` or `Link` is `common/` at best.
2. **Does a second consumer exist right now?** If not, it belongs to the feature.
   Promote it the day something else genuinely needs it — not in anticipation.

The `ui/` restriction is the one worth protecting. A design system that _cannot_
import the app is portal-agnostic by construction, which is what will let the
Delivery and Wiki portals adopt it unchanged instead of forking it. Concretely,
a `ui/` component takes every string as a prop:

```tsx
// Wrong — a ui/ component with copy baked in is now Code-Review-specific.
export function EmptyState() {
  return <p>No tasks yet</p>;
}

// Right — the caller supplies the words.
export function EmptyState({ title, description }: EmptyStateProps) {
  return (
    <div>
      <p className="text-heading font-semibold">{title}</p>
      <p className="text-muted">{description}</p>
    </div>
  );
}
```

### Rules for a `ui/` component

1. **Props in, events out.** No fetching, no navigation, no global state.
2. **Accept `className`** and merge it with `cn()`, so a caller can adjust layout
   without wrapping it in a div.
3. **Spread the rest** (`...props`) onto the root, so callers can pass `aria-*`,
   `data-*` and `id`.
4. **Variants, not booleans.** `tone="danger"`, not `isDanger`.
5. **No copy.** Every string is a prop.
6. **Accessible by default** — a caller should not have to remember an
   `aria-label` for the component to be correct.

New `ui/` components are exported from
[src/components/ui/index.ts](../src/components/ui/index.ts) so consumers import
from one place:

```ts
import { Button, Card, Heading, Text, cn } from '@/components/ui';
```

### Styling

Tailwind utilities in the JSX. Variants through CVA, composed with `cn()` from
`@/components/ui`.

**Every colour is a token.** The palette is defined as `@theme` variables in
[src/styles/Themes.css](../src/styles/Themes.css) — `surface`, `heading`, `ink`,
`muted`, `border`, `primary-600`, `success-bg`/`success-fg`, and so on. Use the
token name:

```tsx
<div className="border-border rounded-card border bg-surface p-6">
  <h2 className="text-heading">…</h2>
  <p className="text-muted">…</p>
</div>
```

```tsx
// Wrong — an arbitrary value bypasses the design system and dark mode with it.
<div className="bg-[#f4f4f5] text-[#18181b]">
```

`cn()` is not just `clsx`: it is `tailwind-merge` configured with this project's
custom `rounded-*` and `shadow-*` scales, so a caller's `className` reliably wins
over a component's defaults.

Inline `style` is for genuinely dynamic values only — a computed bar width, an
animation delay. Not for colours or spacing.

CSS files are a last resort. [Pages.css](../src/styles/Pages.css) admits only
`@keyframes`, selectors utilities cannot express (`:focus-within` combinations,
`::selection`), and multi-stop gradients reused in three or more places.

### Accessibility, while you write it — not after

These are the traps this project has already hit:

- **One `<h1>` per page**, and heading levels never skip. `Heading level={2}`
  after a `level={1}`.
- **Never colour alone.** A status needs an icon, a label, or visually hidden
  text as well.
- **An icon-only button needs an accessible name** — `aria-label` from
  `content.a11y`, never a hardcoded string.
- **Decorative markup gets `aria-hidden="true"`** so a screen reader does not
  read out the background shapes.
- **A list of things is a list.** `<ul>`/`<li>`, so assistive technology
  announces "list, 3 items".
- **A progress indicator is not navigation.** `Stepper` is an `<ol aria-label>`,
  not a `<nav>` — a second `<nav>` breaks the `landmark-unique` rule.

---

## TypeScript habits that keep this codebase honest

The compiler is set to `strict` with `noUncheckedIndexedAccess`,
`verbatimModuleSyntax` and `erasableSyntaxOnly`. The practical consequences:

```ts
// `any` is banned. Use `unknown` and narrow.
function parse(input: unknown) {
  if (typeof input === 'string') {
    /* input is string here */
  }
}

// Indexing gives you `T | undefined`. Handle it — do not reach for `!`.
const first = items[0];
if (!first) return null;

// Type-only imports say so. Enforced.
import type { RouteObject } from 'react-router-dom';

// `enum` is not available. Use an `as const` object.
export const STATUS = { draft: 'draft', submitted: 'submitted' } as const;
export type Status = (typeof STATUS)[keyof typeof STATUS];
```

For state, prefer a discriminated union over a bag of booleans — it makes the
impossible state unrepresentable:

```ts
// Bad: nothing stops { isLoading: true, isError: true }
{ isLoading: boolean; isError: boolean; data?: Task[] }

// Good
| { status: "loading" }
| { status: "error"; error: ApiError }
| { status: "success"; data: Task[] }
```

Imports are absolute across a boundary and relative within a folder:

```ts
import { Button } from '@/components/ui'; // crossing a boundary
import { TaskRow } from './TaskRow'; // same feature
```

`../../../` means you have crossed a boundary and should be using `@/`.

---

## Phase-one status: what this repo does not have yet

This document describes the standard the project is built to. Some of the
supporting machinery is now in place. This table used to list seven gaps; six
of them have been closed, and it is kept only to say so plainly, because the
old version told newcomers not to look for things that exist.

| Previously listed as missing                        | Today                                                                                                         |
| --------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| `routes/guards.tsx` — `RequireAuth`, `RequireRoles` | Present as `app/RequireAuth.tsx` and `app/RequireWorkspace.tsx`, and every workspace route is wrapped         |
| `app/ErrorBoundary.tsx`                             | Real, and `errorElement: <RouteError />` is wired on the authenticated branch                                 |
| `AppLayout` mounted at `/`                          | `RootLayout` is mounted under `RequireAuth`; it renders `AppBar` and `AppFooter` on every authenticated route |
| `routes/routes.test.ts` — path regression guard     | Still absent. `LegacyWorkspaceRedirect.test.tsx` and `app/router.test.tsx` cover part of it                   |
| `deliveryRoutes.ts`, `wikiRoutes.ts`                | `/delivery` and `/wiki` are mounted in `routes/index.tsx`; one lazy route each does not yet earn a file       |
| A populated `components/ui/`                        | Real: Button, Card, Dialog, Field, Select, Tabs, SegmentedOptions, Alert, controls, the brand mark            |
| ESLint architectural zones                          | **Enforced.** `eslint-plugin-boundaries` with a verified policy — see below                                   |

The last row has flipped, and it is the one to internalise. Importing across a
layer now fails `npm run lint`, not review. The rules were checked with
deliberate probes rather than assumed working: `common -> portal`,
`lib -> feature` and `domain -> react` all fail as intended. `ui/` may import
`content` and `lib` by documented exception, and nothing else from `@/`.

---

## Checklist before you open a pull request

- [ ] Every user-facing string came from `@/content` — no literal copy in the component
- [ ] Every URL came from `@/constants/routePaths` — no path literal anywhere but that file
- [ ] The page file exports `Component` (`export { PageName as Component };`)
- [ ] The route uses `lazy:`, `relativePaths`, and a `handle({ title })`
- [ ] The file is named after its export, in PascalCase, in the right feature's `routes/`
- [ ] JSDoc on the exported component, saying what it is and where it sits
- [ ] Comments explain _why_, never restate _what_
- [ ] One `<h1>`; heading levels do not skip; icon-only buttons have names
- [ ] Colours are tokens; no `bg-[#…]`; no inline `style` except dynamic values
- [ ] `npm run typecheck`, `npm run lint`, and `npm run build` all pass

See [14 · Definition of done](./14-definition-of-done.md) for the full merge
criteria, including the test and Storybook gates that apply once those tiers are
in place.

---

## Common mistakes

| Symptom                                                | Cause                                                           | Fix                                                                                               |
| ------------------------------------------------------ | --------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| `has no properties in common` on the `lazy` line       | Page file has no `Component` export                             | See [22 · Route modules](./22-route-modules.md)                                                   |
| URL becomes `/crp/crp/admin`                           | Used `routePaths` (absolute) in the route tree                  | Use `relativePaths` for `path:`                                                                   |
| Link 404s onto the error boundary                      | Path added to `routePaths` but no route registered              | Add the entry to `codeReviewRoutes`                                                               |
| `Property 'admin' does not exist on type`              | New JSON file not added to `content/index.ts`                   | Import it and add it to the `content` object                                                      |
| `content.x.y` is `undefined` at runtime, no type error | JSON imported without `as const` on the catalog                 | The catalog in `content/index.ts` must end `} as const`                                           |
| `'React' is declared but its value is never read`      | Leftover `import React from 'react'`                            | Delete it — the modern JSX transform injects it, and `noUnusedLocals` makes unused imports errors |
| Page renders but has no app bar                        | The layout route is not mounted — see the phase-one table above | Expected today                                                                                    |
| A `ui/` component "needs" `content`                    | It is not a `ui/` component                                     | Move it to `common/`, or take the strings as props                                                |
