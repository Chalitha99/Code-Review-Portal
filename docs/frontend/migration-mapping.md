# Code Review Portal migration mapping

## Baselines

The immutable functional baseline is `CodeReviewPortal/Frontend`. Before migration its typecheck reported ten known errors: the `ChecklistSummary` prop mismatch and widened task-detail QA fixture roles. Its test suite had one Admin Reports assertion failure. The destination typecheck passed and its unit command failed because no test files existed.

## Destination classification

| Classification | Destination material                                                                                                                                                      | Treatment                                                        |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------- |
| Reusable       | Vite/TypeScript workspace, `src/components/ui`, Tailwind tokens, query client, error boundary, Storybook/Vitest/Playwright configuration, Delivery and Wiki portal shells | Retained and extended                                            |
| Extendable     | application shell, providers, route constants, authorization, contracts/types packages, MSW bootstrap                                                                     | Completed with migrated behavior                                 |
| Placeholder    | Code Review home and Developer/Reviewer/Admin placeholder pages and route modules                                                                                         | Replaced by feature routes without replacing the scaffold        |
| Obsolete       | duplicate source router/provider/client entry points and duplicate UI copies                                                                                              | Not migrated; destination composition root remains authoritative |

## Route inventory

All canonical paths are declared in `src/constants/routePaths.ts`; `src/config/routes.ts` is a compatibility facade used by migrated features.

| Source route                          | Destination route                         | Module                                         |
| ------------------------------------- | ----------------------------------------- | ---------------------------------------------- |
| `/login`                              | `/login`                                  | `features/auth/routes/LoginPage.tsx`           |
| `/`                                   | `/crp`                                    | `features/home/routes/HomePage.tsx`            |
| `/developer`                          | `/crp/developer`                          | Developer layout + My Tasks                    |
| `/developer/analytics`                | `/crp/developer/analytics`                | Developer Analytics                            |
| `/developer/tasks/new`                | `/crp/developer/tasks/new`                | clean-draft entry redirect                     |
| `/developer/tasks/new/:step`          | `/crp/developer/tasks/new/:step`          | task wizard (`details`, `checklist`, `review`) |
| `/developer/tasks/new/confirmed`      | `/crp/developer/tasks/new/confirmed`      | submission confirmation                        |
| `/developer/tasks/:taskId`            | `/crp/developer/tasks/:taskId`            | task detail and feedback response              |
| `/developer/tasks/:taskId/edit`       | `/crp/developer/tasks/:taskId/edit`       | edit-step redirect                             |
| `/developer/tasks/:taskId/edit/:step` | `/crp/developer/tasks/:taskId/edit/:step` | edit/resubmission wizard                       |
| `/reviewer`                           | `/crp/reviewer`                           | available queue                                |
| `/reviewer/my-tasks`                  | `/crp/reviewer/my-tasks`                  | assigned queue                                 |
| `/reviewer/history`                   | `/crp/reviewer/history`                   | review history                                 |
| `/reviewer/analytics`                 | `/crp/reviewer/analytics`                 | reviewer analytics                             |
| `/reviewer/tasks/:taskId`             | `/crp/reviewer/tasks/:taskId`             | review form/history/handover                   |
| `/admin`                              | `/crp/admin`                              | task administration                            |
| `/admin/users`                        | `/crp/admin/users`                        | user management                                |
| `/admin/customers`                    | `/crp/admin/customers`                    | customer management                            |
| `/admin/checklist`                    | `/crp/admin/checklist`                    | task types/categories/questions                |
| `/admin/handovers`                    | `/crp/admin/handovers`                    | handover management                            |
| `/admin/reports`                      | `/crp/admin/reports`                      | reports                                        |

The three legacy roots are wildcard redirects. They retain the full remaining path, task IDs, wizard steps, query string, and fragment. The redirect matrix is covered by `src/routes/LegacyWorkspaceRedirect.test.tsx`.

## Feature and shared-code inventory

Every source directory below was migrated as a unit. File names and internal boundaries remain traceable one-to-one.

| Source                                 | Destination                                          | Contents                                                                                                                                               |
| -------------------------------------- | ---------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `src/features/auth`                    | `src/portals/code-review/features/auth`              | login query/schema/page, session-expiry UI, user chip, tests                                                                                           |
| `src/features/home`                    | `src/portals/code-review/features/home`              | portal home, workspace cards, tests                                                                                                                    |
| `src/features/tasks`                   | `src/portals/code-review/features/tasks`             | API hooks, attachments, draft store, rules/metrics/response/checklist domains, dashboard, wizard, edit/detail/confirmation/analytics, tests            |
| `src/features/reviews`                 | `src/portals/code-review/features/reviews`           | queries, review form, handover, queues, history, analytics, ranking rules/metrics, tests                                                               |
| `src/features/admin`                   | `src/portals/code-review/features/admin`             | queries, checklist and handover APIs, dialogs/panels/filters, task/user/customer/checklist/handover pages, tests                                       |
| `src/features/reports`                 | `src/portals/code-review/features/reports`           | report queries, breakdown charts, metrics, Admin Reports page/tests                                                                                    |
| `src/features/notifications`           | `src/portals/code-review/features/notifications`     | query hooks and notification bell/link behavior                                                                                                        |
| source non-UI `src/components/*`       | `src/portals/code-review/components/*`               | avatar, badges/cells, checklist, tables/filters, charts, images, KPI, layout/state/reveal/stepper/review history and their stories/tests               |
| source `src/components/ui/*`           | `src/components/ui/*`                                | Alert, Button, Card, controls, Dialog, Field, Select, Tabs, variants and stories/tests                                                                 |
| `src/hooks/*`                          | `src/portals/code-review/hooks/*`                    | current user, KPI bucket, media query, reference data, reveal, reviews, session, tasks, users                                                          |
| `src/content/*`                        | `src/content/*`                                      | auth, home, task, review, admin, notification, common and accessibility copy catalogs                                                                  |
| `src/lib/*`                            | `src/lib/*`                                          | API client, permissions, status machine, checklist ordering/storage, attachments, formatting, session storage, query keys/client and analytics helpers |
| `src/services/mockApiService.ts`       | same destination path                                | mock service boundary                                                                                                                                  |
| `src/styles/global.css`                | `src/styles/portal.css` plus destination style entry | source tokens/layout/motion merged behind destination Tailwind entry                                                                                   |
| `src/test/*`                           | `src/test/*`                                         | MSW server, setup, provider renderer, axe helper and accessibility suite                                                                               |
| `e2e/*`, `public/mockServiceWorker.js` | same destination paths                               | real-browser acceptance, role, responsive, session, worker and accessibility suites                                                                    |

## API and data inventory

One `src/lib/apiClient.ts`, one query-key hierarchy, and one `src/mocks/db.ts` back all migrated hooks. MSW handlers cover:

- authentication: login, logout, current user;
- customers and users: list/create/update/delete;
- tasks: list, summary, detail, events, create/update/submit/pick/assign/cancel/delete;
- checklist: task types, template, task answers, general check, task-type/category/question create/update/order/delete;
- reviews: current and historical review reads, create/update, screenshot/finding mutations, responses and resubmission;
- attachments: list/create/update/delete;
- handovers: create/list/accept/reject/reassign;
- notifications: list, mark one read, mark all read;
- reports: derived from task/review/user/customer data through the shared query layer.

Runtime schemas are in `packages/contracts/src`: common/primitives, enums, identity/user, task, checklist, review, notification and handover. `@sdp/types` exposes a type-only facade. Source mock/session role labels remain Pascal-case at the compatibility boundary because they are observable seeded data; route/workspace identifiers are lowercase (`developer`, `reviewer`, `admin`).

## Tests and assets

All source `*.test.ts(x)`, `*.stories.tsx`, `src/test/*`, and `e2e/*` files were ported. The source had no separate image asset directory; the SEBSA logo remains code-generated SVG, while uploaded screenshots use object URLs and MSW attachment records. Fonts remain destination-managed `@fontsource/inter` and `@fontsource/poppins` dependencies.
