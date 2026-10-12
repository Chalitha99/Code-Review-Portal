# ADR 0012 — Component tiers, and why the portal owns a layer

- **Status:** Accepted
- **Date:** 2026-09-05
- **Supersedes:** the "two tiers" description in `06-component-architecture.md`

## Context

The Service Delivery Portal hosts three sub-applications: Code Review (phase 1),
Delivery (phase 2) and the Wiki (phase 3). Only the first exists.

The frontend documentation described **two** shared component tiers,
`components/ui` and `components/common`, and gave `portals/<portal>/` only
`domain/` and `features/`. The migration of the completed Code Review frontend
did something else: it put every non-`ui` component from the source project into
`portals/code-review/components/`, and every shared hook into
`portals/code-review/hooks/`.

Neither was right on its own, and the gap mattered in a concrete way. The app
shell — `RootLayout`, `ErrorBoundary`, `NotFoundPage`, `RouteError`,
`RequireWorkspace`, `AppHeader` — was importing `states.tsx`, `Skeleton.tsx` and
`PageContainer.tsx` _out of the Code Review portal_, along with session, auth,
home and notifications. Delivery could not have been built without importing
Code Review in order to sign a user in.

## Alternatives considered

**Follow the two-tier documentation literally.** Dissolve
`portals/*/components/` and push every domain-carrying component down into the
one feature that uses it. This is coherent, and it is what the docs said. It was
rejected because several of those components have three or four consumers across
`tasks`, `reviews` and `admin` — `badges`, `cells`, `taskColumns` and
`taskFilters` in particular. Pushing them into a feature would mean either
duplicating them or having features import each other, and "a feature may never
import another feature" is a rule worth more than folder-count purity.

**Keep the migration's placement and amend the docs.** Cheapest, and it was
tempting because the tree already built and passed its tests. Rejected because
it leaves genuinely app-wide UI owned by one portal. `Skeleton` does not know
what a task is; having Delivery import it from `portals/code-review` would make
the second portal depend on the first for a loading placeholder.

## Decision

Three shared tiers, and the tier is decided by **what a component imports**, not
by which folder it currently sits in.

| Tier | Location                          | May reach for                                                                       |
| ---- | --------------------------------- | ----------------------------------------------------------------------------------- |
| 1    | `src/components/ui`               | React, Radix, CVA — and, by documented exception, `content` and `lib/tabNavigation` |
| 2    | `src/components/common`           | tier 1, `content`, `config`, `constants`, `hooks`, `lib`                            |
| 3    | `src/portals/<portal>/components` | tiers 1–2, plus that portal's own domain vocabulary and hooks                       |

A component that mentions `@sdp/contracts` domain types or a portal concept is
tier 3. `DataTable` renders whatever columns it is handed, so it is tier 2;
`taskColumns` names Task, Review and Rank, so it is not.

Auth, home and notifications are **application-wide features** at
`src/features/`, not portal features. `/login` is mounted outside `/crp`,
`HomePage` chooses between portals, and `NotificationBell` is rendered by the
shell. This is also where the source project had them before the migration moved
them.

## Consequences

`eslint-plugin-boundaries` enforces the graph, and the rules were verified with
deliberate probes rather than assumed — a missing resolver silently classifies
nothing and passes everything, which is the failure mode this plugin is known
for. Probes confirmed `common -> portal-shared` and `lib -> feature` both fail.

`src/app` may not import `@/portals/*`. One exception remains:
`app/useSessionReset.ts` clears two portal-owned Zustand stores on sign-out. It
carries an inline disable so the exception is greppable. Inverting it properly —
portals register a reset callback the shell invokes — is recorded in the replan.

The cost is a third tier to reason about, and a judgement call each time a
component is added. The `EmptyIllustration` / `EmptyState` pair sits close to the
line: both are tier 2 today because neither names the domain, and if either
starts to, it moves.

> `AppHeader`, named in Context above as it stood when this decision was
> written, was subsequently renamed to `AppBar`. Its placement in `app/` and the
> reasoning above are unaffected.
