# Coding standards

Prettier settings and most of these rules are enforced by tooling. This document
covers what tooling cannot check.

## Naming

| Thing                  | Convention                                 | Example                      |
| ---------------------- | ------------------------------------------ | ---------------------------- |
| Component file         | PascalCase, matching the export            | `TaskTable.tsx`              |
| Hook file              | camelCase, `use` prefix                    | `useTaskFilters.ts`          |
| Domain/util file       | camelCase                                  | `stepperRules.ts`            |
| Constants file         | camelCase                                  | `routePaths.ts`              |
| Test file              | `<subject>.test.ts(x)`, beside the subject | `stepperRules.test.ts`       |
| Story file             | `<subject>.stories.tsx`                    | `DataTable.stories.tsx`      |
| Type / interface       | PascalCase, no `I` prefix                  | `TaskSummary`                |
| Boolean                | `is` / `has` / `can` / `should`            | `canAdvance`, `isSubmitting` |
| Event handler prop     | `on` + event                               | `onRowClick`                 |
| Handler implementation | `handle` + event                           | `handleRowClick`             |

Names say what a thing is for, not what it is made of. `taskDetailsBlockers`
rather than `getValidationArray`.

## File layout

One component per file. Order within a file:

1. Imports — external, then `@sdp/*`, then `@/…`, then relative
2. Types and interfaces
3. Constants
4. The component or function
5. Sub-components used only here

Exceed roughly 200 lines and the file is doing more than one job. Split by
responsibility, not by line count.

## Exports

Named exports everywhere, with two exceptions the frameworks require: Storybook
`meta` and the Vite entry. Named exports mean a rename is caught by the compiler
in every importing file.

## Comments

Comments explain **why**. The code already says what.

```ts
// Bad — restates the code
// Loop over the tasks and filter by status
```

```ts
// Good — explains a decision the reader cannot infer
// Self-review is excluded here rather than in the UI because the API is the
// authority; the filter is a courtesy so reviewers never see an unpickable row.
```

Anything surprising, any workaround, and any deliberate deviation from the
obvious approach gets a comment. Every `eslint-disable` needs a justification on
the line above.

JSDoc on exported components and on every `domain/` function.

## TypeScript

`strict`, `noUncheckedIndexedAccess`, `verbatimModuleSyntax` and
`erasableSyntaxOnly` are all on.

- **`any` is a lint error.** Use `unknown` and narrow.
- **Infer from Zod, never hand-write a payload type.** `type Task = z.infer<typeof taskSchema>`
  cannot drift from the validator.
- **`erasableSyntaxOnly` bans `enum`, `namespace` and constructor parameter
  properties.** Use `as const` objects for enum-like values and assign fields
  explicitly in constructors.
- **`noUncheckedIndexedAccess` means `arr[0]` is `T | undefined`.** Handle it;
  don't reach for `!` outside tests.
- **Type imports are explicit:** `import type { Task } from …`. Enforced.

### Discriminated unions over boolean flags

```ts
// Bad
{ isLoading: boolean; isError: boolean; data?: Task[] }

// Good
| { status: "loading" }
| { status: "error"; error: ApiError }
| { status: "success"; data: Task[] }
```

The second makes the impossible state unrepresentable.

## React

- Function components only.
- Props typed with an exported interface when the component is shared.
- Derive during render; do not mirror props into state.
- `useEffect` is for synchronising with something outside React. Fetching is
  TanStack Query's job; derived values are just expressions.
- Extract a hook when logic is reused **or** when a component's body has more
  logic than markup.
- `useCallback` / `useMemo` only when a measurement or a dependency array
  demands it.
- Keys are stable ids, never the array index.

### Two rules learned the hard way

**`Slot` with multiple children needs `Slottable`.** Radix's `Slot` merges props
onto a single child; a component that renders an icon _and_ `children` crashes
under `asChild` unless `children` is wrapped in `<Slottable>`.

**React Hook Form: `useWatch`, not `form.watch()`.** `watch()` subscribes
outside React's rendering model and trips
`react-hooks/incompatible-library`. `useWatch({ control })` is the supported
subscription, and `Controller` is how controlled components (Select, Checkbox,
RadioGroup) are bound.

## Imports

Absolute across a boundary, relative within a folder.

```ts
import { Button } from '@/components/ui'; // crossing a boundary
import { TaskRow } from './TaskRow'; // same feature
```

`../../../` is a lint error — three levels up means you have crossed a boundary
and should be using an alias. The architectural zones in `eslint.config.js`
restrict which boundaries you may cross at all; see
[Architecture](./02-architecture.md#layer-direction).

## Styling

Tailwind utilities in JSX. Variants through CVA, merged with `cn()`. No inline
`style` except for genuinely dynamic values (a computed bar width). No arbitrary
colour values — every colour is a token. See [Design system](./07-design-system.md).

## Error handling

Errors are values with a shape, not strings. The API client normalises every
failure into `ApiError`; components read `error.message` for the user and log
`error` for the developer. Never swallow an error into an empty `catch`.

## Async

`async`/`await`, never raw `.then()` chains. Mutations return promises so the
caller can await them and so the tests can.
