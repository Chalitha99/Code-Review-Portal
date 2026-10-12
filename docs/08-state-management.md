# State management

Four kinds of state, four tools. Choosing the wrong one is the most common
source of bugs in a React application, so the boundary is written down.

| Kind                                                     | Tool            | Example                                 |
| -------------------------------------------------------- | --------------- | --------------------------------------- |
| **Server state** — owned by the API                      | TanStack Query  | Tasks, checklists, users, notifications |
| **Client state** — owned by the app, survives navigation | Zustand         | Table page size, density                |
| **Form state** — owned by one form                       | React Hook Form | New task step 1                         |
| **URL state** — shareable, survives reload and back      | Search params   | Filters, tab, page number               |
| **Local state** — owned by one component                 | `useState`      | A popover's open flag                   |

## The decision

```
Did it come from the API?                        → TanStack Query. Full stop.
Should a reload or a link preserve it?           → URL
Do two distant components need it, past a route? → Zustand
Otherwise                                        → useState
```

**Server data is never copied into a store.** A copy has no invalidation, no
refetch and no staleness — it is a second source of truth that silently goes
wrong. If a component needs the task list, it calls `useMyTasks()`; the cache
deduplicates.

## Server state — TanStack Query

Every fetch is a hook in a feature's `api/` folder. No component calls `fetch`,
and no component calls `apiClient` directly.

```ts
export function useMyTasks() {
  return useQuery({
    queryKey: qk.tasks.mine(),
    queryFn: () => api.tasks.listMine(),
  });
}
```

### Query keys

Every key comes from the `qk` factory in each hook module (`taskKeys` in `portals/code-review/hooks/useTasks.ts`, `reviewKeys`, `userKeys`, `homeKeys`, `notificationKeys`) and is
hierarchical, so one invalidation covers a family:

```ts
qk.tasks.all(); // ["tasks"]
qk.tasks.mine(); // ["tasks", "mine"]
qk.tasks.mineKpis(); // ["tasks", "mine", "kpis"]
qk.tasks.detail(id); // ["tasks", "detail", id]
```

After a mutation, invalidate the narrowest key that covers what changed:

```ts
onSuccess: () => queryClient.invalidateQueries({ queryKey: qk.tasks.all() });
```

### Defaults

Set once in `src/lib/queryClient.ts`: a `staleTime` that avoids refetching on
every focus, one retry, and no retry on a 4xx — retrying a 403 cannot succeed.

### Mutations

Invalidate rather than hand-patch the cache. Optimistic updates only where the
latency is genuinely felt and the rollback path is written.

On sign-out, `queryClient.clear()` — not `invalidateQueries`. The next user must
not see a flash of the previous user's data.

## Client state — Zustand

One store today, and that is deliberate.

```ts
// the three stores listed above
{
  pageSizeByTable: Record<string, number>,  // keyed by table id
  density: "comfortable" | "compact",
}
```

Persisted to `localStorage` under `sdp:ui-preferences` via `persist` +
`createJSONStorage`. It qualifies because it is genuinely cross-component, must
survive a reload, and belongs to no single screen.

**What is deliberately not in the store:** the notification panel's open flag.
It belongs to one component, no other component reads it, and it must not
survive a reload — so it is `useState`. Putting ephemeral UI flags in a global
store is how a store becomes a junk drawer.

Rules: one store per concern; selector subscriptions
(`useUiPreferences((s) => s.density)`), never the whole store; actions live in
the store, not spread across components; anything persisted gets a versioned
`name` so a shape change can be migrated.

## Form state — React Hook Form

Uncontrolled by default, validated by Zod through `zodResolver`.

```tsx
const form = useForm<TaskDetailsStep>({
  resolver: zodResolver(taskDetailsStepSchema),
  mode: 'onBlur',
});
```

Two rules that are not optional:

- **`useWatch({ control })`, never `form.watch()`.** `watch()` subscribes
  outside React's rendering model and trips `react-hooks/incompatible-library`.
- **`Controller` for controlled components** — Select, Checkbox, RadioGroup.

Multi-step wizard state lives in the parent's form instance, so a Back
navigation preserves everything. Step gating is a pure function
(`domain/stepperRules.ts`), not scattered `disabled={}` expressions.

## URL state

Filters, the active tab, page number and sort belong in the URL, because a user
expects to share the link and get the same view.

```ts
const [searchParams, setSearchParams] = useSearchParams();
```

The current exception is table page size, which is a personal preference rather
than part of the view, so it lives in the persisted store.

## Local state

`useState` for everything else: open/closed flags, hover, focus, the value of a
field that is not part of a form.

Derive during render rather than storing:

```tsx
// Bad
const [full, setFull] = useState('');
useEffect(() => setFull(`${first} ${last}`), [first, last]);

// Good
const full = `${first} ${last}`;
```
