# Migration verification baseline

Measured state of `FE_Repo_SDP` **before** any correction work, so that every
later claim of "no regression" is measured against a number rather than an
assumption. Recorded because `node_modules` was absent on this checkout: no gate
in this repository had actually been executed here, and
`docs/frontend/migration-report.md` reports results that were never reproduced
locally.

- Date: 2026-09-05
- Machine: Windows 11 Pro 10.0.26200, Node v24.16.0, npm 11.13.0
- Baseline commit: `090b472` (tree exactly as received)
- Comparison source: `Service-Delivery-Portal/CodeReviewPortal/Frontend`,
  running from its own pre-existing `node_modules`

## Static gates

| Gate            | Command                        | Result         |
| --------------- | ------------------------------ | -------------- |
| Typecheck       | `npm run typecheck` (`tsc -b`) | **pass**       |
| Lint            | `npm run lint`                 | **pass**       |
| Format          | `npm run format:check`         | **pass**       |
| Build           | `npm run build`                | **pass**, 7.0s |
| Storybook build | `npm run build-storybook`      | **pass**, 4.2s |

Two notes on these.

`tsc -b` was expected to fail: `tsconfig.app.json` includes `.storybook` while
`.storybook/main.ts` uses `node:path`, `node:url` and `import.meta.resolve`,
and unlike the source `tsconfig.node.json` does not list `.storybook`. It
passes anyway, so that predicted defect is **not** present and needs no fix.

`npm run build` emits a `500 kB` chunk warning: `index-*.js` is 507.94 kB and
`chartPalette-*.js` is 326.49 kB. The source config splits these with
`manualChunks`; that setting was not migrated.

## Unit and integration tests

`npm run test` (`vitest run --project unit`) — note this does **not** pass
`--coverage`, so the configured `**/domain/**` thresholds are inert on the
default test command.

| Run             | Result                                                   |
| --------------- | -------------------------------------------------------- |
| 1 (as received) | **1 failed**, 505 passed — `developerAnalytics.test.tsx` |
| 2 (as received) | **1 failed**, 505 passed — `adminWorkspace.test.tsx`     |
| in isolation    | both files pass, 6/6 and full-file respectively          |

A different file failed each run and both passed alone: the CPU-contention
signature the source project documents at length in its `vitest.config.ts`, and
the reason it caps `maxWorkers` at 3. That cap, and the 40s `testTimeout` that
keeps a multiple over Testing Library's 10s `asyncUtilTimeout`, had not been
carried over.

**Fixed before proceeding** (commit `00f3bd6`) rather than deferred, because a
suite that fails one random test per run cannot distinguish a real regression
from noise in any later phase.

| Run after fix | Result                   |
| ------------- | ------------------------ |
| A             | 43 files, **506 passed** |
| B             | 43 files, **506 passed** |
| C             | 43 files, **506 passed** |

## End-to-end tests

Playwright, Chromium, dev server. The important finding is that **this suite
does not pass cleanly in either repository on this machine**, so the raw
destination number is not evidence of migration damage.

| Repository                         | Result                            |
| ---------------------------------- | --------------------------------- |
| `Service-Delivery-Portal` (source) | **27 failed**, 185 passed (10.5m) |
| `FE_Repo_SDP` (destination)        | **25 failed**, 187 passed (9.2m)  |

Comparing the two failure sets by test name:

- **22 failures occur in both.** Predominantly `responsive.spec.ts` overflow and
  equal-height assertions, the four `developer.spec.ts` overflow checks, and the
  donut-tooltip test. These are pre-existing and environmental, not migration
  regressions.
- **5 failures occur only in the source**, i.e. the destination passes them:
  acceptance scenarios 1 and 8, and three `cards in a row share a height` cases.
- **3 failures occur only in the destination** — analysed below.

One representative shared failure, to characterise the class: at 1440px the
decorative glow in `DeveloperLayout` reports `right 1480px > 1440px`. The markup
(`pointer-events-none absolute -top-10 -right-10 size-96 rounded-full`), its
parent `<div className="relative">`, `PageContainer`, `RootLayout`'s `<main>`
and every stylesheet are byte-equivalent between the two repositories, and
neither sets `overflow-x` anywhere. The condition is identical in both; the
source fails it too.

### The three destination-only failures

- `acceptance.spec.ts` — 3 · picking moves a task from Available into My Review Tasks
- `reviewer.spec.ts` — picking a task moves it out of Available and into My Review Tasks
- `reviewer.spec.ts` — the review form has no critical or serious violations

All three share one root cause. Each reads the Available-tasks table
**immediately** after `page.getByRole("table").waitFor()`. `DataTable` renders
its skeleton rows _inside_ a real `<table>` (deliberately — see the comment at
`DataTable.tsx:566`), so `waitFor()` resolves during loading in both
repositories. Whether the read lands on data or on a skeleton is a question of
margin.

Measured over five navigations each, on identical hardware:

|                             | table shell | first data | gap       | value the test reads |
| --------------------------- | ----------- | ---------- | --------- | -------------------- |
| Source `/reviewer`          | ~1300ms     | ~1370ms    | **75ms**  | `SEMCO-005`          |
| Destination `/crp/reviewer` | ~750ms      | ~1100ms    | **349ms** | `""`                 |

The destination reaches usable data **faster** (~1100ms vs ~1370ms). It renders
the table shell ~350ms sooner and therefore displays its legitimate loading
state for longer. The source passes only because its shell and data happen to
arrive 75ms apart.

Confirming this is structural rather than random: with both apps fully settled,
the DOM is identical — row 1's first cell is `SEMCO-005` in each, same tags,
same nesting. And the destination failure is deterministic, 3 runs out of 3,
not intermittent.

So this is a latent defect in the **tests**, present in both repositories, which
only the destination's timing exposes. The axe failure follows from the same
cause: `pickFirstTask` acts on a not-yet-populated table and lands on a task
whose checklist renders sections, exposing a `ul > div > li` structure that is
present in both repositories' `ChecklistSummary`/`checklist.tsx` but that the
source's run never reaches.

**Deferred to Phase 7 rather than fixed now**, because the Phase 6 restoration
of `manualChunks` changes these timings and the tests should be corrected once,
against final numbers. The fix is to wait for a populated cell before reading,
not to weaken the assertion.

## Carried into the correction work

1. `manualChunks`, `strictPort` and the out-of-tree `cacheDir` are missing from
   `vite.config.ts` (Phase 6).
2. `npm test` does not pass `--coverage`, so the domain thresholds never run;
   `perFile` and the explicit `src/lib/*` threshold list are also absent
   (Phase 6).
3. The three e2e tests above need a populated-row wait (Phase 7).
4. The 22 shared e2e failures are pre-existing. They are **not** in scope for
   this migration correction and should be raised separately against the source
   project.

## Reproducing

```sh
cd FE_Repo_SDP
npm install
npm run typecheck && npm run lint && npm run format:check
npm run test
npm run build && npm run build-storybook
npx playwright install chromium && npm run test:e2e
```
