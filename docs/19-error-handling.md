# Error handling and observability

An error the user cannot act on is a bug in the error handling, not just in the
code that failed.

## Three layers

| Layer                 | Catches             | User sees                                |
| --------------------- | ------------------- | ---------------------------------------- |
| **Error boundary**    | A render-time crash | The page is replaced; the shell survives |
| **Query error state** | A failed fetch      | Inline message with a retry              |
| **Mutation error**    | A failed write      | Inline message; their input is preserved |

## Error boundaries

`ErrorBoundary` is attached to every route branch, so a crash in a page loses
the page, not the app bar and not the user's place in the app. It renders the
error, a retry, and a link home — and it is also what renders the 403 that
`RequireRoles` throws.

Development shows the stack. Production shows a message and logs the detail.

## Query errors

The standard is that every screen handles all four states explicitly:

```tsx
const { data, isPending, isError, error, refetch } = useMyTasks();

if (isPending) return <TableSkeleton />;
if (isError) return <ErrorState error={error} onRetry={refetch} />;
```

A screen that renders only the success case is unfinished — the loading and
error paths are the ones a user hits on the day something is wrong.

> **Known gap.** The built screens render loading (skeletons) and success, but a
> failed query currently degrades to an empty table rather than an error with a
> retry, and there is no shared `ErrorState` component yet. Tracked in
> [the backlog](./backlog.md).

The retry policy lives in `queryClient.ts`: one retry, and **none on 4xx**.
Retrying a 403 cannot succeed; it only delays the message.

## Mutation errors

Three requirements, in order of how often they are forgotten:

1. **Never clear the form.** Losing twenty minutes of typing to a 500 is worse
   than the 500.
2. **Put the message where the action was** — beside the button, not in a toast
   that has already faded.
3. **Map field errors back to fields.** A 422 carries `fieldErrors`; feed them
   into RHF with `setError` so each message lands on its input.

## Messages

The user's message says what happened and what to do:

| Bad             | Good                                                  |
| --------------- | ----------------------------------------------------- |
| "Error 500"     | "We could not save your task. Try again in a moment." |
| "Invalid input" | "The description needs at least 20 characters."       |
| "Failed"        | "You do not have permission to review this task."     |

Copy lives in `src/content/common.json` under `errors`, so a message can be
changed without touching code — and translated later. It is in `common.json`
rather than a dedicated `errors.json` because every error string so far is one
the whole application shares; split it out when a feature needs its own.

The developer's detail is separate and complete: status, code, path, and the
contract-violation path if validation was what failed.

## Toasts vs inline

**Toast** for a transient success, or a background failure the user need not act
on. It disappears; anything requiring action cannot live there.

**Inline** for anything the user must fix or retry. Errors are inline by
default; a toast is the exception.

## Logging

One boundary: `src/lib/logger.ts`. Nothing else calls `console` in application
code.

```ts
logger.error('task.submit.failed', {
  taskId,
  status: error.status,
  code: error.code,
});
```

Structured — an event name plus context — because a formatted string cannot be
searched or aggregated. **Never log a token, a password or a full user record.**

Levels are `debug | info | warn | error`, with a floor of `debug` in development
and `warn` in production, so a build stays quiet by default. Development writes
to the console; production is where a real sink (Sentry, App Insights) attaches.
The boundary exists so that is a one-file change.

## Contract violations

A `ContractViolationError` means the API returned something the schema did not
expect. It is treated as an error, loudly, rather than tolerated:

```
ContractViolationError: GET /api/tasks/t-001
  items.3.reviewerEmail: expected string, received null
```

The path is the point — it names the field and the index, which turns a
five-minute hunt into a one-line fix. Silently coercing bad data is how a
`undefined is not a function` appears three components away from its cause.

## Uncaught

Not yet wired. `window.onerror` and `unhandledrejection` should route to
`logger.error` so a failure outside React's tree is recorded rather than lost to
a console nobody was watching — one small addition in `main.tsx`, tracked in
[the backlog](./backlog.md).
