# ADR 0014 — Repository shape, and the seam the backend arrives through

- **Status:** Accepted
- **Date:** 2026-09-05

## Context

This repository holds a frontend at its root, plus two workspace packages. The
source project it was migrated from is laid out differently — a monorepo with
`packages/{config,types,ui}` and the app nested at
`CodeReviewPortal/Frontend`, with `CodeReviewPortal/Backend` reserved for a
NestJS service that was never written.

The destination documentation says nothing about a monorepo, a backend, or a
future `apps/` layout. The repository name, `FE_Repo_SDP`, suggests
frontend-only, and is expected to change.

The question came up during the migration correction: restructure now into
`apps/frontend` + `apps/backend`, or leave the shape alone.

## Alternatives considered

**Restructure to `apps/frontend` now, with `apps/backend` as a placeholder.**
Gets the eventual shape right once, while the tree is already being reorganised.
Rejected on timing rather than on merit: every config path
(`vite.config.ts`, `vitest.config.ts`, `playwright.config.ts`, both tsconfigs,
`.husky`, the Storybook config) and every doc path would move in the same change
as the layer correction. That is a large regression surface bolted onto a
migration whose whole purpose is to prove functional parity, and the benefit is
zero until backend code actually exists.

**Fold `packages/` into `src/`.** Simplifies the tree and removes the
`@sdp/contracts` alias. Rejected because those Zod schemas are the contract
between this frontend and the API — the one part of the repository a second
consumer would take as a unit, and the part the backend will validate against.

## Decision

Keep the flat layout. Do not create `apps/`.

Keep `packages/contracts` as the shared contract. Keep `packages/types` as its
type-only face, noting that nothing in `src` currently imports it — it is
retained for the zero-runtime consumer it was built for, and should be deleted
if that consumer never appears.

The seam the backend arrives through is already in place and should stay that
way:

- `src/lib/apiClient.ts` is the only place `fetch` is called, and it takes a Zod
  schema as a required argument rather than an option.
- MSW intercepts real requests to real relative URLs, so removing it is deleting
  a `worker.start()` call, not rewriting a data layer.
- `vite.config.ts` has a `server` block whose comment marks where the proxy to
  the NestJS service goes.
- Business rules live in `domain/` and in the six `lib/` modules listed in
  `vitest.config.ts`, all framework-free and lint-enforced, so they are portable
  to a backend guard rather than trapped in components.

## Consequences

When the backend lands, the move to `apps/` is a mechanical change to config
paths made on its own, reviewable in isolation, at a point when there is
something to put in `apps/backend`.

A repository rename does not affect anything here: no code or config hardcodes
`FE_Repo_SDP`. That was checked.

The near-term risk is that `packages/types` stays orphaned and someone deletes it
without noticing it is the documented zero-runtime path. It is called out here so
that deletion is a decision rather than a tidy-up.
