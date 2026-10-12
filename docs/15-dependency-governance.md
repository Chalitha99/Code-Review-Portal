# Dependency governance

Every dependency is a permanent maintenance obligation: a security surface, a
migration one day, and a thing the next developer must learn. The bar is
therefore high, and each one has a stated job — and a stated non-job.

## Runtime dependencies

| Dependency                                         | Responsible for                                                                            | Must **not** be used for                                                                                                     |
| -------------------------------------------------- | ------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------- |
| **react**, **react-dom**                           | Rendering, component model                                                                 | —                                                                                                                            |
| **react-router-dom**                               | Routing, route-level code splitting, guards                                                | Data fetching (loaders are deliberately unused; TanStack Query owns server state)                                            |
| **@tanstack/react-query**                          | Server state: fetching, caching, invalidation, retries                                     | Client state                                                                                                                 |
| **zustand**                                        | Client state that crosses components and survives a reload                                 | Anything that came from the API                                                                                              |
| **react-hook-form**                                | Form state, submission, field registration                                                 | Validation rules — those are Zod's                                                                                           |
| **zod**                                            | Schemas: API contracts and form validation                                                 | Business logic beyond validation                                                                                             |
| **@hookform/resolvers**                            | Joining the two above                                                                      | —                                                                                                                            |
| **@tanstack/react-table**                          | Table state: sorting, pagination, column model                                             | Table markup — that is `Table` in the design system                                                                          |
| **@radix-ui/react-\***                             | Accessible unstyled primitives: focus trapping, keyboard, ARIA                             | Visual design                                                                                                                |
| **@atlaskit/pragmatic-drag-and-drop**, **-hitbox** | The drag _interaction_ for optional row reordering: drag lifecycle, closest-edge detection | Table state, row markup, animation — and it ships no keyboard path, which is ours ([ADR 0011](./adr/0011-row-reordering.md)) |
| **tailwindcss**                                    | Styling, tokens, responsive utilities                                                      | —                                                                                                                            |
| **class-variance-authority**                       | Component variants as typed data                                                           | Conditional logic beyond variants                                                                                            |
| **clsx**, **tailwind-merge**                       | Class composition, with later classes winning                                              | —                                                                                                                            |
| **lucide-react**                                   | Icons                                                                                      | Illustration                                                                                                                 |
| **recharts**                                       | Charts                                                                                     | Layout                                                                                                                       |
| **date-fns**                                       | Date formatting and arithmetic                                                             | —                                                                                                                            |
| **sonner**                                         | Transient toasts                                                                           | Errors that need action — those are inline                                                                                   |
| **@fontsource/inter**, **@fontsource/poppins**     | Self-hosted fonts (no third-party font request)                                            | —                                                                                                                            |

## Development dependencies

| Dependency                                                          | Responsible for                               |
| ------------------------------------------------------------------- | --------------------------------------------- |
| **vite**, **@vitejs/plugin-react**                                  | Dev server and build                          |
| **typescript**, **typescript-eslint**                               | Types and type-aware linting                  |
| **eslint** + plugins                                                | Correctness **and the architectural zones**   |
| **prettier** (+ tailwind plugin)                                    | Formatting, including class order             |
| **vitest**, **@vitest/coverage-v8**, **@vitest/browser-playwright** | Test runner, coverage, browser mode           |
| **@testing-library/\***                                             | User-centric component queries                |
| **jsdom**                                                           | DOM for the unit project                      |
| **msw**                                                             | The mock API, in browser, tests and e2e alike |
| **@playwright/test**, **@axe-core/playwright**                      | e2e and route-level accessibility             |
| **storybook** + addons                                              | Component workshop, docs, the axe gate        |
| **husky**, **lint-staged**                                          | Pre-commit gates                              |

## Deliberate absences

| Not used                          | Why                                                                               |
| --------------------------------- | --------------------------------------------------------------------------------- |
| axios                             | `fetch` plus a thin client is enough, and one less thing to keep current          |
| redux, mobx                       | TanStack Query owns server state; Zustand covers the small remainder              |
| moment                            | date-fns is smaller and immutable                                                 |
| lodash                            | The three functions we would use are ten lines each                               |
| styled-components / emotion       | Tailwind is the styling decision; two systems is worse than either                |
| A component library (MUI, Chakra) | Radix plus our own tokens matches the Figma system without fighting a theme layer |

## Adding one

Answer these in the pull request:

1. **What problem does it solve, and can we solve it in under 50 lines?**
2. **Is it maintained?** Recent releases, resolved issues, more than one
   maintainer.
3. **What does it cost?** Bundle size, transitive dependencies, peer constraints.
4. **Does it overlap something we have?** Two libraries for one job is the
   failure mode this table exists to prevent.
5. **What is its non-job?** Add the row to the table above.

Then pin a caret range, run `npm audit`, and record the reasoning — an ADR if the
choice is architectural.

## Removing one

A dependency with no importers is deleted, not left "in case". The check is a
repo-wide search for its specifier; five dependencies were removed this way
during development, and the rest were each put to real use rather than kept
speculatively.

## Versions worth knowing

- **TanStack Table is on v9**, whose API is `useTable` plus an explicitly
  registered feature set — `table.state.sorting` does not exist unless
  `rowSortingFeature` is in `tableFeatures({...})`, which is why that object is
  built once at module scope in `components/dataTableColumns.ts`. See
  [ADR 0004](./adr/0004-headless-tables.md).
  (This section previously said v8 and cited an ADR of that name, which has never
  existed; 0008 is the keyed-remount record.)
- **v9 has no row-ordering feature.** `columnOrderingFeature` orders columns.
  Row order is the caller's own state — see [ADR 0011](./adr/0011-row-reordering.md).
- **Zod 4** moved several APIs to the top level: `z.email()`, `z.iso.datetime()`.
- **TypeScript 6** deprecated `baseUrl`; `paths` targets are `./`-relative.
- **Tailwind 4** is CSS-first — `@theme`, `@utility`, `@source`. There is no
  `tailwind.config.js`, and adding one would split the token definition in two.
