# 0011 · Row reordering: Pragmatic drag-and-drop, and a keyboard path we own

**Status:** Accepted · **Date:** Phase 1, after the checklist administration screens

## Context

The Quality Checklist question bank is ordered by a number the admin types into a dialog. Moving a
question three places means opening the form, typing `3`, and resolving the collision that follows
through a keep-both/replace prompt. The business asked for drag-and-drop.

Two facts shaped every decision:

- **`order` is scoped per category**, unique only by convention
  (`packages/types/src/checklist.ts`). A question dragged into another category has no meaning to
  write.
- **The grid is one flat list of all 29 questions, paged at 15.** So a category can straddle the page
  boundary, and any design that reorders by _visible index_ writes 1–15 over every page.

TanStack Table v9 has **no row-ordering feature** — `columnOrderingFeature` orders columns; there is
no `rowOrderingFeature` in the package. So the drag was ours to source either way.

## Decision

**1. `@atlaskit/pragmatic-drag-and-drop` + `-hitbox`, pinned, Apache-2.0.**

Against the five questions in [dependency governance](../../Reference%20Docs/15-dependency-governance.md):

|                        |                                                                                                                                                              |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Solvable in <50 lines? | The array move, yes. `dragenter`/`dragleave` bookkeeping across child elements, before/after edge geometry and drag autoscroll, no.                          |
| Maintained?            | Released days before adoption. `@dnd-kit`, the obvious alternative, had gone ~20 months without one, with a single maintainer and no release since React 19. |
| Cost?                  | ~4.7 kB core; `raf-schd`, `bind-event-listener`, `@babel/runtime`. **No React peer dependency** — the core is framework-agnostic.                            |
| Overlaps?              | No. It touches no table state; TanStack keeps sorting, filtering and pagination.                                                                             |
| Non-job?               | Drag _interaction_ only — never table state, never row markup, never animation.                                                                              |

It is built **on native HTML5 drag events**, which is what settled it against `@dnd-kit`: no JS
transform engine, so it does not collide with "No animation library"
([frontend-standards §8](../frontend-standards.md)), and the movement we do show is our own CSS under
the global `prefers-reduced-motion` block. `@dnd-kit` animates from JS and would have needed the
manual `useMediaQuery` gating [ADR-0009](0009-charting-library.md) already forced on Recharts.

**2. The interaction is generic; the meaning is not.** `DataTable` gains one optional `reorder` prop
and reports completed moves. It does not know what an order is, where it is stored or when it is
saved. `QuestionsPanel` owns the draft, the dirty state, the category rule and the API call.

**The prop now has three consumers**, which is the test of that split: the Categories and Task Types
tabs (`NamedRecordPanel`) were given the same treatment in a later pass, and `DataTable` needed **no
change at all** to serve them. They are flat lists, so they pass no `canDrop` — the optional refusal
callback exists for the grouped case and the ungrouped case simply omits it. What is shared between
the three is the pure arithmetic in `src/lib/checklistOrdering.ts`, constrained to
`{ id: string; order: number }` rather than to a question.

**3. Moves are reported as a POSITION, never an index.** `{ movedId, targetId, placement }`. An index
would be an index into the visible page, which is exactly how a paginated grid corrupts a global
sequence.

**4. Local reorder, one batch save.** Dragging mutates local state only. **Save Order** sends one
`PATCH` per touched collection, carrying `{ ids }` — ids in final order, not `{id, order}` pairs, so
duplicate and negative order values are unrepresentable rather than validated. The dirty flag clears
only after the server confirms.

```
PATCH /api/checklist-categories/:id/question-order   { ids }   # inside one category
PATCH /api/checklist-categories/order                { ids }   # the categories themselves
PATCH /api/task-types/order                          { ids }
```

One `reorderInputSchema` for all three rather than a `questionIds` / `categoryIds` / `taskTypeIds`
apiece: the URL already says which collection, so the body never has to, and three near-identical
schemas is duplication with a rename in it. Each handler refuses a payload that is not **exactly**
its whole set (422 `ORDER_INCOMPLETE`) — the guard that makes "a client sent only its current page"
impossible rather than merely unlikely.

> **Handler registration order is load-bearing.** `/checklist-categories/order` also matches the
> `/checklist-categories/:categoryId` pattern, and MSW resolves handlers **in array order** — so each
> `/order` handler must be declared _before_ its `:id` sibling, or a reorder is silently served as a
> rename of a record whose id is the literal string `order`. Both sites carry a comment saying so.
> The same trap waits for the Phase 2 backend's route table.

**5. Save renumbers densely, 1…n.** This settled a contradiction that existed at the time: the seed
numbered 10/20/30 while `nextQuestionOrder` appended with step 1, so appending to a 10/20 category
produced 21. **The seed has since been renumbered 1…n per category to match**, so the two agree at
rest and a reorder no longer changes the numbering scheme — only the sequence.

**6. The draft outlives the panel.** Radix unmounts an inactive tab panel, so a draft owned by the
panel died on every tab switch — a minute of dragging gone with no prompt and nothing to undo. It
lives in `features/admin/hooks/useChecklistAdminView.ts` instead: a Zustand store persisted to
`sessionStorage`, holding the three drafts, the Questions toolbar and the open tab, and cleared on
sign-out through `app/useSessionReset.ts` like the wizard draft beside it.

`forceMount` on `Tabs.Content` would have kept the panels alive — it exists, contrary to an earlier
note — but it mounts all three grids at once, putting every category and task-type name in the DOM
twice, and it cannot survive leaving the screen or a refresh. Persisting the _state_ is narrower and
covers more.

**The corollary is a draft that must know when to stop trusting itself.** Restored against a row set
that has changed — a category created and then reloaded, another admin's save landing first — the
panel drops it rather than showing the server's order under an "Unsaved order" banner. The guard has
to wait for the rows: `rows` is empty during the first fetch, and an unguarded check discards every
restored draft on mount, which looks like the feature doing nothing at all.

**7. A delete closes the gap it leaves.** `resequenceAfterRemoval` runs in all three delete handlers,
so a list never rests on `1,2,4,5`. Without it "sequential and deterministic" was true only until
somebody deleted a middle row, and the next append would land on a number the admin had just freed.

## Alternatives considered

- **`@dnd-kit`.** Best-known, and its `KeyboardSensor` and screen-reader announcements would have been
  free rather than written by us. Rejected on maintenance and on the JS animation engine, above.
- **`@hello-pangea/dnd`** (the maintained `react-beautiful-dnd` fork). Rejected: heavier, and its
  model wants to own list rendering, which fights `DataTable` owning every cell — the same objection
  [ADR-0004](0004-headless-tables.md) raised against AG Grid.
- **Hand-rolled on raw HTML5 events.** Zero dependencies and genuinely tempting. Rejected on the same
  test ADR-0004 applied to sort/filter/paginate: edge geometry and drag bookkeeping are the subtle
  part with no product value.
- **Gate dragging behind a single-category filter.** Would have made the scope self-evident. Rejected
  as a worse trade than refusing cross-category drops directly: it makes the admin filter before they
  can reorder, for a rule the drop can enforce on its own.

## Consequences

**Good.** One prop, one grid opts in, ten are untouched. The batch save means a drag session is one
write, and the arrangement survives a failed save so it can be retried — and now also a tab switch, a
trip to another screen and a refresh.

**The costs.**

1. **The keyboard path is ours.** No library ships keyboard reordering for a table; Pragmatic
   documents the pattern and leaves it to the consumer. ArrowUp/ArrowDown on the handle move a row one
   place — this is the **first hand-written keyboard interaction in a codebase that has delegated all
   of it to Radix**, and it is a real maintenance obligation.
2. **No touch support.** Native HTML5 drag has none. Acceptable for an admin-only desktop screen, and
   the arrow keys are the fallback, but it is a genuine limitation.
3. **The drag cannot be unit-tested, and is awkward to e2e-test.** jsdom has no `DataTransfer`, so the
   pointer path is Playwright-only. Worse, **Chromium enters a nested message loop during a native
   drag, so JS evaluation over CDP does not run** — every auto-retrying Playwright assertion hangs
   mid-drag. The one test that drives a real drag therefore uses a bare `waitForTimeout` between the
   last move and the drop, and must `scrollIntoViewIfNeeded()` both ends before measuring, because
   `boundingBox()` reports viewport coordinates without scrolling and an off-screen box makes the drag
   silently no-op. Both are written up at the test.
4. **Renumbering rewrites `order` values.** Any gap an admin leaves by typing orders by hand is
   closed the next time that category is saved. Harmless now the seed is already dense, but it means
   the manual Order field cannot be used to reserve space.
5. **Two ways to set an order now exist.** The manual field and the dialog's keep-both/replace prompt
   remain; both write the same field, so there is still one source of truth, but there are two paths
   to it.
