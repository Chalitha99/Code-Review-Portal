# Forms and validation

One stack: **React Hook Form** for state, **Zod** for rules, `@hookform/resolvers`
to join them. No second pattern.

## The shape of a form

```tsx
const form = useForm<TaskDetailsStep>({
  resolver: zodResolver(taskDetailsStepSchema),
  mode: 'onBlur',
  defaultValues: { customerId: '', taskType: undefined, description: '' },
});
```

`mode: "onBlur"` is the default choice: validating on every keystroke shouts at
someone who is still typing; validating only on submit hides the problem until
the end. After a field has errored once, RHF revalidates it on change, which is
the behaviour people expect.

## Where the rules live

Schemas live in the feature's `domain/` folder, beside the other business rules,
because a validation rule _is_ a business rule.

```ts
// features/tasks/domain/taskSchemas.ts
export const taskDetailsStepSchema = z.object({
  customerId: z.string().min(1),
  taskType: taskTypeSchema,
  description: z.string().min(20).max(2000),
});
export type TaskDetailsStep = z.infer<typeof taskDetailsStepSchema>;
```

**No `.default()` on a schema used with `zodResolver`.** It makes the schema's
input and output types diverge, and the resolver's generic inference breaks.
Supply defaults through `defaultValues` instead.

## Messages come from content, not from schemas

Zod messages are developer-facing. User-facing copy lives in `src/content/`, so
that copy changes are not code changes and the app can be translated.

## Binding fields

Native inputs register directly:

```tsx
<Input {...form.register('description')} />
```

Controlled components — Select, Checkbox, RadioGroup — go through `Controller`:

```tsx
<Controller
  control={form.control}
  name="taskType"
  render={({ field }) => (
    <Select value={field.value} onValueChange={field.onChange} onBlur={field.onBlur}>
      …
    </Select>
  )}
/>
```

Reading a value with `setValue` during render trips
`react-hooks/incompatible-library`; `Controller` is the supported path.

## Watching values

**`useWatch`, never `form.watch()`.**

```tsx
const [customerId, version] = useWatch({
  control: form.control,
  name: ['customerId', 'version'],
});
const derivedTitle = buildTaskTitle(customerId, version);
```

`watch()` subscribes outside React's rendering model. `useWatch` is a hook and
re-renders only the component that calls it — which is also why the live title
derivation is cheap.

## Accessible fields

`Field` wires the whole set: label, control, description, error.

```tsx
<Field
  label="Description"
  htmlFor="description"
  error={errors.description?.message}
  hint="What changed, and why."
>
  <Textarea id="description" {...form.register('description')} />
</Field>
```

It supplies `aria-describedby`, `aria-invalid`, `role="alert"` on the error, and
a programmatic label association. A form field assembled by hand will not be
accessible; use `Field`.

Required fields are marked in the label text, not by colour or an asterisk
alone. On a failed submit, focus moves to the first invalid field.

## Multi-step wizards

The New Review Task flow is five steps: Task Details → Developer Quality
Checklist → Screenshots → Review & Submit → Confirmed.

- **One form instance in the parent.** Each step renders a slice of it, so going
  Back preserves everything without a draft store.
- **Gating is a pure function.** `domain/stepperRules.ts` returns the blockers:

```ts
export function taskDetailsBlockers(values: Partial<TaskDetailsStep>): StepBlocker[];
export function countUnsatisfied(blockers: readonly StepBlocker[]): number;
export function canAdvance(blockers: readonly StepBlocker[]): boolean;
```

The same call drives the "Before you can continue" panel and the Next button's
`disabled`, so what the user reads and what the button does cannot disagree.
It is unit-tested without rendering a thing.

- **Validate the current step only**, not the whole schema, so step 4 errors
  never appear on step 1.
- **Optional steps say so.** Step 3 (screenshots) can be skipped, and the
  stepper labels it optional.

## Submitting

Disable the submit button while the mutation is in flight and show progress in
the button, so a double-submit is impossible without a guard flag.

Success: a toast, then navigate. Failure: keep the user's input, show the error
inline, and never clear the form.

## Testing

Validation rules are unit-tested against the schema and the domain function —
no rendering. Interaction (focus order, error announcement, gating) is tested by
driving the form with `userEvent`.

One caveat worth knowing: **Radix RadioGroup does not select on arrow keys** in
either jsdom or real Chromium, verified against a bare
`@radix-ui/react-radio-group` probe. Tests assert focus movement plus Space,
which is the actual behaviour.
