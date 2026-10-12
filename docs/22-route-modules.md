# 22 · Route modules — how to export a page file correctly

A companion to [11 · Routing and authorization](./11-routing-and-authorization.md).
That document explains the route _tree_. This one explains the _file_ a route
points at — what it must export, why, and how to read the TypeScript error you
get when the export is wrong.

Written for someone new to TypeScript. If you already know what a "route module"
is, you only need [The rule](#the-rule) and [The checklist](#the-checklist).

---

## The rule

A file loaded by `lazy: () => import("...")` **must export a value named
`Component`**. Not `default`, not the page's own name — `Component`.

```tsx
// The page itself. Keep the descriptive name.
export function CodeReviewHomePage() {
  return <div>CodeReviewHomePage</div>;
}

// The line that makes it a route module. This is the one people forget.
export { CodeReviewHomePage as Component };

// Optional convenience for direct imports (tests, Storybook).
export default CodeReviewHomePage;
```

Every page in this project follows that shape. If you open any page file, the
last two lines look like the two above.

---

## Why `Component`, and not something else

Normally when you lazy-load a React component you write
`React.lazy(() => import("./Page"))`, and React reads the module's **`default`**
export. React Router 7 does something different.

`lazy` here does not load _a component_. It loads **a bundle of route fields** —
the component, plus optionally a `loader`, an `ErrorBoundary`, a `handle`, and
so on. So React Router does not ask "what is the default export?" It asks:

> Give me an object. I will look for keys named `Component`, `loader`,
> `ErrorBoundary`, `action`, `handle`, `shouldRevalidate`… and copy each one it
> finds onto the route.

An ES module _is_ an object: its named exports are its keys. So this file…

```tsx
export function MyTasksPage() {
  /* … */
}
export { MyTasksPage as Component };
export async function loader() {
  /* … */
}
```

…arrives at the router as `{ MyTasksPage: fn, Component: fn, loader: fn }`, and
the router picks out `Component` and `loader`. The extra `MyTasksPage` key is
ignored — harmless.

The payoff is code splitting at the right granularity: the page _and_ its data
loader travel in one chunk, downloaded only when the user visits that URL. You
can see it in the build output — each route module gets its own `.js` file:

```
dist/assets/CodeReviewHomePage-CU-s-jJ5.js   0.23 kB
dist/assets/index-BguTLG6l.js              340.95 kB
```

---

## Reading the error when you get it wrong

If the page file exports only `CodeReviewHomePage` and no `Component`, the
`lazy:` line goes red and `npm run typecheck` prints this:

```
src/routes/codeReviewRoutes.tsx(16,5): error TS2322:
  Type '() => Promise<typeof import("@/pages/CodeReviewHomePage")>'
  is not assignable to type 'LazyRouteDefinition<BaseRouteObject> | undefined'.
    …
      Type 'typeof import(".../CodeReviewHomePage")' has no properties in
      common with type 'Omit<BaseRouteObject, UnsupportedLazyRouteFunctionKey> & …'
```

TypeScript errors read worst-first. Skip to the **last** line — it is the actual
complaint, and the lines above it are just the chain of reasoning that led
there. Translated:

| The error says                            | It means                                              |
| ----------------------------------------- | ----------------------------------------------------- |
| `typeof import(".../CodeReviewHomePage")` | "the module's shape — the set of names it exports"    |
| `Omit<BaseRouteObject, …>`                | "the set of names a route is allowed to define"       |
| **`has no properties in common`**         | **"your file exports nothing the router recognises"** |

That last phrase is the tell. `has no properties in common` almost always means
a missing or misspelt `Component` export — not a broken install, not a version
mismatch, not a path alias problem.

> **Note on where the error appears.** The red squiggle is on
> `codeReviewRoutes.tsx`, but the mistake is in `CodeReviewHomePage.tsx`.
> TypeScript reports errors where the type _mismatch_ is detected, which is at
> the call site, not where the missing export lives. When a route file errors,
> open the file it imports.

---

## Adding a new page, start to finish

Say you are adding an admin dashboard at `/crp/admin`.

### 1 · Add the address

Paths live in one file only — [src/constants/routePaths.ts](../src/constants/routePaths.ts).
Never type a URL string anywhere else.

```ts
export const SEGMENTS = {
  crp: 'crp',
  admin: 'admin', // ← the segment
} as const;

export const routePaths = {
  crp: {
    admin: { dashboard: `${CRP}/${SEGMENTS.admin}` }, // ← the absolute path, for <Link to={…}>
  },
} as const;

export const relativePaths = {
  crp: { admin: SEGMENTS.admin }, // ← the relative path, for the router
} as const;
```

Absolute paths are for links. Relative paths are for the route tree, because the
router mounts children relative to their parent. Both derive from `SEGMENTS`, so
they cannot drift apart.

### 2 · Write the page as a route module

```tsx
// src/portals/code-review/features/admin/routes/AdminDashboardPage.tsx

export function AdminDashboardPage() {
  return <div>Admin dashboard</div>;
}

export { AdminDashboardPage as Component };
export default AdminDashboardPage;
```

### 3 · Register it

```tsx
// src/routes/codeReviewRoutes.tsx
{
  path: relativePaths.crp.admin,
  lazy: () => import("@/portals/code-review/features/admin/routes/AdminDashboardPage"),
},
```

### 4 · Check it

```bash
npm run typecheck
```

A clean run means the route module contract is satisfied. There is no need to
start the dev server just to find out whether the export was right.

---

## The `handle` field, briefly

A route can carry extra data via `handle`, which the app shell reads through
`useMatches()` to work out the current page title:

```tsx
{
  path: relativePaths.crp.admin,
  handle: handle({ title: content.admin.dashboard.title }),
  lazy: () => import("@/portals/code-review/features/admin/routes/AdminDashboardPage"),
}
```

The `handle()` wrapper in [src/routes/codeReviewRoutes.tsx](../src/routes/codeReviewRoutes.tsx)
is a one-line identity function typed as `(value: RouteHandle) => RouteHandle`.
It exists purely so a typo in a key is a compile error instead of a silent
no-op — without it, `handle` is `unknown` and TypeScript checks nothing. See
[src/routes/routeHandle.ts](../src/routes/routeHandle.ts) for the type and the
`resolveRouteTitle` helper that reads it.

---

## The checklist

Before you commit a new page:

- [ ] The page file exports `Component` — `export { PageName as Component };`
- [ ] The path came from `constants/routePaths`; no URL literal in the route file
- [ ] The route uses `lazy: () => import("@/…")`, with the `@/` alias, not a relative `../../` path
- [ ] `npm run typecheck` passes
- [ ] `npm run lint` passes

---

## Common mistakes

| Symptom                                           | Cause                                          | Fix                                                                                                                                                                                                 |
| ------------------------------------------------- | ---------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `has no properties in common`                     | No `Component` export                          | Add `export { PageName as Component };`                                                                                                                                                             |
| Same error, export looks present                  | Misspelt — `component`, `Components`           | The name is exactly `Component`, capital C                                                                                                                                                          |
| Same error, but `export default` is there         | `default` is not a route field                 | Add the named `Component` export too; keep `default` if you like                                                                                                                                    |
| `'React' is declared but its value is never read` | Leftover `import React from 'react'`           | Delete the line. The project uses the modern JSX transform (`"jsx": "react-jsx"`), so React is injected automatically. Unused imports are errors here, not warnings, because `noUnusedLocals` is on |
| Page renders but has no app bar or layout         | The route is not nested under the layout route | Check the parent entry in [src/routes/index.tsx](../src/routes/index.tsx) has an `element` that renders `<Outlet />`                                                                                |
| `Cannot find module '@/pages/…'`                  | Alias not resolving                            | `@/` is declared twice and both must agree: `paths` in [tsconfig.app.json](../tsconfig.app.json) and `resolve.alias` in [vite.config.ts](../vite.config.ts)                                         |
