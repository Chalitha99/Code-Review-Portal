# 0002 · TanStack Query for server state, Zustand for client state

**Status:** Accepted · **Date:** Phase 1, Sprint 0

## Context

Nearly everything on screen is server state: task lists, a checklist template, a review in
progress, the notification badge. Very little is genuinely client state.

Redux Toolkit was the obvious default and was proposed.

## Decision

Two stores, split by who owns the data.

**Server state → TanStack Query.** Anything the API is the source of truth for. Caching,
refetching, loading and error states, and invalidation all come from the library.

**Client state → Zustand.** Exactly three things need it: the session (`useSession`), the
notification panel, and the New Review Task wizard draft (`useTaskDraft`, persisted to
`sessionStorage` so a refresh mid-wizard does not lose work).

**Form state → `useState`, seeded once.** See [ADR-0008](0008-keyed-remount-not-effects.md).

## Alternatives considered

- **Redux Toolkit for everything.** Rejected. There is no cross-cutting client state to
  coordinate; RTK Query would have been the same decision under a different name, with more
  boilerplate and a larger bundle. (Recharts pulls RTK in transitively anyway, which is part of
  why the charts are code-split.)
- **Only TanStack Query, with `useState` for the rest.** Close, and it is what we do for forms.
  The wizard draft is the counter-example: it spans three routes and must survive a refresh.

## Consequences

**Good.** Cache invalidation is declared next to the mutation that requires it, so a screen cannot
forget to refresh. Loading and error states are real from day one because MSW answers over the
network with latency ([ADR-0003](0003-msw-as-the-api-seam.md)).

**The cost — and it has bitten twice.**

1. **Query keys are a shared namespace.** They live in `hooks/useTasks.ts`, `hooks/useReviews.ts`
   and the feature `api/` modules, and a mutation that invalidates the wrong key produces a screen
   that silently disagrees with another. Admin mutations therefore invalidate the _reference data_
   caches too — those carry a five-minute `staleTime`, and without it an admin renames a checklist
   question and still sees the old wording in the wizard for the rest of the session.
2. **TanStack Query rejects `undefined` as query data.** Several endpoints answer `204` for "this
   exists but has nothing yet". `schema.nullish()` parses that to `undefined`, the query lands in
   an error state, and the screen renders its _empty_ branch — which looks exactly like success.
   `absentAsNull()` in `lib/apiClient.ts` exists for this, and every 204-capable read must use it.
