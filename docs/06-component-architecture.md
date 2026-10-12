# Component architecture

## Three tiers

Every shared component sits in exactly one of three places, and the difference
is enforced by `eslint-plugin-boundaries` rather than by review.

|                      | `src/components/ui/`       | `src/components/common/`                 | `src/portals/<portal>/components/`            |
| -------------------- | -------------------------- | ---------------------------------------- | --------------------------------------------- |
| Knows about          | React, Radix, CVA          | App content, config, hooks, lib          | ...and that portal's domain vocabulary        |
| May import a portal  | No                         | **No**                                   | Its own portal only                           |
| May import a feature | No                         | No                                       | No                                            |
| Data                 | Props only                 | Props, or a shared hook                  | Props, or that portal's hooks                 |
| Examples             | `Button`, `Card`, `Dialog` | `DataTable`, `Skeleton`, `PageContainer` | `badges`, `taskColumns`, `ReviewCycleHistory` |

The decision is made by the **import list, not by the folder a file happens to
be in**. If a component reaches for `@sdp/contracts` domain types or a portal
concept, it is portal-level. If the most it reaches for is `content`, `config`,
`hooks` and `lib`, it is `common/`. If it needs nothing but React, it is `ui/`.

That test is what moved twenty-odd components out of the portal during the
migration correction: `DataTable` renders whatever columns it is given, so it is
tier 2; `taskColumns` names Task, Review and Rank, so it is not.

A design system that cannot import the app is portal-agnostic **by
construction** — which is what lets Delivery and Wiki adopt it unchanged rather
than forking it.

Feature-specific components (`WizardChecklistStep`, `AssignReviewerDialog`) are
none of the three; they live in their feature's `components/` folder. Promote
one only when a second consumer actually exists.

### The one documented exception

Tier 1 is meant to import nothing from `@/`. Four files do:
`controls.tsx`, `Dialog.tsx` and `Select.tsx` read `@/content/common.json`, and
`Tabs.tsx` reads `@/lib/tabNavigation.ts`. This is inherited from the source
project rather than introduced here, and the boundaries policy allows `ui ->
content` and `ui -> lib` explicitly rather than pretending otherwise. Adding a
fifth needs a better reason than the first four had.

## The design system

`src/components/ui/` as it actually stands. This is a working set, not the
target inventory — several rows in an earlier draft of this document described
components that were never built.

| File                                    | Contents                                                  |
| --------------------------------------- | --------------------------------------------------------- |
| `Button.tsx`, `buttonVariants.ts`       | `Button`, its CVA config exported for reuse               |
| `Card.tsx`                              | `Card`, `CardHeader`, `CardBody`, `CardFooter`, `Divider` |
| `Dialog.tsx`                            | Radix dialog, styled, with focus handling                 |
| `Field.tsx`, `fieldContext.ts`          | Label, description, error wiring for a form control       |
| `controls.tsx`                          | `SearchField`, `IconButton` and the smaller inputs        |
| `Select.tsx`                            | Radix select, styled                                      |
| `Tabs.tsx`                              | Radix tabs, plus tab scroll restoration                   |
| `SegmentedOptions.tsx`                  | Radio buttons rendered as a button group                  |
| `Alert.tsx`                             | Tone-carrying inline alert                                |
| `brand/SebsaLogo.tsx`, `sebsaLogoPaths` | The mark, traced as path data so it can be recoloured     |
| `lib/cn.ts`                             | `clsx` + `tailwind-merge`                                 |
| `hoverLift.ts`                          | The shared lift/press interaction classes                 |

`src/components/common/` holds the app-aware tier: `DataTable` and
`dataTableColumns`, `states` (empty and error), `Skeleton`, `PageContainer`,
`PageHeader`, `Avatar`, `KpiCard`, `Stepper`, `Reveal`, `TablePageSize`,
`ChoiceDialog`, `ConfirmDialog`, `ImageDropzone`, `ImageGallery`,
`EmptyIllustration`, `WorkspaceOutlet`, and the chart primitives under
`charts/`.

Note the barrel: `src/components/ui/index.ts` re-exports only `cn` and
`SebsaLogo`. Components are imported by path. A `ui` component must **not**
reach `cn` through the barrel — that is a cycle, and it was one until the
migration correction. Import `./lib/cn` directly.

### Anatomy of a component folder

```
Button/
  Button.tsx          the component
  variants.ts         CVA config, exported for reuse
  Button.test.tsx     behaviour
  Button.stories.tsx  every variant, plus interaction play functions
```

Not all four exist for every component, but a shared component without a story
is incomplete — see [Storybook standards](./21-storybook-standards.md).

## Rules for a `ui` component

1. **Props in, events out.** No fetching, no navigation, no global state.
2. **Forward the ref** on anything that wraps a DOM element.
3. **Spread the rest.** `...props` onto the root so callers can pass `aria-*`,
   `data-*` and `id`.
4. **Accept `className`** and merge it with `cn()`, so a caller can adjust
   layout without a wrapper div.
5. **No copy.** Every string is a prop. `NotificationPanel` takes `title`,
   `unreadLabel` and an `emptyState` node — none of it is hardcoded, which is
   what makes it portal-agnostic.
6. **Accessible by default.** A component should not require the caller to
   remember an `aria-label` to be correct. Where a label genuinely varies, make
   it a required prop.
7. **Variants over booleans.** `variant="danger"`, not `isDanger`.

## Composition over configuration

`DataTable` composes the existing `Table` and `Pagination` rather than
reimplementing them. Both were already built and tested; wrapping them means the
table markup, the pagination behaviour and their accessibility tests have one
implementation.

The same rule applies upward: if a feature needs a table with filters, it
composes `DataTable` — it does not add a `filters` prop to it.

## Accessibility built in

- `Button` renders a real `<button>`, or the child element under `asChild`.
- `DataTable` headers carry `aria-sort`. **Rows stay rows** — no `role`, no
  `tabIndex` on a `<tr>`. Overriding a row's implicit role removes it from the
  table's structure, and a screen-reader user can then no longer navigate the
  grid as a table at all. `onRowClick` is a mouse convenience; the keyboard path
  is the row's own action control. `DataTable.test.tsx` guards both directions.

  > This bullet used to say the opposite — that clickable rows should carry
  > `role="button"`, `tabIndex={0}` and a `rowLabel`. That was tried, and it is
  > what removed the rows from the grid. Corrected rather than deleted, because
  > it is the plausible-sounding wrong answer and someone will reach for it
  > again.

- `Stepper` is an `<ol aria-label>`, **not** a `<nav>` — a progress indicator is
  not navigation, and a second `<nav>` breaks `landmark-unique`.
- `NotificationPanel` signals unread with a dot **and** a heavier title **and**
  visually hidden text, never colour alone.

Every story runs axe at `error` severity, so a regression fails the build.

## Adding a component

1. Does something similar exist? Extend it before adding.
2. Which tier? Read the import list. Nothing but React -> `ui/`. Content,
   config, hooks or lib -> `common/`. A portal's domain vocabulary ->
   `portals/<portal>/components/`. A single feature -> that feature.
3. Create the folder with the component, variants, test and story.
4. Import it by path. The `ui` barrel carries only `cn` and `SebsaLogo`.
5. Run `npm run test:storybook` — the axe gate is part of the definition of done.
