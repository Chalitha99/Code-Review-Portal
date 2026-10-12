# Design patterns

The patterns this codebase uses repeatedly, why each one is here, and when to
reach for it.

## Compound components

Radix's model, adopted throughout: a parent holds state, children read it via
context.

```tsx
<Card>
  <CardHeader>
    <CardTitle>My Tasks</CardTitle>
  </CardHeader>
  <CardContent>…</CardContent>
</Card>
```

Used by `Card`, `Dialog`, `Tabs`, `Table` and `NotificationPanel`. The
alternative — one component with fifteen props — makes every new layout a prop
addition. **Reach for it when a component has structural variation**, not just
visual variation.

## Variants with CVA

Visual variation is data, not branching.

```ts
const buttonVariants = cva('inline-flex items-center …', {
  variants: {
    variant: { primary: '…', outline: '…', danger: '…' },
    size: { sm: '…', md: '…', lg: '…' },
  },
  defaultVariants: { variant: 'primary', size: 'md' },
});
```

The variant keys become the prop type, so an invalid variant is a compile error,
and `cn()` (clsx + a configured tailwind-merge) lets a caller override a class
without a specificity fight. **Reach for it when a component has two or more
visual variants.**

## `asChild` / polymorphism

A button that is really a link should render an `<a>` and still look like a
button.

```tsx
<Button asChild>
  <Link to={routePaths.crp.developer.newTask}>New task</Link>
</Button>
```

`Slot` merges the button's props onto the child. **A component that renders more
than one child must wrap `children` in `<Slottable>`** or `Slot` throws — this
is not optional, and it is how `Button` and `HomeIconButton` are written.

## Slot props for composition across layers

`AppBar` takes `notifications` and `accountMenu` as `ReactNode` props rather
than rendering them.

```tsx
<AppBar notifications={<NotificationCenter />} accountMenu={<UserMenu />} />
```

Without this, `AppBar` — a shared component — would have to import a portal
feature, which is exactly the layering inversion the ESLint zones forbid.
**Reach for it when a shared component needs a piece that knows about the app.**

## Server state vs client state

Two different problems, two different tools; the boundary is in
[State management](./08-state-management.md). The pattern that matters:
**anything that came from the API is TanStack Query's, and it is never copied
into a store.**

## Query key factories

```ts
export const qk = {
  tasks: {
    all: () => ['tasks'] as const,
    mine: () => [...qk.tasks.all(), 'mine'] as const,
    mineKpis: () => [...qk.tasks.all(), 'mine', 'kpis'] as const,
    detail: (id: string) => [...qk.tasks.all(), 'detail', id] as const,
  },
};
```

Hierarchical keys mean `invalidateQueries({ queryKey: qk.tasks.all() })` after a
mutation refreshes the list, the KPIs and every open detail in one call.
Hand-written arrays drift; a typo silently invalidates nothing.

## Pure domain functions

Business rules are functions from data to data, in `domain/`, with no React and
no fetching.

```ts
export function taskDetailsBlockers(values: Partial<TaskDetailsStep>): StepBlocker[];
export function canAdvance(blockers: readonly StepBlocker[]): boolean;
```

One function drives both the "Before you can continue" panel and the Next
button's disabled state, so the message a user reads and the behaviour they get
cannot disagree. **Reach for it whenever a rule can be stated as input → output.**

## Contract validation at the boundary

Every response is parsed by a Zod schema in `apiClient` before it reaches a
component. A backend that changes shape fails loudly, at the boundary, with the
path of the offending field — instead of producing `undefined` three components
deep.

## Route modules

Each route is a lazy module exporting `Component` and optionally `handle`:

```ts
{ path: "tasks/new", lazy: () => import("@/portals/…/routes/NewTaskPage"),
  handle: handle({ title: "New review task" }) }
```

Code splitting per route, and `useMatches()` reads `handle` to build the page
title without any route knowing about the header.

## Guards as components

```tsx
<RequireAuth><AppLayout /></RequireAuth>
<RequireRoles roles={[ROLES.reviewer]}><ReviewerLayout /></RequireRoles>
```

Composable, declarative, and testable by rendering. They shape UX only — the
API is the authority. See [Security](./18-security.md).

## Error boundaries

One `ErrorBoundary` on every route branch. A crash in a page loses the page, not
the shell.

## Presentational / connected split

Every panel exists twice: a presentational component in `src/components/ui/`
that takes props, and a connected component in `src/components/common/` or a
feature that supplies them.

`NotificationPanel` (props) + `NotificationCenter` (queries) is the reference
example. It is what lets the panel have stories and axe coverage, and lets the
connected piece be tested against MSW without a Popover in the way.

## Anti-patterns

| Don't                                    | Because                                                                              |
| ---------------------------------------- | ------------------------------------------------------------------------------------ |
| Copy server data into Zustand            | Two sources of truth; the copy goes stale                                            |
| `useEffect` to derive state              | It is an expression, not a synchronisation                                           |
| A prop named `type` that switches layout | That is a compound component                                                         |
| Barrel-export everything                 | Circular imports and slow builds; barrels are for `components/ui` and `content` only |
| Colour as the only signal                | Fails WCAG 1.4.1 and greyscale printing                                              |
| A `ref` to reach into a child            | Lift the state or take a callback                                                    |
