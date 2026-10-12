# Routing and authorization

Two rules shape this: **every route is declared in `src/routes/`**, and **every
path string lives in `src/constants/routePaths.ts`** — one step further out, so
paths are maintained separately from the routing implementation.

## Paths

`src/constants/routePaths.ts` is the single source of truth. Segments drive both
the absolute paths (for links) and the relative paths (for the router), so the
two cannot drift.

```ts
export const SEGMENTS = {
  crp: 'crp',
  delivery: 'delivery',
  wiki: 'wiki',
  developer: 'developer',
  reviewer: 'reviewer',
  admin: 'admin',
  tasks: 'tasks',
  new: 'new',
  taskId: ':taskId',
  login: 'login',
} as const;

export const routePaths = {
  root: '/',
  login: `/${SEGMENTS.login}`,
  crp: {
    home: CRP,
    developer: {
      dashboard: `${CRP}/developer`,
      newTask: `${CRP}/developer/tasks/new`,
      taskDetail: (taskId: string) => `${CRP}/developer/tasks/${encodeURIComponent(taskId)}`,
    },
    reviewer: { dashboard: `${CRP}/reviewer` },
    admin: { dashboard: `${CRP}/admin` },
  },
  delivery: { root: '/delivery' },
  wiki: { root: '/wiki' },
} as const;
```

**Never write a path literal in a component.** `<Link to={routePaths.crp.developer.newTask}>`.
Parameterised paths are builder functions that encode their arguments, so a
customer id with a slash cannot break the URL.

## The tree

`src/routes/index.tsx`:

```tsx
export const routeTree: RouteObject[] = [
  {
    path: SEGMENTS.login,
    errorElement: <ErrorBoundary />,
    lazy: () => import('@/pages/LoginPage'),
  },
  {
    path: '/',
    element: (
      <RequireAuth>
        <AppLayout />
      </RequireAuth>
    ),
    errorElement: <ErrorBoundary />,
    children: [
      { index: true, element: <Navigate to={routePaths.crp.home} replace /> },
      { path: SEGMENTS.crp, children: codeReviewRoutes },
      { path: SEGMENTS.delivery, children: deliveryRoutes },
      { path: SEGMENTS.wiki, children: wikiRoutes },
    ],
  },
];
```

`/login` sits outside the shell — a sign-in screen with an app bar on it would be
absurd, and it must render without a session. `/` redirects to `/crp`: the
Code Review Portal is the only built sub-application, and giving it a real
segment means the shell's root is free for a future landing page.

Each portal contributes a `RouteObject[]` in its own file — `codeReviewRoutes.tsx`,
`deliveryRoutes.ts`, `wikiRoutes.ts`. Nothing else declares a route.

## Route modules and code splitting

Routes are lazy modules exporting `Component` and optionally `handle`:

```ts
{
  path: relativePaths.crp.developerNewTask,
  handle: handle({ title: content.tasks.newTask.title }),
  lazy: () => import("@/portals/code-review/features/tasks/routes/NewTaskPage"),
}
```

Every route is a separate chunk, so opening the developer dashboard does not
download the admin workspace. `handle` is typed by `routeHandle.ts`, and
`resolveRouteTitle(useMatches())` builds the document title without any route
knowing about the header.

## Guards

`RequireAuth` wraps the shell: no session sends you to `/login`. `RequireRoles`
is a pathless layout route, so one guard covers a whole branch:

```tsx
{
  element: <RequireRoles roles={["reviewer", "admin"]} />,
  children: [ /* every reviewer route */ ],
}
```

A user without the role gets a 403 that the existing `ErrorBoundary` already
renders.

`RequireAuth` stores the attempted location in navigation state, so sign-in
returns you to the page you asked for rather than dumping you on the home page.

**These guards shape UX. They are not security.** The API is the authority: MSW's
`requireRole()` rejects the request regardless of what the client rendered. See
[Security](./18-security.md).

## Typed params

```ts
const { taskId } = useTaskParams(); // string, not string | undefined
```

`routeParams.ts` centralises the narrowing so no component writes `params.taskId!`.

## The regression guard

`src/routes/routes.test.ts` walks `routePaths` — calling every builder with a
sample id — and asserts each leaf resolves through `matchRoutes(routeTree, path)`.
It also checks every workspace card href and every portal root, plus one path
that should _not_ match, so the test cannot pass vacuously.

This exists because three navigation links once pointed at unmounted paths and
landed users on the error boundary. That defect class cannot come back silently.
`e2e/navigation.spec.ts` covers the same ground in a real browser.

## Adding a sub-application

1. Add its segment and paths to `src/constants/routePaths.ts`.
2. Add its descriptor to `src/constants/portals.ts` (label, icon, roles, colour).
3. Create `src/routes/<name>Routes.ts` and mount it in `index.tsx`.

The home page renders workspace cards from `portals.ts`, so it needs no change.
