# API architecture

## The layers

```
component  →  useQuery/useMutation (feature api/)  →  apiClient  →  fetch
                                          ↓
                                  Zod contract parse
```

Each arrow is one-way and each layer has one job:

| Layer                  | Responsibility                                                                                          |
| ---------------------- | ------------------------------------------------------------------------------------------------------- |
| `src/lib/apiClient.ts` | The **only** place `fetch` is called. Base URL, headers, JSON, error normalisation, contract validation |
| `packages/contracts`   | Zod schema per payload; the types are inferred from the schemas                                         |
| feature `api/`         | Query and mutation hooks, keys, invalidation                                                            |
| component              | Renders the result. Never fetches.                                                                      |

## The client

```ts
const task = await apiClient.get('/tasks/t-001', taskSchema);
```

The schema is a required argument, not an option. That is what makes contract
validation impossible to forget: there is no overload that skips it.

Responsibilities: prefix `VITE_API_BASE_URL`, set headers, send credentials,
parse JSON, throw a normalised error on a non-2xx, and parse the body through
the schema.

## Contracts

Every payload has a Zod schema in `packages/contracts/src/`, and **types are
inferred, never hand-written**:

```ts
export const taskSchema = z.object({
  id: z.string(),
  title: z.string().min(1),
  status: taskStatusSchema,
  createdAt: z.iso.datetime(),
  reviewerEmail: z.email().optional(),
});
export type Task = z.infer<typeof taskSchema>;
```

A hand-written type says what you _believe_ the API returns. A schema _checks_.
When the backend changes shape, the failure is at the boundary with the path of
the offending field, not `undefined` three components deep.

Zod 4 notes: `z.email()` and `z.iso.datetime()` are top-level, not `z.string().email()`.
Avoid `.default()` on a schema used with `zodResolver` — it makes the input and
output types diverge, which breaks the resolver's inference.

## Errors

Every failure is normalised into one shape:

```ts
class ApiError extends Error {
  status: number;
  code: string;
  details?: unknown;
}
```

with a `ContractViolationError` subclass for a response that fetched fine but
failed validation. (Written with explicit field assignments, because
`erasableSyntaxOnly` bans constructor parameter properties.)

Components read `error.message` for the user and log `error` for the developer.
`error.status` decides the treatment: 401 → sign in, 403 → not-authorised, 404 →
empty state, 5xx → retry affordance.

## Query key convention

Keys are hierarchical and always from the factory:

```ts
[
  'tasks',
] // everything task-shaped
[
  ('tasks', 'mine')
] // my list
[
  ('tasks', 'mine', 'kpis')
] // my KPIs
[('tasks', 'detail', id)]; // one task
```

so `invalidateQueries({ queryKey: qk.tasks.all() })` after a mutation refreshes
the list, the KPI row and any open detail at once.

## Adding an endpoint

1. Schema in `packages/contracts/src/<domain>.ts`, exported from its `index.ts`.
2. Handler in `src/mocks/handlers/<domain>Handlers.ts`, including the
   authorization check.
3. Key in the owning hook module (`taskKeys`, `reviewKeys`, `userKeys`, …).
4. Hook in the feature's `api/`.
5. Test the hook against MSW; test the rule it enforces in `domain/`.

### Batch endpoints

Where a user action produces many changes at once, take them in one request
rather than looping the single-record endpoint. The worked example is question
reordering:

```
PATCH /api/checklist-categories/:categoryId/question-order   # inside one category
PATCH /api/checklist-categories/order                        # the categories themselves
PATCH /api/task-types/order
{ "ids": ["q-code-4", "q-code-1", "q-code-2", …] }
```

Three things about that payload are deliberate and generalise:

- **Ids in order, not `{ id, order }` pairs.** The order numbers are derived from
  the array position on the server, so a duplicate or a negative order is
  unrepresentable rather than something to validate and reject.
- **Scoped to the unit the field belongs to.** `order` is per category for
  questions, so the category is in the path; categories and task types have a
  flat global order and take none. A global question endpoint would accept
  payloads spanning categories, which has no meaning.
- **Complete, and checked.** The ids must be exactly that collection's records —
  422 `ORDER_INCOMPLETE` otherwise. A client that sent only the rows on its
  current page would otherwise renumber a subset and orphan the rest, which is
  the specific way a paginated list corrupts a global sequence.

All three share **one `reorderInputSchema`** (`{ ids }`) rather than a
`questionIds` / `categoryIds` / `taskTypeIds` apiece. The URL already says which
collection; the body never has to.

> **Register the `/order` routes BEFORE their `:id` siblings.**
> `PATCH /api/checklist-categories/order` also matches
> `/api/checklist-categories/:categoryId`, and MSW resolves handlers in array
> order — declared the other way round, a reorder is silently served as a rename
> of a category whose id is the literal string `order`, returning 404 or, worse,
> a plausible-looking success. Same for `/api/task-types/order`. Express and
> ASP.NET route tables have the identical hazard, so this survives Phase 2.

Apply the whole change in one assignment so a rejected payload leaves the record
untouched rather than half-applied. The arithmetic lives in `lib/` — see
`resequenceRecords`, which is constrained to `{ id, order }` rather than to a
question so all three endpoints share it — so the handler and the UI reject the
same payloads.

A **delete** resequences too (`resequenceAfterRemoval`), so removing a middle row
closes its gap instead of leaving `1,2,4,5` for the next append to trip over.

## Conventions

- REST-ish paths, plural nouns: `/tasks`, `/tasks/:id`, `/tasks/:id/reviews`.
- `GET` never mutates.
- Lists are `{ items, pagination: { page, pageSize, total } }` — never a bare array, so
  pagination can be added without a breaking change.
  - This said `{ items, total, page, pageSize }` (flat) while `GET /api/tasks` and
    `hooks/useTasks.ts` both used the nested `pagination` object. The implementation is the
    shape that ships; the doc is corrected to match it.
  - **In Phase 1 the object is synthetic** — the handler accepts only `scope`, ignores
    `page`/`pageSize`, and returns `page: 1` with `pageSize` set to the whole result. Every grid
    paginates client-side in `DataTable`. The envelope exists so that Phase 2 can start paging for
    real without a breaking change, which is the whole point of it being there early. Note that
    `packages/types`' `taskFilterSchema` already declares the `page`/`pageSize` query contract and
    is not yet imported by anything.
- Timestamps are ISO 8601 UTC; formatting is the client's job.
- Errors are `{ code, message, details? }` with a meaningful HTTP status.
