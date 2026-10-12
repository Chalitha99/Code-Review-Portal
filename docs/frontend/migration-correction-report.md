# Migration correction report

What was audited, what was actually wrong, and what changed. Companion to
[`migration-report.md`](./migration-report.md), which describes the original
migration, and [`migration-verification-baseline.md`](./migration-verification-baseline.md),
which records the measured starting state.

## What the audit expected to find, and did not

The brief anticipated dropped code, stubbed components and an unwired `AppBar`.
A file-level comparison against
`Service-Delivery-Portal/CodeReviewPortal/Frontend` shows otherwise, and it is
worth recording so the effort is not repeated:

- **No application code was lost.** All 91 feature files, 34 component files, 42
  test files and 9 e2e specs are present. Stripping import statements and
  normalising whitespace and quotes leaves **zero** logic differences.
- Every destination file was _larger_ than its source counterpart for one
  reason: no `.prettierrc` existed here, so the whole tree had been reformatted
  at Prettier's defaults. That is all the size difference was.
- **`AppHeader` is a complete, faithful port** and always was live —
  `RootLayout` renders it on every authenticated route. The two `AppBar.tsx`
  files were 7-line placeholders; one had zero importers, the other was
  reachable only from an unrouted page.
- All 60 MSW handlers, all 8 content JSON files and every design token are
  present and byte-identical modulo formatting.

## What was actually wrong

### 1. The layer direction was inverted

`src/app`, `src/main.tsx` and `src/test` imported _out of_ the Code Review
portal for session, auth, home, notifications and generic UI. Delivery or Wiki
would have had to import Code Review in order to sign a user in.

The source project had `auth`, `home` and `notifications` as **top-level**
features. The migration pushed all seven features into the portal, including the
three that are not code-review's.

### 2. The governance layer was not migrated

`eslint.config.js` was 727 bytes against the source's 14,785 — the stock Vite
scaffold. No type-aware linting, no architectural boundaries, no domain-purity
rule, no `jsx-a11y`, no `dangerouslySetInnerHTML` ban, no Tailwind-v4 rule.
Eight tsconfig strictness flags were missing, `npm test` did not pass
`--coverage` so the domain thresholds were inert, and `vite.config.ts` had lost
`manualChunks`, `strictPort` and the Windows `cacheDir` fix.

### 3. Unfinished scaffolding had shipped

14 zero-byte files, ~13 orphaned modules, a dead second entry point importing a
stylesheet that does not exist, a missing Storybook `preview.tsx` (so every
story rendered **unstyled**), and two stylesheets fighting over the same
selectors.

## What changed

| Phase | Commit    | Change                                                         |
| ----- | --------- | -------------------------------------------------------------- |
| 0     | `00f3bd6` | Capped Vitest workers at 3 and restored the 40s timeout        |
| 0     | `c734486` | Recorded the measured baseline                                 |
| 1     | `0a7a0b5` | Removed 24 unreferenced files; mounted `/delivery` and `/wiki` |
| 2     | `df27823` | Fixed the stylesheet layer; restored the Storybook preview     |
| 3     | `f7f783d` | Added the Prettier config and reformatted                      |
| 4     | `192a59f` | Corrected the layer direction                                  |
| 6a    | `9827ad9` | Restored the build and test gates                              |
| 6b    | `59485c9` | Restored the lint policy and tsconfig strictness               |
| —     | `ae02f63` | Fixed a serious accessibility defect in the checklist summary  |
| —     | `1aa2b81` | Made the two pick tests wait for row content                   |

### Structure after correction

```
src/
  app/                     shell — may not import a portal
  routes/                  the router tree
  components/ui/           tier 1
  components/common/       tier 2 — 27 files moved up out of the portal
  features/                auth, home, notifications — app-wide
  hooks/                   useSession, useCurrentUser, useMediaQuery, useReveal
  portals/code-review/
    components/            13 files — Task/Review/Rank-coupled
    hooks/                 useTasks, useReviews, useUsers, useReferenceData, useKpiBucket
    features/              admin, reports, reviews, tasks
  portals/delivery/, portals/wiki/
```

Components were split on measured coupling, not on where the previous migration
left them. See [ADR 0012](../adr/0012-component-tiers-and-the-portal-layer.md).

### Files resolved individually, with reasons

| File                                                                                                              | Decision                                                                                                                               |
| ----------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| `components/common/AppBar.tsx`, `components/ui/AppBar/AppBar.tsx`                                                 | Deleted — 7-line placeholders; `app/AppHeader.tsx` is the real header                                                                  |
| `pages/CodeReviewHomePage.tsx`                                                                                    | Deleted — unrouted; its docstring claiming it was mounted at `/crp` was false                                                          |
| `app/main.tsx`                                                                                                    | Deleted — dead second entry importing `@/styles/global.css`, which does not exist here                                                 |
| `app/workspaces/*.ts`                                                                                             | Deleted — fed `lazyRoutes.ts`, which was never migrated                                                                                |
| `styles/utilities.css`                                                                                            | Deleted — six gradient utilities against undefined custom properties                                                                   |
| `components/ui/lib/variants.ts`                                                                                   | Deleted — **all 17** tokens it referenced are undefined; zero call sites                                                               |
| `constants/navigation.ts`                                                                                         | Deleted — its only reader was `variants.ts`; duplicated live `HomePage` behaviour                                                      |
| `styles/Pages.css`                                                                                                | Deleted — two unreferenced `@keyframes`                                                                                                |
| `styles/base.css`                                                                                                 | Replaced by `portal.css`, which was the file doing the work                                                                            |
| `packages/contracts/src/primitives.ts`                                                                            | Deleted — unexported duplicate of `common.ts`                                                                                          |
| `constants/portals.ts`, `constants/roles.ts`                                                                      | **Kept** — correct and self-contained; `portals.ts` is now accurate because `/delivery` and `/wiki` resolve                            |
| `routes/routeHandle.ts`, `lib/logger.ts`, `config/env.ts`, `content/index.ts`, `types/index.ts`, `packages/types` | **Kept**, unwired. Each is coherent intent; wiring any of them changes behaviour and belongs in the replan, not a migration correction |

> `app/AppHeader.tsx`, named above as "the real header", was subsequently
> renamed to `app/AppBar.tsx` — see git history after this report's commit. The
> component and its placement are unchanged; only the name is.

## Defects found that were pre-existing, not migration damage

Both are worth raising against the source project.

**A serious accessibility violation in `ChecklistSummary`.** A `<div>` sat
between `ChecklistSection`'s `<ul>` and its `<li>` children, which axe reports as
two _serious_ violations per section. Both applications were checked live and
both rendered the identical 4 offending lists. The destination fails the axe test
only because it is **faster**: it reaches the checklist data ~270ms sooner, so
axe runs after the sections have rendered, where the source's slower render
leaves them absent at assertion time. Fixed here; the rendering is
pixel-identical (4 offending lists before, 0 after).

**A latent defect in two e2e pick tests.** Both read the first table cell
immediately after the table appears, but `DataTable` renders skeleton rows
_inside_ the real `<table>`. Measured over five navigations: the source has a
75ms gap between shell and data, the destination 349ms. Both failures were also
misleading — one captured `''` so `getByText('')` matched 228 nodes. Fixed by
waiting for content rather than row count.

**The source fails its own lint** on `checklist.tsx`
(`prefer-nullish-coalescing`). Corrected here.

## Verification

| Gate              | Baseline                                    | Now                                                   |
| ----------------- | ------------------------------------------- | ----------------------------------------------------- |
| `format:check`    | pass (against Prettier defaults, no config) | pass, against a real config                           |
| `typecheck`       | pass                                        | pass, with 8 more strictness flags                    |
| `lint`            | pass (scaffold config, ~no rules)           | pass, with the full policy and verified boundaries    |
| `test`            | 1 random failure per run                    | **506/506**, and coverage thresholds now actually run |
| `build`           | pass, 508 kB entry chunk                    | pass, **236 kB** entry chunk, warning gone            |
| `build-storybook` | pass, but stories rendered unstyled         | pass, 112 kB stylesheet shipped                       |

The coverage thresholds were probed rather than trusted: raising the bar to 100%
failed and named specific files, proving the globs match. The boundary rules
were probed the same way.

### End-to-end

This suite does **not** pass cleanly in either repository on this machine, and
that was true before any change here: the source failed 27, the destination 25,
with **22 failures common to both**.

Run with `--retries=2`, which separates a genuine failure from a parallel-load
flake:

|                         | Baseline     | Now    |
| ----------------------- | ------------ | ------ |
| Genuinely failed        | 25           | **21** |
| Flaky (passed on retry) | not measured | 4      |
| Passed                  | 187          | 187    |

**Every one of the 21 remaining hard failures is one the source project also
fails**: the four `developer.spec.ts` overflow checks, thirteen
`responsive.spec.ts` "fits Npx without horizontal scroll" assertions, two
equal-height card checks, the donut tooltip, and the developer wizard.

They are out of scope for this correction, and the evidence is specific rather
than assumed. Taking the representative case: at 1440px the decorative glow in
`DeveloperLayout` reports `right 1480px > 1440px`. Its markup, its parent
`<div className="relative">`, `PageContainer`, `RootLayout`'s `<main>` and every
stylesheet are byte-equivalent between the two repositories, and neither sets
`overflow-x` anywhere. Raise them against the source project.

The three destination-only failures identified in the baseline are fixed: both
pick tests and the review-form axe check.

Note the run-to-run variance without retries — 23, 25 and 26 failures across
three runs, with different names each time. Every newly-named failure that was
checked passed in isolation. Use `--retries=2` when judging this suite.

## Carried forward, not done here

- Invert `app/useSessionReset.ts`: portals should register a reset callback
  rather than the shell naming two portal stores. It is the one remaining
  documented boundary exception.
- The 22 shared e2e failures, which belong to the source project.
- `packages/types` has no importer. Delete it or use it.
- `primitives.ts` validated more strictly than `common.ts`
  (`z.iso.datetime({offset:true})` vs `z.string().min(1)`). Adopting the
  stricter contract changes runtime validation and needs a decision.
- Migrated user records still carry Pascal-case role labels, as the original
  migration report noted.
