# Performance

The rule: **measure, then optimise.** Every optimisation costs readability, and
one paid without evidence is a pure loss. Two things are done up front anyway,
because they are structural and retrofitting them is expensive.

## Done up front

### Route-level code splitting

Every route is a lazy module, so each page is its own chunk:

```ts
{ path: relativePaths.crp.admin, lazy: () => import("…/AdminDashboardPage") }
```

A developer opening their dashboard never downloads the admin workspace. This is
structural — it comes free with the routing pattern and cannot be added later
without touching every route.

`RouteFallback` renders during the load, so a slow connection sees a skeleton
rather than a blank frame.

### Self-hosted fonts

`@fontsource/inter` and `@fontsource/poppins` are bundled. No third-party
request, no layout shift waiting on a font CDN, and one fewer external
dependency at runtime.

## Query caching

The single biggest performance lever in this app is not shipping a request at
all. TanStack Query deduplicates identical in-flight queries, serves cached data
while revalidating, and is configured once in `src/lib/queryClient.ts`:

- a `staleTime` long enough that navigating back to a list does not refetch it
- one retry, and **no retry on 4xx** — retrying a 403 cannot succeed and just
  delays the error the user needs to see

Set `staleTime` per query where the data's volatility genuinely differs: the
customer list changes rarely, a task's review state changes constantly.

## When to reach for a React optimisation

`useMemo`, `useCallback` and `memo` are for a measured problem. In order:

1. Profile with React DevTools. Find what actually re-renders and how long it
   takes.
2. Prefer a structural fix — move state down, split the component, pass
   `children` — over memoisation.
3. Memoise only if the structural fix is not available.

A `useMemo` around an object literal costs more than it saves. A `useCallback`
whose dependencies change every render does nothing at all.

## Lists

`DataTable` paginates, so the DOM holds a page rather than a dataset.
Virtualisation is deliberately absent: no screen in the spec renders more than a
few hundred rows, and a virtualiser breaks Ctrl+F, breaks screen-reader row
counts and complicates every test. Add it when a screen needs it.

Keys are stable ids, never the array index — an index key makes React reuse the
wrong DOM node on reorder, which shows up as a form field keeping the previous
row's value.

## Images

The wireframe assets are SVG where possible. Raster images get explicit `width`
and `height` so the layout does not shift, and `loading="lazy"` below the fold.

## Bundle

```bash
npm run build          # reports chunk sizes
```

Watch for a chunk that grows unexpectedly — usually a barrel import pulling in a
whole folder, or a heavy library imported at the top level of a shared file.
`recharts` in particular belongs only in the chart components, which are only
imported by routes that draw charts.

## Budgets

Informal, but worth holding:

| Metric                    | Target                      |
| ------------------------- | --------------------------- |
| Initial JS (gzipped)      | < 250 KB                    |
| Route chunk               | < 100 KB                    |
| Largest Contentful Paint  | < 2.5s on a mid-tier laptop |
| Interaction to Next Paint | < 200ms                     |

## What not to do

- Do not optimise before profiling.
- Do not memoise everything "to be safe" — it adds allocation and dependency
  arrays that go stale.
- Do not add a virtualiser, a state library or a bundler plugin for a problem
  nobody has demonstrated.
- Do not trade accessibility or clarity for a millisecond.
