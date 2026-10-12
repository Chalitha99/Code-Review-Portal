# 0004 · Headless tables (TanStack Table), not a grid component

**Status:** Accepted · **Date:** Phase 1, Sprint 0 (decided with the user)

## Context

Eight grids in the product: My Tasks, three reviewer queues, Admin Tasks, Users, Customers, and
the three checklist administration views. The wireframes specify them precisely — a left accent
bar in the customer's colour, a status cell that grows a `Cycle N` badge past cycle 1, mono task
IDs, a version pill beside the title, and a different action column per grid.

## Decision

TanStack Table v9, headless, rendered entirely through our own cells in `components/DataTable.tsx`
and `components/cells.tsx`. The library provides sorting, filtering and pagination; every pixel is
ours.

Column sets are assembled by `buildTaskColumns()` from per-column `const`s — the six task grids
are the same nine cells in different combinations.

## Alternatives considered

- **AG Grid.** Rejected: an Enterprise licence for grouping and export, and its own DOM and CSS
  layer to fight against Tailwind.
- **MUI DataGrid.** Rejected: pulls in a second design system for one component.
- **Hand-rolled `<table>` with our own sort/filter/paginate.** Tempting, and would have been fine
  for a while. Rejected because pagination plus filtering plus sorting interacting correctly is
  more subtle than it looks, and it is the part with no product value.

## Consequences

**Good.** The grids match the wireframes exactly. Every cell is a normal component, so the
customer chip in a table and the one in a modal are literally the same code.

**The cost — two traps, both of which cost us real time.**

1. **Assembling columns inline collapses type inference.** Building the array as one literal with
   conditional spreads makes TanStack's tuple inference give up, and every `cell` callback
   silently receives `any`. Typecheck accepts it; only `@typescript-eslint/no-unsafe-assignment`
   catches it. **Every column must be its own `const`** (or built inside a factory function that
   declares them separately). This is noted at the top of `taskColumns.tsx` and repeated in the
   three places that build their own columns.
2. **v9 has no global feature set.** `table.state.sorting` does not exist unless
   `rowSortingFeature` is registered in `tableFeatures({...})`, and a fresh features object per
   render rebuilds every row model. It is registered once at module scope in
   `components/dataTableColumns.ts`.

A third, smaller cost: `DataTable` takes already-filtered rows plus a `totalCount`, because the
domain filters (search across four fields, status, cycle) are not column filters. `totalCount` no
longer feeds the count line — that reports a range over the filtered set, "Showing 1 to 15 of 51
tasks" — but it still separates the two empty states, so forgetting it shows a brand-new user "no
matches, widen your filter" instead of "nothing here yet".

A fourth arrived with row reordering: v9 has **no row-ordering feature** at all, so that interaction
is sourced separately — [ADR 0011](0011-row-reordering.md).
